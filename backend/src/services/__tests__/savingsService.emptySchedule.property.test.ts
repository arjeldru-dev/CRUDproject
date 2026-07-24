/**
 * Property-based test for `computeCategorySavings` — empty schedule yields a
 * zero Category_Savings_Balance.
 *
 * Feature: savings-piggybank, Property 11: Empty schedule yields zero balance
 *
 * Property 11 (design.md): For any category whose effective schedule marks zero
 * weekdays as funded and which has no `funded` overrides, and for any set of
 * transactions, its computed `Category_Savings_Balance` is 0.
 *
 * Validates: Requirements 1.5
 *
 * Reasoning: when the effective schedule is empty AND every override is
 * `unfunded` (no `funded: true` override exists), `isDateFunded` returns false
 * for every calendar day. Consequently every closed period has `fundedDays = 0`,
 * so `fundedBudget = 0` and `periodSavings = max(0, 0 - fundedSpend) = 0`. The
 * sum across all periods — the Category_Savings_Balance — is therefore 0 for any
 * set of transactions and any period configuration / timezone.
 *
 * Self-contained assertion script (project convention, no jest/vitest):
 *   npx ts-node src/services/__tests__/savingsService.emptySchedule.property.test.ts
 * Exits non-zero if any property fails.
 *
 * Uses `fast-check` (installed in backend/node_modules) with a reduced run count
 * for fast local execution (per request); the property is still exercised across
 * many generated inputs.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import {
  computeCategorySavings,
  computePiggybank,
  CategoryInput,
  ExpenseInput,
} from '../savingsService';
import { getLocalDateStr } from '../gamificationService';
import { BudgetPeriod } from '../budgetPeriodService';

const NUM_RUNS = 25; // reduced for faster runs (per request); property still exercised across many inputs

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

// ── Arbitraries ──────────────────────────────────────────────────────────────

// A spread of valid IANA timezones (whole/half/three-quarter-hour + line-of-date).
const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Manila',
  'Asia/Kolkata', // +05:30
  'Asia/Kathmandu', // +05:45
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Kiritimati', // +14:00
];

const tzArb = fc.constantFrom(...TIMEZONES);

const PERIOD_TYPES: BudgetPeriod[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'];

// A fixed recent "now"; every generated expense precedes it so its window is a
// closed period that actually contains the transaction.
const NOW = new Date('2025-06-15T12:00:00.000Z');
const CAT_ID = 'cat-under-test';

// Amounts as whole cents (0.00 … 1000.00) to keep generation realistic.
const amountArb = fc.integer({ min: 0, max: 100000 }).map((c) => c / 100);

// createdAt confined to roughly the year before NOW so period enumeration stays
// bounded (even DAILY yields < 400 windows) while spanning many weekdays / DST.
const createdAtArb = fc.date({
  min: new Date('2024-06-20T00:00:00.000Z'),
  max: new Date('2025-06-14T23:59:59.999Z'),
  noInvalidDate: true,
});

/** An expense for the category under test (positive-ish amounts, before NOW). */
const ownExpenseArb: fc.Arbitrary<ExpenseInput> = fc.record({
  categoryId: fc.constant(CAT_ID),
  amount: amountArb,
  createdAt: createdAtArb,
});

const periodOptsArb = fc.record({
  period: fc.constantFrom(...PERIOD_TYPES),
  monthlyStartDay: fc.constantFrom<number | null>(null, 1, 15, -1),
  weeklyStartDay: fc.constantFrom<number | null>(null, 0, 1, 6),
  customPeriodDays: fc.constantFrom<number | null>(null, 7, 14, 30),
  limitAmount: fc.integer({ min: 0, max: 500000 }).map((c) => c / 100),
});

/**
 * Build an overrides map with ONLY `unfunded` (false) entries — never a `funded`
 * override — keyed by the local date string in the chosen timezone. This keeps
 * the category's effective funded-day set empty (empty schedule + no funded
 * override) as Property 11 requires.
 */
function buildUnfundedOverrides(dates: Date[], tz: string): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const d of dates) {
    m.set(getLocalDateStr(d, tz), false);
  }
  return m;
}

// ── Property 11 ────────────────────────────────────────────────────────────────

console.log(
  '// Feature: savings-piggybank, Property 11: Empty schedule yields zero balance',
);

// Part A: an empty effective schedule with no `funded` override yields a
// Category_Savings_Balance of 0 for any transactions — asserted through
// `computeCategorySavings` (the implementation under test).
//
// Validates: Requirements 1.5
test('empty schedule (no funded override) => Category_Savings_Balance is 0 for any transactions', () => {
  fc.assert(
    fc.property(
      periodOptsArb,
      tzArb,
      fc.array(createdAtArb, { maxLength: 6 }), // dates that receive `unfunded` overrides
      fc.array(ownExpenseArb, { minLength: 0, maxLength: 15 }),
      (opts, tz, overrideDates, expenses) => {
        const overrides = buildUnfundedOverrides(overrideDates, tz);
        const category: CategoryInput = {
          id: CAT_ID,
          name: 'Empty Schedule',
          limitAmount: opts.limitAmount,
          period: opts.period,
          monthlyStartDay: opts.monthlyStartDay,
          weeklyStartDay: opts.weeklyStartDay,
          customPeriodDays: opts.customPeriodDays,
          anchorDate: null,
          schedule: [], // effective schedule marks ZERO weekdays as funded
          overrides,
        };

        const result = computeCategorySavings(category, expenses, [], { enabled: true, enabledAt: null }, NOW, tz);

        // The Category_Savings_Balance is exactly 0.
        assert.strictEqual(
          result.savingsBalance,
          0,
          `expected Category_Savings_Balance 0, got ${result.savingsBalance}`,
        );

        // And every enumerated period contributes nothing: no funded day means a
        // zero funded budget and therefore zero period savings.
        for (const p of result.periods) {
          assert.strictEqual(
            p.fundedBudget,
            0,
            `expected fundedBudget 0 for an unfunded period, got ${p.fundedBudget}`,
          );
          assert.strictEqual(
            p.periodSavings,
            0,
            `expected periodSavings 0 for an unfunded period, got ${p.periodSavings}`,
          );
        }
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

// Part B: the same guarantee surfaces through the piggybank aggregation — a
// category with an empty schedule contributes 0 to the per-category list and to
// the Total_Savings_Balance.
//
// Validates: Requirements 1.5
test('empty-schedule category contributes 0 to the piggybank aggregate', () => {
  fc.assert(
    fc.property(
      periodOptsArb,
      tzArb,
      fc.array(createdAtArb, { maxLength: 6 }),
      fc.array(ownExpenseArb, { minLength: 0, maxLength: 15 }),
      (opts, tz, overrideDates, expenses) => {
        const overrides = buildUnfundedOverrides(overrideDates, tz);
        const category: CategoryInput = {
          id: CAT_ID,
          name: 'Empty Schedule',
          limitAmount: opts.limitAmount,
          period: opts.period,
          monthlyStartDay: opts.monthlyStartDay,
          weeklyStartDay: opts.weeklyStartDay,
          customPeriodDays: opts.customPeriodDays,
          anchorDate: null,
          schedule: [],
          overrides,
        };

        const expensesByCategory = new Map<string, ExpenseInput[]>([[CAT_ID, expenses]]);
        const agg = computePiggybank([category], expensesByCategory, new Map(), { enabled: true, enabledAt: null }, NOW, tz);

        assert.strictEqual(
          agg.totalSavingsBalance,
          0,
          `expected Total_Savings_Balance 0, got ${agg.totalSavingsBalance}`,
        );
        const row = agg.categories.find((c) => c.categoryId === CAT_ID);
        assert.ok(row, 'expected the empty-schedule category in the aggregate list');
        assert.strictEqual(
          row!.savingsBalance,
          0,
          `expected per-category savingsBalance 0, got ${row!.savingsBalance}`,
        );
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
