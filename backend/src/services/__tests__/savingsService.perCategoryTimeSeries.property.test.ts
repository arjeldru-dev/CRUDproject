/**
 * Property-based test for the PER-CATEGORY cumulative savings time series
 * (`buildTimeSeries(..., { view: 'byCategory' })`) in the savings compute service.
 *
 * Feature: savings-piggybank, Property 20: Per-category cumulative accrued series
 *
 * Property 20 (design.md, Requirement 6.12): when the by-category view is
 * requested, `buildTimeSeries` returns, for EACH category, a cumulative-accrued
 * series in which:
 *   - points are ordered by ascending `periodEnd`,
 *   - each point carries that category's cumulative `Category_Accrued_Savings`
 *     as of the point's `periodEnd` (accrual only — usage never enters here),
 *   - the running balance is non-decreasing (monotonic) and 2-decimal-rounded,
 *     within `[0.00, 999,999,999.99]`,
 *   - the per-category series relate consistently to the total-view series over
 *     the same inputs (the sum of every category's final cumulative accrued
 *     equals the total view's final cumulative accrued), and
 *   - the returned series list is deterministically ordered by category name
 *     ascending, tie-broken by category id.
 *
 * The test builds an INDEPENDENT oracle: for each category it re-derives the
 * contributing periods via `computeCategorySavings` (the ground-truth per-period
 * figures, validated separately by Properties 6–10), then independently orders
 * that category's periods by ascending `periodEnd` and accumulates its own
 * running total with the documented rounding/clamping and default windowing.
 * `buildTimeSeries`'s job under test is the PER-CATEGORY ORDERING + ACCUMULATION
 * + WINDOWING + SERIES-ORDERING logic, so using the period figures as the oracle
 * isolates exactly that behavior.
 *
 * Validates: Requirements 6.12
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/savingsService.perCategoryTimeSeries.property.test.ts
 * Exits non-zero if any assertion / property fails.
 *
 * Uses `fast-check` (already installed in backend/node_modules) with a reduced
 * generated-case count for fast local execution.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import {
  buildTimeSeries,
  computeCategorySavings,
  CategoryInput,
  ExpenseInput,
  CategorySeries,
} from '../savingsService';
import { getLocalDateParts } from '../gamificationService';
import { ValidationError } from '../../errors';
import type { BudgetPeriod } from '../budgetPeriodService';

const NUM_RUNS = 30; // reduced run count for fast local execution
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Upper bound for a cumulative balance point (Requirement 6.1, applied per series). */
const MAX_CUMULATIVE_BALANCE = 999_999_999.99;
/** Default window size when no explicit range is requested (Requirement 6.4). */
const DEFAULT_TIMESERIES_LIMIT = 12;
/** A limit large enough to disable per-series windowing for the consistency check. */
const UNWINDOWED_LIMIT = 100_000;

/** Same 2-decimal rounding the service uses (Math.round((n + EPSILON) * 100) / 100). */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
    console.error(`  \u2717 ${name}`);
    console.error(`    ${(err as Error).message}`);
  }
}

// ── Arbitraries (mirrors the sibling savingsService property tests) ─────────

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'Asia/Kolkata', // +05:30
  'Asia/Kathmandu', // +05:45
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Kiritimati', // +14:00
];

const tzArb = fc.constantFrom(...TIMEZONES);
const periodArb = fc.constantFrom<BudgetPeriod>('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');
const scheduleArb = fc
  .subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 0, maxLength: 7 })
  .map((s) => [...s].sort((a, b) => a - b));
const nowArb = fc.date({
  min: new Date('2025-01-01T00:00:00.000Z'),
  max: new Date('2027-12-31T00:00:00.000Z'),
  noInvalidDate: true,
});

// Generated per-category configuration (id/name assigned by index later).
const categoryGenArb = fc.record({
  period: periodArb,
  // Mostly-positive limits so periods actually accrue savings and each series
  // carries non-trivial values.
  limitAmount: fc.oneof(
    fc.constant(0),
    fc.double({ min: 0, max: 3000, noNaN: true, noDefaultInfinity: true }).map(round2),
  ),
  monthlyStartDay: fc.oneof(
    fc.constant<number | null>(null),
    fc.integer({ min: 1, max: 28 }),
    fc.constant(-1),
  ),
  weeklyStartDay: fc.oneof(fc.constant<number | null>(null), fc.integer({ min: 0, max: 6 })),
  customPeriodDays: fc.oneof(fc.constant<number | null>(null), fc.integer({ min: 1, max: 30 })),
  schedule: scheduleArb,
  overrideSpecs: fc.array(
    fc.record({ offsetDays: fc.integer({ min: 0, max: 160 }), funded: fc.boolean() }),
    { maxLength: 6 },
  ),
  // At least one expense so closed periods can be enumerated for the series.
  expenseSpecs: fc.array(
    fc.record({
      offsetDays: fc.integer({ min: 1, max: 150 }),
      amount: fc.double({ min: 0, max: 400, noNaN: true, noDefaultInfinity: true }).map(round2),
    }),
    { minLength: 1, maxLength: 10 },
  ),
});

// A user has between 0 and 5 categories. Names are assigned so that ties on name
// (forcing the id tie-break) can occur.
const userArb = fc.record({
  categories: fc.array(categoryGenArb, { minLength: 0, maxLength: 5 }),
  // Name suffixes chosen from a tiny alphabet so duplicate names are likely,
  // exercising the id tie-break in the series ordering.
  nameKeys: fc.array(fc.constantFrom('A', 'B', 'B', 'C'), { minLength: 0, maxLength: 5 }),
  now: nowArb,
  tz: tzArb,
});

interface CategoryGen {
  period: BudgetPeriod;
  limitAmount: number;
  monthlyStartDay: number | null;
  weeklyStartDay: number | null;
  customPeriodDays: number | null;
  schedule: number[];
  overrideSpecs: Array<{ offsetDays: number; funded: boolean }>;
  expenseSpecs: Array<{ offsetDays: number; amount: number }>;
}

/** Local calendar date key ('YYYY-MM-DD') for an instant in a timezone. */
function localDateKey(instant: Date, tz: string): string {
  const { year, month, day } = getLocalDateParts(instant, tz);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Materialize a generated category into a CategoryInput + its expenses. */
function materialize(
  gen: CategoryGen,
  index: number,
  nameKey: string | undefined,
  now: Date,
  tz: string,
): { category: CategoryInput; expenses: ExpenseInput[] } {
  const id = `cat-${index}`;
  const overrides = new Map<string, boolean>();
  for (const o of gen.overrideSpecs) {
    const d = new Date(now.getTime() - o.offsetDays * MS_PER_DAY);
    overrides.set(localDateKey(d, tz), o.funded);
  }

  const category: CategoryInput = {
    id,
    // Deliberately allow duplicate names (e.g. two "Cat-B") to exercise the
    // id tie-break in the deterministic series ordering.
    name: `Cat-${nameKey ?? String(index)}`,
    limitAmount: gen.limitAmount,
    period: gen.period,
    monthlyStartDay: gen.monthlyStartDay,
    weeklyStartDay: gen.weeklyStartDay,
    customPeriodDays: gen.customPeriodDays,
    anchorDate: null,
    schedule: gen.schedule,
    overrides,
  };

  const expenses: ExpenseInput[] = gen.expenseSpecs.map((e) => ({
    categoryId: id,
    amount: e.amount,
    createdAt: new Date(now.getTime() - e.offsetDays * MS_PER_DAY),
  }));

  return { category, expenses };
}

interface OraclePoint {
  periodEndMs: number;
  cumulativeBalance: number;
}

/**
 * INDEPENDENT full (unwindowed) per-category series oracle.
 *
 * Uses `computeCategorySavings` for the ground-truth per-period figures of ONE
 * category, orders that category's periods by ascending `periodEnd` (tie-broken
 * by `periodStart`, exactly as the service documents), then accumulates a
 * running total with the documented rounding and `[0, MAX]` clamping. Returns
 * `null` when the category's config cannot be computed (mirrors the service's
 * per-category try/catch skip). This is the reference the windowed
 * `buildTimeSeries` by-category output is checked against.
 */
function categorySeriesOracle(
  category: CategoryInput,
  expenses: ExpenseInput[],
  now: Date,
  tz: string,
): OraclePoint[] | null {
  let cs;
  try {
    // ACCRUED savings only, so usage is intentionally empty.
    cs = computeCategorySavings(category, expenses, [], { enabled: true, enabledAt: null }, now, tz);
  } catch {
    return null;
  }

  const ordered = [...cs.periods].sort((a, b) => {
    const endDiff = a.periodEnd.getTime() - b.periodEnd.getTime();
    if (endDiff !== 0) return endDiff;
    return a.periodStart.getTime() - b.periodStart.getTime();
  });

  const out: OraclePoint[] = [];
  let running = 0;
  for (const p of ordered) {
    running = round2(running + p.periodSavings);
    if (running < 0) running = 0;
    if (running > MAX_CUMULATIVE_BALANCE) running = MAX_CUMULATIVE_BALANCE;
    out.push({ periodEndMs: p.periodEnd.getTime(), cumulativeBalance: running });
  }
  return out;
}

/** Apply the service's default windowing (most recent min(limit, total) points). */
function windowOracle(points: OraclePoint[], limit: number): OraclePoint[] {
  const keep = Math.min(limit, points.length);
  return keep >= points.length ? points : points.slice(points.length - keep);
}

interface Built {
  categories: CategoryInput[];
  byCat: Map<string, ExpenseInput[]>;
}

function build(gens: CategoryGen[], nameKeys: string[], now: Date, tz: string): Built {
  const materialized = gens.map((g, i) => materialize(g, i, nameKeys[i], now, tz));
  const categories = materialized.map((m) => m.category);
  const byCat = new Map<string, ExpenseInput[]>();
  for (const m of materialized) byCat.set(m.category.id, m.expenses);
  return { categories, byCat };
}

console.log('savingsService — Property 20: Per-category cumulative accrued series');
console.log('// Feature: savings-piggybank, Property 20: Per-category cumulative accrued series');

// ── Property 20 (a): each category's default series equals the most recent ────
// min(12, total) oracle points — ordered, cumulative, monotonic, bounded, 2dp. ─
//
// Validates: Requirement 6.12
test('each category series is ordered, monotonic, bounded, 2dp, and equals its own min(12, total) oracle', () => {
  fc.assert(
    fc.property(userArb, ({ categories: gens, nameKeys, now, tz }) => {
      const { categories, byCat } = build(gens, nameKeys, now, tz);

      const result = buildTimeSeries(categories, byCat, { enabled: true, enabledAt: null }, now, tz, {
        view: 'byCategory',
      });
      assert.strictEqual(result.view, 'byCategory', 'view must echo byCategory');
      const series = result.view === 'byCategory' ? result.series : [];

      for (const s of series) {
        const cat = categories.find((c) => c.id === s.categoryId);
        assert.ok(cat, `series references unknown categoryId ${s.categoryId}`);
        assert.strictEqual(s.categoryName, cat!.name, `series name mismatch for ${s.categoryId}`);

        const fullOracle = categorySeriesOracle(cat!, byCat.get(s.categoryId) ?? [], now, tz);
        assert.ok(fullOracle, `series present for a category that the oracle could not compute (${s.categoryId})`);
        const expected = windowOracle(fullOracle!, DEFAULT_TIMESERIES_LIMIT);

        assert.strictEqual(
          s.points.length,
          expected.length,
          `series ${s.categoryId} length ${s.points.length} != min(12, total)=${expected.length}`,
        );

        for (let i = 0; i < s.points.length; i++) {
          const pt = s.points[i];
          const gotMs = new Date(pt.periodEnd).getTime();
          assert.strictEqual(gotMs, expected[i].periodEndMs, `series ${s.categoryId}: periodEnd mismatch at ${i}`);
          assert.strictEqual(
            pt.cumulativeBalance,
            expected[i].cumulativeBalance,
            `series ${s.categoryId}: cumulativeBalance mismatch at ${i}: got ${pt.cumulativeBalance}, expected ${expected[i].cumulativeBalance}`,
          );

          // Bounds + 2-decimal rounding (Requirement 6.1 applied per series).
          assert.ok(
            pt.cumulativeBalance >= 0 && pt.cumulativeBalance <= MAX_CUMULATIVE_BALANCE,
            `series ${s.categoryId}: balance ${pt.cumulativeBalance} out of [0, ${MAX_CUMULATIVE_BALANCE}] at ${i}`,
          );
          assert.strictEqual(
            round2(pt.cumulativeBalance),
            pt.cumulativeBalance,
            `series ${s.categoryId}: balance ${pt.cumulativeBalance} not 2dp at ${i}`,
          );

          // Ascending periodEnd + non-decreasing (monotonic) balance per category.
          if (i > 0) {
            const prev = s.points[i - 1];
            assert.ok(
              gotMs >= new Date(prev.periodEnd).getTime(),
              `series ${s.categoryId}: periodEnd not ascending at ${i}`,
            );
            assert.ok(
              pt.cumulativeBalance >= prev.cumulativeBalance,
              `series ${s.categoryId}: balance decreased at ${i}: ${prev.cumulativeBalance} -> ${pt.cumulativeBalance}`,
            );
          }
        }
      }
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 20 (b): the series LIST is deterministically ordered by category ─
// name ascending, tie-broken by category id — and covers exactly the ──────────
// categories the oracle can compute (no missing, no extras). ──────────────────
//
// Validates: Requirement 6.12 (deterministic series ordering)
test('series list is ordered by name asc (id tie-break) and covers exactly the computable categories', () => {
  fc.assert(
    fc.property(userArb, ({ categories: gens, nameKeys, now, tz }) => {
      const { categories, byCat } = build(gens, nameKeys, now, tz);

      const result = buildTimeSeries(categories, byCat, { enabled: true, enabledAt: null }, now, tz, {
        view: 'byCategory',
      });
      const series: CategorySeries[] = result.view === 'byCategory' ? result.series : [];

      // Deterministic ordering: name asc, then id asc.
      for (let i = 1; i < series.length; i++) {
        const prev = series[i - 1];
        const cur = series[i];
        const nameCmp = prev.categoryName < cur.categoryName ? -1 : prev.categoryName > cur.categoryName ? 1 : 0;
        if (nameCmp === 0) {
          assert.ok(
            prev.categoryId <= cur.categoryId,
            `series not id-ordered within equal names at ${i}: ${prev.categoryId} then ${cur.categoryId}`,
          );
        } else {
          assert.ok(nameCmp < 0, `series not name-ordered at ${i}: '${prev.categoryName}' then '${cur.categoryName}'`);
        }
      }

      // Coverage: the set of series ids equals the set of categories the oracle computes.
      const expectedIds = categories
        .filter((c) => categorySeriesOracle(c, byCat.get(c.id) ?? [], now, tz) !== null)
        .map((c) => c.id)
        .sort();
      const gotIds = series.map((s) => s.categoryId).sort();
      assert.deepStrictEqual(gotIds, expectedIds, 'series categoryIds must match the computable categories exactly');

      // Determinism: recomputing yields byte-identical series.
      const again = buildTimeSeries(categories, byCat, { enabled: true, enabledAt: null }, now, tz, {
        view: 'byCategory',
      });
      const againSeries = again.view === 'byCategory' ? again.series : [];
      assert.strictEqual(JSON.stringify(againSeries), JSON.stringify(series), 'by-category series is not deterministic');
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 20 (c): per-category series relate consistently to the total view ─
// over the same inputs — the sum of every category's final cumulative accrued ──
// equals the total view's final cumulative accrued. (Unwindowed on both sides ──
// via a large limit so windowing does not obscure the relationship.) ───────────
//
// Validates: Requirement 6.12 (consistency with the total-view series)
test('sum of per-category final cumulative accrued equals the total-view final cumulative accrued', () => {
  fc.assert(
    fc.property(userArb, ({ categories: gens, nameKeys, now, tz }) => {
      const { categories, byCat } = build(gens, nameKeys, now, tz);

      const byCategory = buildTimeSeries(categories, byCat, { enabled: true, enabledAt: null }, now, tz, {
        view: 'byCategory',
        limit: UNWINDOWED_LIMIT,
      });
      const total = buildTimeSeries(categories, byCat, { enabled: true, enabledAt: null }, now, tz, {
        view: 'total',
        limit: UNWINDOWED_LIMIT,
      });

      const series = byCategory.view === 'byCategory' ? byCategory.series : [];
      const totalPoints = total.view === 'total' ? total.points : [];

      // Sum each category's LAST cumulative accrued (a category with no periods
      // contributes 0 and has no last point).
      let perCategoryFinalSum = 0;
      for (const s of series) {
        if (s.points.length > 0) perCategoryFinalSum += s.points[s.points.length - 1].cumulativeBalance;
      }
      perCategoryFinalSum = round2(perCategoryFinalSum);

      const totalFinal = totalPoints.length > 0 ? totalPoints[totalPoints.length - 1].cumulativeBalance : 0;

      // Because every periodSavings figure is already 2dp, summing 2dp values is
      // exact at 2dp regardless of accumulation order, so the two sides match.
      assert.strictEqual(
        perCategoryFinalSum,
        round2(totalFinal),
        `per-category final sum ${perCategoryFinalSum} != total final ${totalFinal}`,
      );

      // Structural consistency: total is empty iff every per-category series is empty.
      const anyCategoryPoints = series.some((s) => s.points.length > 0);
      assert.strictEqual(
        totalPoints.length > 0,
        anyCategoryPoints,
        'total-view emptiness disagrees with per-category emptiness',
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 20 (d): an inverted range is rejected on the by-category path too. ─
//
// Validates: Requirement 6.12 (range validity shared with 6.8)
test('inverted range (rangeStart > rangeEnd) throws ValidationError on the by-category view', () => {
  fc.assert(
    fc.property(
      userArb,
      fc.integer({ min: 1, max: 200 }),
      fc.integer({ min: 1, max: 200 }),
      ({ categories: gens, nameKeys, now, tz }, gapDays, spanDays) => {
        const { categories, byCat } = build(gens, nameKeys, now, tz);

        const rangeEnd = new Date(now.getTime() - (gapDays + spanDays) * MS_PER_DAY);
        const rangeStart = new Date(now.getTime() - gapDays * MS_PER_DAY);
        assert.ok(rangeStart.getTime() > rangeEnd.getTime(), 'test setup: range must be inverted');

        let threw = false;
        try {
          buildTimeSeries(categories, byCat, { enabled: true, enabledAt: null }, now, tz, {
            view: 'byCategory',
            rangeStart,
            rangeEnd,
          });
        } catch (err) {
          threw = true;
          assert.ok(
            err instanceof ValidationError,
            `expected ValidationError, got ${(err as Error).name}: ${(err as Error).message}`,
          );
        }
        assert.ok(threw, 'inverted range did not throw on by-category view');
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
