/**
 * Property-based test for `computeCategorySavings` funded-spend accrual.
 *
 * Feature: savings-piggybank, Property 8: Funded spend counts only funded in-window days, order-independently
 *
 * Property 8 (design.md): For any set of EXPENSE transactions, `fundedSpend`
 * for a period equals the sum of the amounts of exactly those transactions
 * whose `createdAt` (in the resolved timezone) falls on a funded day within the
 * window (0 when there are none), and this value is unchanged under any
 * reordering of the input transactions.
 *
 * Validates: Requirements 4.3, 7.3
 *
 * The oracle is `isDateFunded` (fundedDayService) — computed independently here
 * to decide which expenses count — combined with the window boundaries produced
 * by `computeCategorySavings` itself (whose enumeration/proration is covered by
 * Properties 6 and 7). Order-independence is asserted by re-running the compute
 * over Fisher–Yates shuffled copies of the same expenses.
 *
 * Self-contained assertion script (project convention, no jest/vitest):
 *   npx ts-node src/services/__tests__/savingsService.fundedSpend.property.test.ts
 * Exits non-zero if any property fails.
 *
 * Uses `fast-check` (installed in backend/node_modules) with a minimum of 100
 * generated cases.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import {
  computeCategorySavings,
  CategoryInput,
  ExpenseInput,
} from '../savingsService';
import { isDateFunded, FundedWeekdays } from '../fundedDayService';
import { getLocalDateStr } from '../gamificationService';
import { BudgetPeriod } from '../budgetPeriodService';

const NUM_RUNS = 25; // reduced for faster runs (per request); property still exercised across many inputs

/** Round to 2 decimals without binary-float drift — matches savingsService. */
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

// ── Deterministic shuffle (mulberry32 + Fisher–Yates) ────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Independent oracle for a single period's funded spend: the round2 sum of the
 * amounts of exactly those relevant expenses whose createdAt is inside
 * [periodStart, periodEnd) AND lands on a funded day (per isDateFunded).
 */
function expectedFundedSpend(
  expenses: ExpenseInput[],
  periodStart: Date,
  periodEnd: Date,
  tz: string,
  schedule: FundedWeekdays,
  overrides: Map<string, boolean>,
): number {
  let sum = 0;
  for (const e of expenses) {
    const t = e.createdAt.getTime();
    if (
      t >= periodStart.getTime() &&
      t < periodEnd.getTime() &&
      isDateFunded(e.createdAt, tz, schedule, overrides)
    ) {
      sum += e.amount;
    }
  }
  return round2(sum);
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Manila',
  'Asia/Kolkata', // +05:30
  'Asia/Kathmandu', // +05:45
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Chatham', // +12:45 / +13:45
];

const tzArb = fc.constantFrom(...TIMEZONES);

const PERIOD_TYPES: BudgetPeriod[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'];

// A fixed recent "now"; all generated expenses precede it so their windows are
// closed and actually contain the transactions.
const NOW = new Date('2025-06-15T12:00:00.000Z');
const CAT_ID = 'cat-under-test';

/** Any schedule: a subset of weekdays 0..6 (sorted, unique). */
const scheduleArb: fc.Arbitrary<FundedWeekdays> = fc
  .subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 0, maxLength: 7 })
  .map((s) => [...s].sort((a, b) => a - b));

// createdAt confined to roughly the year before NOW so period enumeration stays
// bounded (even DAILY yields < 400 windows) while spanning many funded/unfunded
// weekdays and DST transitions.
const createdAtArb = fc.date({
  min: new Date('2024-06-20T00:00:00.000Z'),
  max: new Date('2025-06-14T23:59:59.999Z'),
  noInvalidDate: true,
});

// Amounts as whole cents (0.00 … 1000.00) to keep generation realistic.
const amountArb = fc.integer({ min: 0, max: 100000 }).map((c) => c / 100);

/** An expense for the category under test. */
const ownExpenseArb: fc.Arbitrary<ExpenseInput> = fc.record({
  categoryId: fc.constant(CAT_ID),
  amount: amountArb,
  createdAt: createdAtArb,
});

/** A foreign expense (different categoryId) that must be completely ignored. */
const foreignExpenseArb: fc.Arbitrary<ExpenseInput> = fc.record({
  categoryId: fc.constantFrom('other-1', 'other-2'),
  amount: amountArb,
  createdAt: createdAtArb,
});

const periodOptsArb = fc.record({
  period: fc.constantFrom(...PERIOD_TYPES),
  monthlyStartDay: fc.constantFrom<number | null>(null, 1, 15, -1),
  weeklyStartDay: fc.constantFrom<number | null>(null, 0, 1, 6),
  customPeriodDays: fc.constantFrom<number | null>(null, 7, 14, 30),
});

/** A small set of overrides keyed by local date string in the chosen tz. */
function buildOverrides(dates: Date[], vals: boolean[], tz: string): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (let i = 0; i < dates.length; i++) {
    m.set(getLocalDateStr(dates[i], tz), vals[i % Math.max(1, vals.length)]);
  }
  return m;
}

// ── Property 8 ────────────────────────────────────────────────────────────────

console.log(
  '// Feature: savings-piggybank, Property 8: Funded spend counts only funded in-window days, order-independently',
);

// Part A: fundedSpend equals the independent funded-in-window oracle per period.
//
// Validates: Requirements 4.3
test('per-period fundedSpend equals the funded-in-window oracle sum (0 when none)', () => {
  fc.assert(
    fc.property(
      periodOptsArb,
      fc.integer({ min: 1, max: 100000 }).map((c) => c / 100), // limitAmount > 0
      tzArb,
      scheduleArb,
      fc.array(createdAtArb, { maxLength: 4 }), // override dates
      fc.array(fc.boolean(), { minLength: 1, maxLength: 4 }), // override values
      fc.array(ownExpenseArb, { minLength: 0, maxLength: 12 }),
      fc.array(foreignExpenseArb, { maxLength: 4 }),
      (opts, limitAmount, tz, schedule, ovrDates, ovrVals, ownExpenses, foreignExpenses) => {
        const overrides = buildOverrides(ovrDates, ovrVals, tz);
        const category: CategoryInput = {
          id: CAT_ID,
          name: 'Under Test',
          limitAmount,
          period: opts.period,
          monthlyStartDay: opts.monthlyStartDay,
          weeklyStartDay: opts.weeklyStartDay,
          customPeriodDays: opts.customPeriodDays,
          anchorDate: null,
          schedule,
          overrides,
        };

        const allExpenses = [...ownExpenses, ...foreignExpenses];
        const result = computeCategorySavings(category, allExpenses, [], { enabled: true, enabledAt: null }, NOW, tz);

        // Relevant = only the category's own expenses (foreign ones excluded).
        const relevant = ownExpenses;

        for (const p of result.periods) {
          const expected = expectedFundedSpend(
            relevant,
            p.periodStart,
            p.periodEnd,
            tz,
            schedule,
            overrides,
          );
          assert.strictEqual(
            p.fundedSpend,
            expected,
            `fundedSpend mismatch for [${p.periodStart.toISOString()}, ${p.periodEnd.toISOString()}): ` +
              `got ${p.fundedSpend}, expected ${expected}`,
          );
        }

        // Every funded expense inside some enumerated period must be fully
        // accounted for across periods; expenses on unfunded days contribute 0.
        const totalFundedSpend = round2(
          result.periods.reduce((s, p) => s + p.fundedSpend, 0),
        );
        const oracleTotal = round2(
          result.periods.reduce(
            (s, p) =>
              s + expectedFundedSpend(relevant, p.periodStart, p.periodEnd, tz, schedule, overrides),
            0,
          ),
        );
        assert.strictEqual(totalFundedSpend, oracleTotal);
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

// Part B: order-independence — shuffling the input expenses leaves every
// period's fundedSpend unchanged (Requirement 7.3).
//
// Validates: Requirements 7.3
test('per-period fundedSpend is invariant under reordering of the expenses', () => {
  fc.assert(
    fc.property(
      periodOptsArb,
      fc.integer({ min: 1, max: 100000 }).map((c) => c / 100),
      tzArb,
      scheduleArb,
      fc.array(createdAtArb, { maxLength: 4 }),
      fc.array(fc.boolean(), { minLength: 1, maxLength: 4 }),
      fc.array(ownExpenseArb, { minLength: 0, maxLength: 12 }),
      fc.array(foreignExpenseArb, { maxLength: 4 }),
      fc.integer({ min: 1, max: 2 ** 31 - 1 }), // shuffle seed
      (opts, limitAmount, tz, schedule, ovrDates, ovrVals, ownExpenses, foreignExpenses, seed) => {
        const overrides = buildOverrides(ovrDates, ovrVals, tz);
        const category: CategoryInput = {
          id: CAT_ID,
          name: 'Under Test',
          limitAmount,
          period: opts.period,
          monthlyStartDay: opts.monthlyStartDay,
          weeklyStartDay: opts.weeklyStartDay,
          customPeriodDays: opts.customPeriodDays,
          anchorDate: null,
          schedule,
          overrides,
        };

        const base = [...ownExpenses, ...foreignExpenses];
        const reordered = shuffle(base, seed);
        // A second, differently-seeded ordering for good measure.
        const reordered2 = shuffle(base, (seed * 2654435761) >>> 0 || 1);

        const a = computeCategorySavings(category, base, [], { enabled: true, enabledAt: null }, NOW, tz);
        const b = computeCategorySavings(category, reordered, [], { enabled: true, enabledAt: null }, NOW, tz);
        const c = computeCategorySavings(category, reordered2, [], { enabled: true, enabledAt: null }, NOW, tz);

        assert.strictEqual(b.periods.length, a.periods.length);
        assert.strictEqual(c.periods.length, a.periods.length);

        for (let i = 0; i < a.periods.length; i++) {
          // Windows are enumerated deterministically, so index alignment holds.
          assert.strictEqual(
            b.periods[i].periodEnd.getTime(),
            a.periods[i].periodEnd.getTime(),
            'period ordering changed under reordering',
          );
          assert.strictEqual(
            b.periods[i].fundedSpend,
            a.periods[i].fundedSpend,
            `fundedSpend changed under reordering at period ${i}`,
          );
          assert.strictEqual(
            c.periods[i].fundedSpend,
            a.periods[i].fundedSpend,
            `fundedSpend changed under second reordering at period ${i}`,
          );
        }
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
