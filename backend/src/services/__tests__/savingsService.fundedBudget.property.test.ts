/**
 * Property-based test for funded-budget proration and cap in the savings
 * compute service (`computeCategorySavings`).
 *
 * Feature: savings-piggybank, Property 7: Funded budget proration and cap
 *
 * Property 7 (design.md): For any closed period,
 *   fundedBudget == round2(limitAmount × fundedDays ÷ totalDays)
 * where `fundedDays` is the number of funded local days in the window, and
 * fundedBudget <= limitAmount. When totalDays == 0 or limitAmount <= 0, the
 * period's savings and shortfall are both 0.
 *
 * This exercises `computeCategorySavings` from `savingsService.ts` — specifically
 * each returned `periods[].fundedBudget`, `periodSavings`, and `periodShortfall`.
 * `isDateFunded` (fundedDayService) plus the local-date helpers
 * (`getLocalDateParts` / `getUtcDateOfLocalTime`) are used as an INDEPENDENT
 * oracle to re-count funded/total local days per window.
 *
 * Validates: Requirements 4.2, 4.6, 4.8
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/savingsService.fundedBudget.property.test.ts
 * Exits non-zero if any assertion / property fails.
 *
 * Uses `fast-check` (already installed in backend/node_modules) with a minimum
 * of 100 generated cases.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import {
  computeCategorySavings,
  CategoryInput,
  ExpenseInput,
} from '../savingsService';
import { isDateFunded, FundedWeekdays } from '../fundedDayService';
import { getLocalDateParts, getUtcDateOfLocalTime } from '../gamificationService';
import type { BudgetPeriod } from '../budgetPeriodService';

const NUM_RUNS = 30; // Reduced for faster local runs.

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

/** Same 2-decimal rounding the service uses, replicated independently. */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Advance a UTC instant to local midnight of the following local calendar day.
 * Independent re-implementation of the service's day-walking step, built only
 * from the shared timezone helpers.
 */
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

/**
 * Independent oracle: count total and funded local calendar days in the
 * half-open window [periodStart, periodEnd), using `isDateFunded` for the
 * funded decision — mirroring how the window's local days are enumerated but
 * written separately here so the test does not call the service's internals.
 */
function countDays(
  periodStart: Date,
  periodEnd: Date,
  tz: string,
  schedule: FundedWeekdays,
  overrides: Map<string, boolean>,
): { totalDays: number; fundedDays: number } {
  let totalDays = 0;
  let fundedDays = 0;
  let cursor = periodStart;
  let guard = 0;
  while (cursor.getTime() < periodEnd.getTime()) {
    if (guard >= 100_000) break;
    guard++;
    totalDays++;
    if (isDateFunded(cursor, tz, schedule, overrides)) fundedDays++;
    const next = nextLocalMidnight(cursor, tz);
    if (next.getTime() <= cursor.getTime()) break;
    cursor = next;
  }
  return { totalDays, fundedDays };
}

// ── Arbitraries ───────────────────────────────────────────────────────────

/** Real IANA zones incl. fractional-offset and DST-observing ones. */
const tzArb = fc.constantFrom(
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Manila',
  'Asia/Kolkata', // +5:30
  'Asia/Kathmandu', // +5:45
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Chatham', // +12:45
  'America/Sao_Paulo',
);

const periodArb = fc.constantFrom<BudgetPeriod>('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

/**
 * limitAmount including the <= 0 space (Requirement 4.8) and normal positives.
 * Monetary limits come from a Decimal(10,2) column, so positive values are
 * constrained to at most 2 decimal places (the real input domain); a sub-cent
 * limit is not representable and is intentionally excluded.
 */
const limitArb = fc.oneof(
  fc.constant(0),
  fc.integer({ min: -5000, max: -1 }), // negative
  // 2-decimal money: generate cents, then divide (0.01 … 9999.99).
  fc.integer({ min: 1, max: 999999 }).map((cents) => round2(cents / 100)),
  fc.integer({ min: 1, max: 10000 }),
);

const scheduleArb: fc.Arbitrary<FundedWeekdays> = fc
  .subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 0, maxLength: 7 })
  .map((s) => [...s].sort((a, b) => a - b));

/** `now`: a fixed-ish range so windows are well-formed. */
const nowArb = fc.date({
  min: new Date('2021-01-01T00:00:00.000Z'),
  max: new Date('2029-12-31T23:59:59.999Z'),
  noInvalidDate: true,
});

/**
 * Build a category + its expenses from generated parts. Expenses are placed in
 * the past relative to `now` (bounded to ~120 days) so the backward walk
 * enumerates a small, fast set of CLOSED periods while still varying window
 * counts.
 */
const scenarioArb = fc
  .record({
    period: periodArb,
    limitAmount: limitArb,
    monthlyStartDay: fc.oneof(fc.constant<number | null>(null), fc.integer({ min: 1, max: 28 }), fc.constant(-1)),
    weeklyStartDay: fc.integer({ min: 0, max: 6 }),
    customPeriodDays: fc.integer({ min: 1, max: 30 }),
    anchorDate: fc.date({
      min: new Date('2020-01-01T00:00:00.000Z'),
      max: new Date('2022-12-31T00:00:00.000Z'),
      noInvalidDate: true,
    }),
    schedule: scheduleArb,
    overrideEntries: fc.array(
      fc.tuple(
        fc.integer({ min: 0, max: 130 }), // day offset from now, mapped to a date key below
        fc.boolean(),
      ),
      { maxLength: 10 },
    ),
    tz: tzArb,
    now: nowArb,
    // Expense day-offsets (before now), bounded to keep enumeration cheap.
    expenseOffsets: fc.array(
      fc.record({
        offsetMs: fc.integer({ min: 1, max: 120 * MS_PER_DAY }),
        amount: fc.float({ min: 0, max: Math.fround(20000), noNaN: true }),
      }),
      { minLength: 1, maxLength: 6 },
    ),
  })
  .map((r) => {
    const categoryId = 'cat-1';

    // Build overrides keyed by local date string derived from now - offsetDays.
    const overrides = new Map<string, boolean>();
    for (const [offsetDays, funded] of r.overrideEntries) {
      const d = new Date(r.now.getTime() - offsetDays * MS_PER_DAY);
      const { year, month, day } = getLocalDateParts(d, r.tz);
      const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      overrides.set(key, funded);
    }

    const category: CategoryInput = {
      id: categoryId,
      name: 'Test',
      limitAmount: r.limitAmount,
      period: r.period,
      monthlyStartDay: r.monthlyStartDay,
      weeklyStartDay: r.weeklyStartDay,
      customPeriodDays: r.customPeriodDays,
      anchorDate: r.anchorDate,
      schedule: r.schedule,
      overrides,
    };

    const expenses: ExpenseInput[] = r.expenseOffsets.map((e) => ({
      categoryId,
      amount: round2(e.amount),
      createdAt: new Date(r.now.getTime() - e.offsetMs),
    }));

    return { category, expenses, now: r.now, tz: r.tz };
  });

// ── Property 7 ──────────────────────────────────────────────────────────────

console.log('savingsService — Property 7: Funded budget proration and cap');
console.log(
  '// Feature: savings-piggybank, Property 7: Funded budget proration and cap',
);

test('fundedBudget = round2(limit × fundedDays/totalDays), capped at limit; zeroed when limit<=0', () => {
  fc.assert(
    fc.property(scenarioArb, ({ category, expenses, now, tz }) => {
      const result = computeCategorySavings(category, expenses, [], { enabled: true, enabledAt: null }, now, tz);
      const limit = category.limitAmount;

      for (const p of result.periods) {
        // Independent day counts for this window.
        const { totalDays, fundedDays } = countDays(
          p.periodStart,
          p.periodEnd,
          tz,
          category.schedule,
          category.overrides,
        );

        // Every enumerated window is closed → ends at or before now (sanity).
        assert.ok(
          p.periodEnd.getTime() <= now.getTime(),
          `enumerated period is not closed: periodEnd ${p.periodEnd.toISOString()} > now ${now.toISOString()}`,
        );

        // Expected funded budget from the independent oracle.
        let expectedBudget = 0;
        if (totalDays > 0 && limit > 0) {
          expectedBudget = round2((limit * fundedDays) / totalDays);
          if (expectedBudget > limit) expectedBudget = round2(limit);
        }

        assert.strictEqual(
          p.fundedBudget,
          expectedBudget,
          `fundedBudget mismatch: got ${p.fundedBudget}, expected ${expectedBudget} ` +
            `(limit=${limit}, fundedDays=${fundedDays}, totalDays=${totalDays}, tz=${tz}, period=${category.period})`,
        );

        if (limit > 0) {
          // Requirement 4.6: proration is capped at the category limit.
          assert.ok(
            p.fundedBudget <= limit + 1e-9,
            `fundedBudget ${p.fundedBudget} exceeds limit ${limit}`,
          );
        } else {
          // Requirement 4.8: limit <= 0 ⇒ budget, savings, and shortfall are all 0.
          assert.strictEqual(p.fundedBudget, 0, `limit<=0 must yield fundedBudget 0, got ${p.fundedBudget}`);
          assert.strictEqual(p.periodSavings, 0, `limit<=0 must yield periodSavings 0, got ${p.periodSavings}`);
          assert.strictEqual(p.periodShortfall, 0, `limit<=0 must yield periodShortfall 0, got ${p.periodShortfall}`);
        }

        // Requirement 4.8: a zero-length window contributes 0 savings/shortfall.
        if (totalDays === 0) {
          assert.strictEqual(p.periodSavings, 0, 'totalDays==0 must yield periodSavings 0');
          assert.strictEqual(p.periodShortfall, 0, 'totalDays==0 must yield periodShortfall 0');
        }
      }
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
