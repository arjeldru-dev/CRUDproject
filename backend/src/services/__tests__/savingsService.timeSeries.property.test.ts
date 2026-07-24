/**
 * Property-based test for the cumulative savings time series
 * (`buildTimeSeries`) in the savings compute service.
 *
 * Feature: savings-piggybank, Property 19: Total time series is cumulative accrued, monotonic, ordered, windowed, and range-checked
 *
 * Property 19 (design.md): For any set of categories/transactions producing
 * closed periods, the `view = 'total'` time series is ordered by ascending
 * `periodEnd`; each
 * point's `cumulativeBalance` equals the sum of all `periodSavings` whose
 * `periodEnd <= that point's periodEnd`, lies within `[0.00, 999,999,999.99]`,
 * and is `>=` the previous point's value (non-decreasing); with no range
 * specified the series contains the most recent `min(12, total)` points in
 * ascending order; with a valid range every returned point has
 * `rangeStart <= periodEnd <= rangeEnd` and none outside; and when
 * `rangeStart > rangeEnd` the request is rejected as invalid (throws
 * `ValidationError`) with no points returned.
 *
 * The test builds an INDEPENDENT oracle: it re-derives every closed period's
 * `periodSavings` via `computeCategorySavings` (the ground-truth period figures,
 * validated separately by Properties 6–10), then independently orders those
 * periods by ascending `periodEnd` and accumulates its own running total with
 * the documented rounding/clamping. `buildTimeSeries`'s job under test is the
 * ORDERING + ACCUMULATION + WINDOWING logic layered on top of those figures, so
 * using the period figures as the oracle isolates exactly that behavior.
 *
 * Validates: Requirements 6.1, 6.2, 6.4, 6.5, 6.6, 6.8
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/savingsService.timeSeries.property.test.ts
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
} from '../savingsService';
import { getLocalDateParts } from '../gamificationService';
import { ValidationError } from '../../errors';
import type { BudgetPeriod } from '../budgetPeriodService';

const NUM_RUNS = 100; // minimum 100 generated cases per the task requirement
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Upper bound for a cumulative balance point (Requirement 6.1). */
const MAX_CUMULATIVE_BALANCE = 999_999_999.99;
/** Default window size when no explicit range is requested (Requirement 6.4). */
const DEFAULT_TIMESERIES_LIMIT = 12;

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
  // Mostly-positive limits so periods actually accrue savings and the series
  // carries non-trivial (and occasionally clamp-worthy) values.
  limitAmount: fc.oneof(
    fc.constant(0),
    fc.double({ min: 0, max: 3000, noNaN: true, noDefaultInfinity: true }).map(round2),
  ),
  monthlyStartDay: fc.oneof(fc.constant<number | null>(null), fc.integer({ min: 1, max: 28 }), fc.constant(-1)),
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

// A user has between 0 and 4 categories.
const userArb = fc.record({
  categories: fc.array(categoryGenArb, { minLength: 0, maxLength: 4 }),
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
    name: `Cat-${index}`,
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
 * INDEPENDENT full (unwindowed) series oracle.
 *
 * Collects every closed period across all categories (using `computeCategorySavings`
 * for the ground-truth per-period figures), then, per Requirement 6.1 / design
 * Property 19, emits exactly one data point per contributing closed period, each
 * carrying the cumulative `Total_Accrued_Savings` **as of that period's `periodEnd`**
 * — i.e. the sum of ALL `periodSavings` whose `periodEnd <=` that instant — with the
 * documented 2dp rounding and `[0, MAX]` clamping.
 *
 * Periods from different categories can share an identical `periodEnd` (e.g. two
 * DAILY categories closing on the same day). Ordering such tied periods relative to
 * one another is ambiguous, so this oracle is deliberately **order-independent**
 * (Requirement 7.3): it groups periods by their `periodEnd` instant, advances the
 * running cumulative once per distinct instant by the full sum of that instant's
 * periods, then emits one point per period in the group all carrying that same full
 * through-instant cumulative. This is the reference the windowed `buildTimeSeries`
 * output is checked against.
 */
function fullSeriesOracle(
  categories: CategoryInput[],
  expensesByCategory: Map<string, ExpenseInput[]>,
  now: Date,
  tz: string,
): OraclePoint[] {
  const periods: Array<{ startMs: number; endMs: number; savings: number }> = [];
  for (const c of categories) {
    const cs = computeCategorySavings(c, expensesByCategory.get(c.id) ?? [], [], { enabled: true, enabledAt: null }, now, tz);
    for (const p of cs.periods) {
      periods.push({
        startMs: p.periodStart.getTime(),
        endMs: p.periodEnd.getTime(),
        savings: p.periodSavings,
      });
    }
  }

  // Group by `periodEnd` instant so tied periods share one through-instant total.
  const byEnd = new Map<number, number[]>(); // endMs -> savings of periods at that instant
  for (const p of periods) {
    const bucket = byEnd.get(p.endMs);
    if (bucket) bucket.push(p.savings);
    else byEnd.set(p.endMs, [p.savings]);
  }
  const endMsAsc = [...byEnd.keys()].sort((a, b) => a - b);

  const out: OraclePoint[] = [];
  let running = 0;
  for (const endMs of endMsAsc) {
    const bucket = byEnd.get(endMs) as number[];
    for (const savings of bucket) {
      running = round2(running + savings);
    }
    if (running < 0) running = 0;
    if (running > MAX_CUMULATIVE_BALANCE) running = MAX_CUMULATIVE_BALANCE;
    // One point per contributing period (Requirement 6.1), each carrying the full
    // through-instant cumulative.
    for (let k = 0; k < bucket.length; k++) {
      out.push({ periodEndMs: endMs, cumulativeBalance: running });
    }
  }
  return out;
}

console.log('savingsService — Property 19: Total time series is cumulative accrued, monotonic, ordered, windowed, and range-checked');
console.log(
  '// Feature: savings-piggybank, Property 19: Total time series is cumulative accrued, monotonic, ordered, windowed, and range-checked',
);

// ── Property 19 (a): default (no range) — ordered, cumulative, monotonic, ─────
// bounded, and windowed to the most recent min(12, total) points. ─────────────
//
// Validates: Requirements 6.1, 6.2, 6.4, 6.6
test('default series is ordered, monotonic, bounded, and equals the most recent min(12, total) oracle points', () => {
  fc.assert(
    fc.property(userArb, ({ categories: gens, now, tz }) => {
      const materialized = gens.map((g, i) => materialize(g, i, now, tz));
      const categories = materialized.map((m) => m.category);
      const byCat = new Map<string, ExpenseInput[]>();
      for (const m of materialized) byCat.set(m.category.id, m.expenses);

      const result = buildTimeSeries(categories, byCat, { enabled: true, enabledAt: null }, now, tz);
      const series = result.view === 'total' ? result.points : [];
      const oracle = fullSeriesOracle(categories, byCat, now, tz);

      // Requirement 6.4: most recent min(12, total) points, ascending.
      const keep = Math.min(DEFAULT_TIMESERIES_LIMIT, oracle.length);
      const expected = oracle.slice(oracle.length - keep);

      assert.strictEqual(
        series.length,
        expected.length,
        `default series length ${series.length} != min(12, total)=${expected.length} (total=${oracle.length})`,
      );

      for (let i = 0; i < series.length; i++) {
        const gotMs = new Date(series[i].periodEnd).getTime();
        assert.strictEqual(
          gotMs,
          expected[i].periodEndMs,
          `periodEnd mismatch at index ${i}: got ${series[i].periodEnd}`,
        );
        assert.strictEqual(
          series[i].cumulativeBalance,
          expected[i].cumulativeBalance,
          `cumulativeBalance mismatch at index ${i}: got ${series[i].cumulativeBalance}, expected ${expected[i].cumulativeBalance}`,
        );
      }

      // Requirements 6.1, 6.2, 6.6: bounds, ascending order, non-decreasing balance.
      for (let i = 0; i < series.length; i++) {
        const pt = series[i];
        assert.ok(
          pt.cumulativeBalance >= 0 && pt.cumulativeBalance <= MAX_CUMULATIVE_BALANCE,
          `cumulativeBalance ${pt.cumulativeBalance} out of [0, ${MAX_CUMULATIVE_BALANCE}] at index ${i}`,
        );
        assert.strictEqual(
          round2(pt.cumulativeBalance),
          pt.cumulativeBalance,
          `cumulativeBalance ${pt.cumulativeBalance} is not 2-decimal-rounded at index ${i}`,
        );
        if (i > 0) {
          const prev = series[i - 1];
          assert.ok(
            new Date(pt.periodEnd).getTime() >= new Date(prev.periodEnd).getTime(),
            `periodEnd not ascending at index ${i}`,
          );
          assert.ok(
            pt.cumulativeBalance >= prev.cumulativeBalance,
            `cumulativeBalance decreased at index ${i}: ${prev.cumulativeBalance} -> ${pt.cumulativeBalance}`,
          );
        }
      }
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 19 (b): an explicit limit windows to the most recent min(limit, total). ──
//
// Validates: Requirements 6.4 (windowing generalization)
test('explicit limit returns the most recent min(limit, total) oracle points in ascending order', () => {
  fc.assert(
    fc.property(userArb, fc.integer({ min: 0, max: 20 }), ({ categories: gens, now, tz }, limit) => {
      const materialized = gens.map((g, i) => materialize(g, i, now, tz));
      const categories = materialized.map((m) => m.category);
      const byCat = new Map<string, ExpenseInput[]>();
      for (const m of materialized) byCat.set(m.category.id, m.expenses);

      const result = buildTimeSeries(categories, byCat, { enabled: true, enabledAt: null }, now, tz, { limit });
      const series = result.view === 'total' ? result.points : [];
      const oracle = fullSeriesOracle(categories, byCat, now, tz);

      const keep = Math.min(limit, oracle.length);
      const expected = oracle.slice(oracle.length - keep);

      assert.strictEqual(series.length, expected.length, `limit=${limit}: length ${series.length} != ${expected.length}`);
      for (let i = 0; i < series.length; i++) {
        assert.strictEqual(new Date(series[i].periodEnd).getTime(), expected[i].periodEndMs, `limit=${limit}: periodEnd mismatch at ${i}`);
        assert.strictEqual(series[i].cumulativeBalance, expected[i].cumulativeBalance, `limit=${limit}: balance mismatch at ${i}`);
      }
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 19 (c): a valid range keeps exactly the points whose periodEnd ───
// is within [rangeStart, rangeEnd] — none outside — with balances unchanged. ──
//
// Validates: Requirements 6.5, 6.1, 6.6
test('valid range returns exactly the oracle points inside [rangeStart, rangeEnd] and none outside', () => {
  fc.assert(
    fc.property(
      userArb,
      fc.integer({ min: 0, max: 200 }),
      fc.integer({ min: 0, max: 200 }),
      ({ categories: gens, now, tz }, offA, offB) => {
        const materialized = gens.map((g, i) => materialize(g, i, now, tz));
        const categories = materialized.map((m) => m.category);
        const byCat = new Map<string, ExpenseInput[]>();
        for (const m of materialized) byCat.set(m.category.id, m.expenses);

        // Two instants offset from `now`; order them so start <= end (valid range).
        const d1 = new Date(now.getTime() - offA * MS_PER_DAY);
        const d2 = new Date(now.getTime() - offB * MS_PER_DAY);
        const rangeStart = d1.getTime() <= d2.getTime() ? d1 : d2;
        const rangeEnd = d1.getTime() <= d2.getTime() ? d2 : d1;

        const result = buildTimeSeries(categories, byCat, { enabled: true, enabledAt: null }, now, tz, { rangeStart, rangeEnd });
        const series = result.view === 'total' ? result.points : [];
        const oracle = fullSeriesOracle(categories, byCat, now, tz);

        const expected = oracle.filter(
          (p) => p.periodEndMs >= rangeStart.getTime() && p.periodEndMs <= rangeEnd.getTime(),
        );

        assert.strictEqual(
          series.length,
          expected.length,
          `range series length ${series.length} != expected ${expected.length}`,
        );

        for (let i = 0; i < series.length; i++) {
          const t = new Date(series[i].periodEnd).getTime();
          // Requirement 6.5: every returned point lies inside the range.
          assert.ok(
            t >= rangeStart.getTime() && t <= rangeEnd.getTime(),
            `returned point ${series[i].periodEnd} outside range [${rangeStart.toISOString()}, ${rangeEnd.toISOString()}]`,
          );
          assert.strictEqual(t, expected[i].periodEndMs, `range periodEnd mismatch at ${i}`);
          // Cumulative balance is measured against full history, not reset by windowing.
          assert.strictEqual(
            series[i].cumulativeBalance,
            expected[i].cumulativeBalance,
            `range cumulativeBalance mismatch at ${i}: got ${series[i].cumulativeBalance}, expected ${expected[i].cumulativeBalance}`,
          );
        }

        // Non-decreasing across the windowed slice too.
        for (let i = 1; i < series.length; i++) {
          assert.ok(
            series[i].cumulativeBalance >= series[i - 1].cumulativeBalance,
            `range balance decreased at ${i}`,
          );
        }
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 19 (d): an inverted range (rangeStart > rangeEnd) is rejected ─────
// with a ValidationError and yields no points. ────────────────────────────────
//
// Validates: Requirement 6.8
test('inverted range (rangeStart > rangeEnd) throws ValidationError and returns no points', () => {
  fc.assert(
    fc.property(
      userArb,
      fc.integer({ min: 1, max: 200 }),
      fc.integer({ min: 1, max: 200 }),
      ({ categories: gens, now, tz }, gapDays, spanDays) => {
        const materialized = gens.map((g, i) => materialize(g, i, now, tz));
        const categories = materialized.map((m) => m.category);
        const byCat = new Map<string, ExpenseInput[]>();
        for (const m of materialized) byCat.set(m.category.id, m.expenses);

        // Construct strictly inverted: rangeStart is strictly after rangeEnd.
        const rangeEnd = new Date(now.getTime() - (gapDays + spanDays) * MS_PER_DAY);
        const rangeStart = new Date(now.getTime() - gapDays * MS_PER_DAY);
        assert.ok(rangeStart.getTime() > rangeEnd.getTime(), 'test setup: range must be inverted');

        let threw = false;
        try {
          buildTimeSeries(categories, byCat, { enabled: true, enabledAt: null }, now, tz, { rangeStart, rangeEnd });
        } catch (err) {
          threw = true;
          assert.ok(
            err instanceof ValidationError,
            `expected ValidationError, got ${(err as Error).name}: ${(err as Error).message}`,
          );
        }
        assert.ok(threw, 'inverted range did not throw');
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
