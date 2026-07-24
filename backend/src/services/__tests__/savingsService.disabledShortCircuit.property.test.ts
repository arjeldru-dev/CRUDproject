/**
 * Property-based test for the DISABLED short-circuit in the savings compute
 * service (`computePiggybank` and `buildTimeSeries`).
 *
 * Feature: savings-piggybank, Property 12: Disabled savings yield zero total, empty list, and empty series
 *
 * Property 12 (design.md / tasks.md 4.12): While the account-wide Savings_Enabled
 * state is DISABLED (`enablement.enabled === false`), the piggybank aggregation
 * reports a `totalSavingsBalance` of exactly `0.00`, a `totalAccruedSavings` of
 * exactly `0.00`, an `aggregateShortfall` of `0.00`, and an EMPTY per-category
 * list; and the time series returns NO data points — regardless of any other
 * input (categories, expenses, savings usage, `enabledAt`, `now`, timezone, or a
 * requested range/limit). No accrual is computed while disabled.
 *
 * Validates: Requirements 9.5
 *
 * Design: the disabled state must dominate every other input. To make that
 * meaningful, the generators deliberately produce inputs that WOULD accrue
 * non-zero savings if the feature were enabled — real categories with positive
 * limits, funded weekday schedules, expenses spread across closed periods, a
 * non-null `enabledAt` in the past, and assorted ranges/limits. The only thing
 * held fixed is `enabled: false`. A cross-check confirms the same inputs with
 * `enabled: true` can indeed produce non-zero output, so the assertions are not
 * vacuously satisfied.
 *
 * Self-contained assertion script (project convention, no jest/vitest):
 *   npx ts-node src/services/__tests__/savingsService.disabledShortCircuit.property.test.ts
 * Exits non-zero if any property fails.
 *
 * Uses `fast-check` (already installed in backend/node_modules) with a minimum
 * of 100 generated cases.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import {
  computePiggybank,
  buildTimeSeries,
  CategoryInput,
  ExpenseInput,
  SavingsUsageInput,
} from '../savingsService';
import { FundedWeekdays } from '../fundedDayService';
import { BudgetPeriod } from '../budgetPeriodService';

const NUM_RUNS = 100; // task requires a minimum of 100 generated cases.

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

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Arbitraries (mirror the sibling savingsService property tests) ───────────

const tzArb = fc.constantFrom(
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
);

const periodArb = fc.constantFrom<BudgetPeriod>('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

// A funded weekday schedule with at least one funded day so the enabled cross-check
// has a chance of accruing something non-zero.
const scheduleArb: fc.Arbitrary<FundedWeekdays> = fc
  .subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 1, maxLength: 7 })
  .map((s) => [...s].sort((a, b) => a - b));

const nowArb = fc.date({
  min: new Date('2023-01-01T00:00:00.000Z'),
  max: new Date('2027-12-31T23:59:59.999Z'),
  noInvalidDate: true,
});

// Amounts as whole cents to keep generation realistic.
const amountArb = fc.integer({ min: 0, max: 200000 }).map((c) => c / 100);

interface Scenario {
  categories: CategoryInput[];
  expensesByCategory: Map<string, ExpenseInput[]>;
  usagesByCategory: Map<string, SavingsUsageInput[]>;
  enabledAt: Date | null;
  now: Date;
  tz: string;
  rangeStart?: Date;
  rangeEnd?: Date;
  limit?: number;
}

/**
 * Build a scenario that WOULD accrue non-zero savings if enabled: 1–3 categories
 * with positive limits and funded schedules, expenses spread across the ~200
 * days before `now` (so several closed periods exist), some savings usage, and a
 * non-null `enabledAt` well in the past. Also carries an optional range/limit for
 * the time-series call.
 */
const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    now: nowArb,
    tz: tzArb,
    cats: fc.array(
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 12 }),
        period: periodArb,
        limitAmount: fc.integer({ min: 100, max: 500000 }).map((c) => c / 100),
        monthlyStartDay: fc.constantFrom<number | null>(null, 1, 15, -1),
        weeklyStartDay: fc.constantFrom<number | null>(null, 0, 1, 6),
        customPeriodDays: fc.constantFrom<number | null>(null, 7, 14, 30),
        schedule: scheduleArb,
        expenseCount: fc.integer({ min: 0, max: 5 }),
        usageCount: fc.integer({ min: 0, max: 3 }),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    // enabledAt: often a real past instant (which enabled math would honor), but
    // sometimes null — the disabled short-circuit must ignore both alike.
    enabledOffsetDays: fc.oneof(
      fc.constant<number | null>(null),
      fc.integer({ min: 0, max: 300 }),
    ),
    expenseOffsets: fc.array(fc.integer({ min: 1, max: 200 * MS_PER_DAY }), {
      minLength: 0,
      maxLength: 15,
    }),
    // Optional time-series range / limit to prove they are also short-circuited.
    hasRange: fc.boolean(),
    rangeStartOffsetDays: fc.integer({ min: 0, max: 300 }),
    rangeSpanDays: fc.integer({ min: 0, max: 300 }),
    limit: fc.oneof(fc.constant<number | undefined>(undefined), fc.integer({ min: 0, max: 50 })),
    amounts: fc.array(amountArb, { minLength: 0, maxLength: 60 }),
  })
  .map((r): Scenario => {
    const categories: CategoryInput[] = [];
    const expensesByCategory = new Map<string, ExpenseInput[]>();
    const usagesByCategory = new Map<string, SavingsUsageInput[]>();

    let amtCursor = 0;
    const nextAmount = (): number => {
      if (r.amounts.length === 0) return 100;
      const v = r.amounts[amtCursor % r.amounts.length];
      amtCursor++;
      return v;
    };

    r.cats.forEach((c, i) => {
      // Ensure unique category ids even if fc.uuid collides in a shrink.
      const id = `${c.id}-${i}`;
      const category: CategoryInput = {
        id,
        name: c.name,
        limitAmount: c.limitAmount,
        period: c.period,
        monthlyStartDay: c.monthlyStartDay,
        weeklyStartDay: c.weeklyStartDay,
        customPeriodDays: c.customPeriodDays,
        anchorDate: null,
        schedule: c.schedule,
        overrides: new Map<string, boolean>(),
      };
      categories.push(category);

      const expenses: ExpenseInput[] = [];
      for (let e = 0; e < c.expenseCount; e++) {
        const off = r.expenseOffsets.length
          ? r.expenseOffsets[(i + e) % r.expenseOffsets.length]
          : (e + 1) * MS_PER_DAY;
        expenses.push({
          categoryId: id,
          amount: nextAmount(),
          createdAt: new Date(r.now.getTime() - off),
        });
      }
      expensesByCategory.set(id, expenses);

      const usages: SavingsUsageInput[] = [];
      for (let u = 0; u < c.usageCount; u++) {
        usages.push({
          categoryId: id,
          amount: round2(nextAmount() / 2 + 0.01),
          createdAt: new Date(r.now.getTime() - (u + 1) * MS_PER_DAY),
        });
      }
      usagesByCategory.set(id, usages);
    });

    const enabledAt =
      r.enabledOffsetDays === null
        ? null
        : new Date(r.now.getTime() - r.enabledOffsetDays * MS_PER_DAY);

    let rangeStart: Date | undefined;
    let rangeEnd: Date | undefined;
    if (r.hasRange) {
      rangeStart = new Date(r.now.getTime() - r.rangeStartOffsetDays * MS_PER_DAY);
      // Keep start <= end so the range is valid (an inverted range would throw
      // even while disabled is checked first, but we test the valid-range path).
      rangeEnd = new Date(rangeStart.getTime() + r.rangeSpanDays * MS_PER_DAY);
    }

    return {
      categories,
      expensesByCategory,
      usagesByCategory,
      enabledAt,
      now: r.now,
      tz: r.tz,
      rangeStart,
      rangeEnd,
      limit: r.limit,
    };
  });

// ── Property 12 ──────────────────────────────────────────────────────────────

console.log(
  '// Feature: savings-piggybank, Property 12: Disabled savings yield zero total, empty list, and empty series',
);

// Part A: computePiggybank short-circuits to zeros and an empty list while disabled.
//
// Validates: Requirements 9.5
test('disabled => computePiggybank returns 0.00 totals and an empty per-category list', () => {
  fc.assert(
    fc.property(scenarioArb, (s) => {
      const agg = computePiggybank(
        s.categories,
        s.expensesByCategory,
        s.usagesByCategory,
        { enabled: false, enabledAt: s.enabledAt },
        s.now,
        s.tz,
      );

      assert.strictEqual(
        agg.totalSavingsBalance,
        0,
        `expected totalSavingsBalance 0.00, got ${agg.totalSavingsBalance}`,
      );
      assert.strictEqual(
        agg.totalAccruedSavings,
        0,
        `expected totalAccruedSavings 0.00, got ${agg.totalAccruedSavings}`,
      );
      assert.strictEqual(
        agg.aggregateShortfall,
        0,
        `expected aggregateShortfall 0.00, got ${agg.aggregateShortfall}`,
      );
      assert.ok(
        Array.isArray(agg.categories) && agg.categories.length === 0,
        `expected an empty per-category list, got length ${agg.categories.length}`,
      );
      assert.strictEqual(agg.incomplete, false, 'disabled short-circuit must not flag incomplete');
    }),
    { numRuns: NUM_RUNS },
  );
});

// Part B: buildTimeSeries short-circuits to no data points while disabled,
// regardless of any requested range/limit.
//
// Validates: Requirements 9.5
test('disabled => buildTimeSeries returns no data points (any range/limit)', () => {
  fc.assert(
    fc.property(scenarioArb, (s) => {
      const opts: { rangeStart?: Date; rangeEnd?: Date; limit?: number } = {};
      if (s.rangeStart) opts.rangeStart = s.rangeStart;
      if (s.rangeEnd) opts.rangeEnd = s.rangeEnd;
      if (s.limit !== undefined) opts.limit = s.limit;

      const result = buildTimeSeries(
        s.categories,
        s.expensesByCategory,
        { enabled: false, enabledAt: s.enabledAt },
        s.now,
        s.tz,
        opts,
      );

      const series = result.view === 'total' ? result.points : [];
      assert.ok(
        result.view === 'total' && Array.isArray(series) && series.length === 0,
        `expected an empty total time series, got ${series.length} point(s)`,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// Part C (anti-vacuity guard): confirm the SAME generated inputs, when ENABLED
// with no lower bound, can produce non-zero output. If the enabled path never
// accrued anything, Parts A/B would be trivially true; this guard ensures the
// disabled short-circuit is actually suppressing real accrual for at least some
// inputs across the run.
//
// Validates: Requirements 9.5
test('anti-vacuity: some enabled scenarios accrue non-zero savings the disabled path suppresses', () => {
  let sawNonZeroPiggybank = false;
  let sawNonEmptySeries = false;

  fc.assert(
    fc.property(scenarioArb, (s) => {
      const enabled = { enabled: true, enabledAt: null } as const;

      const agg = computePiggybank(
        s.categories,
        s.expensesByCategory,
        s.usagesByCategory,
        enabled,
        s.now,
        s.tz,
      );
      if (agg.totalAccruedSavings > 0 || agg.categories.length > 0) {
        sawNonZeroPiggybank = true;
      }

      const result = buildTimeSeries(
        s.categories,
        s.expensesByCategory,
        enabled,
        s.now,
        s.tz,
      );
      const series = result.view === 'total' ? result.points : [];
      if (series.length > 0) sawNonEmptySeries = true;
    }),
    { numRuns: NUM_RUNS },
  );

  assert.ok(
    sawNonZeroPiggybank,
    'anti-vacuity failed: no enabled scenario produced a non-zero/non-empty piggybank',
  );
  assert.ok(
    sawNonEmptySeries,
    'anti-vacuity failed: no enabled scenario produced a non-empty time series',
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
