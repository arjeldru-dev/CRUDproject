/**
 * Property-based test for ACCRUED aggregation and shortfall separateness in the
 * savings compute service (`computeCategorySavings` + `computePiggybank`).
 *
 * Feature: savings-piggybank, Property 10: Accrued aggregation, with shortfall reported separately and never reducing the total
 *
 * Property 10 (design.md / tasks.md): For any category,
 *   accruedSavings == round2(Σ periodSavings)  and  shortfall == round2(Σ periodShortfall)
 * across its contributing closed periods (Category_Accrued_Savings, Requirements 4.9, 5.1).
 * For the user as a whole,
 *   totalAccruedSavings == round2(Σ category accruedSavings)   (Total_Accrued_Savings, 5.1)  and
 *   aggregateShortfall  == round2(Σ category shortfall)         (8.4);
 * and the aggregate shortfall is reported as a field SEPARATE from the totals and is
 * NEVER deducted from `totalAccruedSavings` or `totalSavingsBalance` — increasing
 * overspend (raising the shortfall) never reduces either total (8.5).
 *
 * This exercises `computeCategorySavings` and `computePiggybank` from
 * `savingsService.ts`. The per-category and aggregate sums are recomputed
 * INDEPENDENTLY here (from the returned per-period figures and from a separate
 * per-category call) so the test does not merely echo the service internals.
 *
 * Scope note (no property duplication): the available-balance offset
 * (`savingsBalance = max(0, accrued − usage)`) is owned by Property 11
 * (`savingsService.availableBalance` test); this Property 10 test deliberately runs
 * with NO usage records so it isolates ACCRUED aggregation and the separateness of
 * the shortfall figure, and only asserts that shortfall never reduces the totals.
 *
 * Validates: Requirements 4.9, 5.1, 8.4, 8.5
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/savingsService.aggregation.property.test.ts
 * Exits non-zero if any assertion / property fails.
 *
 * Uses `fast-check` (already installed in backend/node_modules) with at least 100
 * generated cases per property.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import {
  computeCategorySavings,
  computePiggybank,
  CategoryInput,
  ExpenseInput,
  PeriodResult,
} from '../savingsService';
import { isDateFunded } from '../fundedDayService';
import { getLocalDateParts, getUtcDateOfLocalTime } from '../gamificationService';
import type { BudgetPeriod } from '../budgetPeriodService';

const NUM_RUNS = 100; // minimum 100 generated cases per property (spec convention)
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Savings are always enabled here so accrual is not gated (Property 10 isolates accrual). */
const ALWAYS_ENABLED = { enabled: true, enabledAt: null } as const;

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

// A spread of valid IANA timezones (whole/half/three-quarter-hour + line-of-date).
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

// Generated per-category configuration (id/name are assigned by index later).
const categoryGenArb = fc.record({
  period: periodArb,
  limitAmount: fc
    .double({ min: 0, max: 3000, noNaN: true, noDefaultInfinity: true })
    .map(round2),
  monthlyStartDay: fc.oneof(fc.constant<number | null>(null), fc.integer({ min: 1, max: 28 }), fc.constant(-1)),
  weeklyStartDay: fc.oneof(fc.constant<number | null>(null), fc.integer({ min: 0, max: 6 })),
  customPeriodDays: fc.oneof(fc.constant<number | null>(null), fc.integer({ min: 1, max: 30 })),
  schedule: scheduleArb,
  // Override specs (offset days before `now`), keyed by local date string below.
  overrideSpecs: fc.array(
    fc.record({ offsetDays: fc.integer({ min: 0, max: 130 }), funded: fc.boolean() }),
    { maxLength: 6 },
  ),
  // Expense specs: positive amount placed some whole number of days before `now`.
  expenseSpecs: fc.array(
    fc.record({
      offsetDays: fc.integer({ min: 1, max: 120 }),
      amount: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }).map(round2),
    }),
    { maxLength: 12 },
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

/** Advance a UTC instant to the start (local midnight) of the following local day. */
function nextLocalMidnight(instant: Date, tz: string): Date {
  const { year, month, day } = getLocalDateParts(instant, tz);
  const dt = new Date(Date.UTC(year, month - 1, day + 1));
  return getUtcDateOfLocalTime(
    dt.getUTCFullYear(),
    dt.getUTCMonth() + 1,
    dt.getUTCDate(),
    0,
    0,
    0,
    tz,
  );
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
    // Names intentionally collide across indices sometimes to exercise the
    // id tie-break in ordering; the aggregation identity does not depend on it.
    name: `Cat-${index % 3}`,
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

/** Collect the local-midnight instant of every FUNDED day inside a period. */
function fundedDayInstants(category: CategoryInput, period: PeriodResult, tz: string): Date[] {
  const out: Date[] = [];
  let cursor = period.periodStart;
  let guard = 0;
  while (cursor.getTime() < period.periodEnd.getTime() && guard < 100_000) {
    guard++;
    if (isDateFunded(cursor, tz, category.schedule, category.overrides)) out.push(cursor);
    const next = nextLocalMidnight(cursor, tz);
    if (next.getTime() <= cursor.getTime()) break;
    cursor = next;
  }
  return out;
}

console.log('savingsService — Property 10: Accrued aggregation, shortfall reported separately');
console.log(
  '// Feature: savings-piggybank, Property 10: Accrued aggregation, with shortfall reported separately and never reducing the total',
);

// ── Property 10 (a): per-category accrued & shortfall are sums of period figures ──
// For any category: accruedSavings == round2(Σ periodSavings)  (Category_Accrued_Savings)
//               and shortfall      == round2(Σ periodShortfall).
//
// Validates: Requirements 4.9, 5.1, 8.4
test('per-category accruedSavings and shortfall equal the rounded sum of their period figures', () => {
  fc.assert(
    fc.property(categoryGenArb, nowArb, tzArb, (gen, now, tz) => {
      const { category, expenses } = materialize(gen, 0, now, tz);
      const result = computeCategorySavings(category, expenses, [], ALWAYS_ENABLED, now, tz);

      const expectedAccrued = round2(result.periods.reduce((s, p) => s + p.periodSavings, 0));
      const expectedShortfall = round2(result.periods.reduce((s, p) => s + p.periodShortfall, 0));

      // Category_Accrued_Savings = Σ Period_Savings (Requirement 4.9, 5.1).
      assert.strictEqual(
        result.accruedSavings,
        expectedAccrued,
        `accruedSavings != round2(Σ periodSavings): got ${result.accruedSavings}, expected ${expectedAccrued}`,
      );
      // Aggregate per-period shortfall (Requirement 8.4).
      assert.strictEqual(
        result.shortfall,
        expectedShortfall,
        `shortfall != round2(Σ periodShortfall): got ${result.shortfall}, expected ${expectedShortfall}`,
      );

      // Both aggregates are non-negative (savings floored, shortfall floored). (8.2, 8.3)
      assert.ok(result.accruedSavings >= 0, `accruedSavings < 0: ${result.accruedSavings}`);
      assert.ok(result.shortfall >= 0, `shortfall < 0: ${result.shortfall}`);
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 10 (b): user totals are the rounded sums of the per-category values ──
// totalAccruedSavings == round2(Σ category accruedSavings)  (Total_Accrued_Savings, 5.1)  and
// aggregateShortfall  == round2(Σ category shortfall)        (8.4), where the per-category
// values are obtained INDEPENDENTLY via computeCategorySavings.
//
// Validates: Requirements 4.9, 5.1, 8.4, 8.5
test('piggybank total accrued and aggregate shortfall equal the rounded sums across categories', () => {
  fc.assert(
    fc.property(userArb, ({ categories: gens, now, tz }) => {
      const materialized = gens.map((g, i) => materialize(g, i, now, tz));
      const categories = materialized.map((m) => m.category);
      const expensesByCategory = new Map<string, ExpenseInput[]>();
      for (const m of materialized) expensesByCategory.set(m.category.id, m.expenses);

      const piggy = computePiggybank(categories, expensesByCategory, new Map(), ALWAYS_ENABLED, now, tz);

      // Independent per-category recomputation.
      let expectedAccrued = 0;
      let expectedShortfall = 0;
      for (const m of materialized) {
        const cs = computeCategorySavings(m.category, m.expenses, [], ALWAYS_ENABLED, now, tz);
        expectedAccrued += cs.accruedSavings;
        expectedShortfall += cs.shortfall;
      }

      assert.strictEqual(
        piggy.totalAccruedSavings,
        round2(expectedAccrued),
        `totalAccruedSavings != round2(Σ category accruedSavings): got ${piggy.totalAccruedSavings}, expected ${round2(expectedAccrued)}`,
      );
      assert.strictEqual(
        piggy.aggregateShortfall,
        round2(expectedShortfall),
        `aggregateShortfall != round2(Σ category shortfall): got ${piggy.aggregateShortfall}, expected ${round2(expectedShortfall)}`,
      );

      // The per-category list accrued values also sum to the reported total accrued. (5.1)
      const listAccrued = round2(piggy.categories.reduce((s, c) => s + c.accruedSavings, 0));
      assert.strictEqual(
        listAccrued,
        piggy.totalAccruedSavings,
        `sum of per-category list accrued (${listAccrued}) != totalAccruedSavings (${piggy.totalAccruedSavings})`,
      );

      // With no usage, available total equals accrued total — proving the shortfall
      // is NOT deducted from the available total either (8.5).
      assert.strictEqual(
        piggy.totalSavingsBalance,
        piggy.totalAccruedSavings,
        `with no usage totalSavingsBalance (${piggy.totalSavingsBalance}) should equal totalAccruedSavings (${piggy.totalAccruedSavings})`,
      );

      // No categories → totals 0 and empty list (Requirement 5.8 boundary).
      if (categories.length === 0) {
        assert.strictEqual(piggy.totalAccruedSavings, 0, 'no categories must yield total accrued 0');
        assert.strictEqual(piggy.aggregateShortfall, 0, 'no categories must yield aggregate shortfall 0');
        assert.strictEqual(piggy.categories.length, 0, 'no categories must yield empty list');
      }
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 10 (c): the totals are never reduced by shortfall ───────────────
// Increasing overspend by adding large EXPENSE transactions on FUNDED days raises
// the aggregate shortfall but must NEVER deduct from EITHER total: the augmented
// totalAccruedSavings and totalSavingsBalance both equal the (independent) sum of
// floored per-period savings, stay non-negative, and never rise above the baseline.
// Comparing baseline → augmented proves the shortfall figure is reported separately
// and does not leak into the totals (Requirement 8.5).
//
// Validates: Requirements 8.4, 8.5
test('raising overspend increases shortfall but never reduces either total below its floored value', () => {
  fc.assert(
    fc.property(userArb, ({ categories: gens, now, tz }) => {
      const materialized = gens.map((g, i) => materialize(g, i, now, tz));
      const categories = materialized.map((m) => m.category);
      const baseByCat = new Map<string, ExpenseInput[]>();
      for (const m of materialized) baseByCat.set(m.category.id, m.expenses);

      const base = computePiggybank(categories, baseByCat, new Map(), ALWAYS_ENABLED, now, tz);

      // Both totals are non-negative — the shortfall is not subtracted. (8.5)
      assert.ok(base.totalAccruedSavings >= 0, `base total accrued < 0: ${base.totalAccruedSavings}`);
      assert.ok(base.totalSavingsBalance >= 0, `base total balance < 0: ${base.totalSavingsBalance}`);

      // Build an augmented expense set: add a large expense on every funded day of
      // every enumerated period so funded spend overwhelms funded budget, forcing
      // savings toward 0 and shortfall upward.
      const augByCat = new Map<string, ExpenseInput[]>();
      for (const m of materialized) {
        const cs = computeCategorySavings(m.category, m.expenses, [], ALWAYS_ENABLED, now, tz);
        const extras: ExpenseInput[] = [];
        for (const p of cs.periods) {
          for (const instant of fundedDayInstants(m.category, p, tz)) {
            extras.push({ categoryId: m.category.id, amount: 100000, createdAt: instant });
          }
        }
        augByCat.set(m.category.id, m.expenses.concat(extras));
      }

      const augmented = computePiggybank(categories, augByCat, new Map(), ALWAYS_ENABLED, now, tz);

      // Independent floored-savings sum for the augmented scenario.
      let expectedAugAccrued = 0;
      for (const m of materialized) {
        const cs = computeCategorySavings(m.category, augByCat.get(m.category.id)!, [], ALWAYS_ENABLED, now, tz);
        expectedAugAccrued += cs.accruedSavings;
      }
      const expectedAug = round2(expectedAugAccrued);

      // The augmented totals are purely the sum of floored savings — shortfall never
      // deducted — and remain non-negative. (8.5)
      assert.strictEqual(
        augmented.totalAccruedSavings,
        expectedAug,
        `augmented total accrued != sum of floored savings: got ${augmented.totalAccruedSavings}, expected ${expectedAug}`,
      );
      assert.strictEqual(
        augmented.totalSavingsBalance,
        expectedAug,
        `augmented total balance != sum of floored savings: got ${augmented.totalSavingsBalance}, expected ${expectedAug}`,
      );
      assert.ok(augmented.totalAccruedSavings >= 0, `augmented total accrued < 0: ${augmented.totalAccruedSavings}`);
      assert.ok(augmented.totalSavingsBalance >= 0, `augmented total balance < 0: ${augmented.totalSavingsBalance}`);

      // Adding funded-day spend can only reduce genuine savings, never increase
      // either total; and it must not push a total below zero via shortfall.
      assert.ok(
        augmented.totalAccruedSavings <= base.totalAccruedSavings + 1e-9,
        `overspend increased total accrued: base ${base.totalAccruedSavings} -> augmented ${augmented.totalAccruedSavings}`,
      );
      assert.ok(
        augmented.totalSavingsBalance <= base.totalSavingsBalance + 1e-9,
        `overspend increased total balance: base ${base.totalSavingsBalance} -> augmented ${augmented.totalSavingsBalance}`,
      );

      // Overspend raised (or held) the aggregate shortfall, which stays a separate,
      // non-negative figure that never reduced the totals. (8.4, 8.5)
      assert.ok(
        augmented.aggregateShortfall >= base.aggregateShortfall - 1e-9,
        `overspend decreased aggregate shortfall: base ${base.aggregateShortfall} -> augmented ${augmented.aggregateShortfall}`,
      );
      assert.ok(augmented.aggregateShortfall >= 0, `augmented shortfall < 0: ${augmented.aggregateShortfall}`);
    }),
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
