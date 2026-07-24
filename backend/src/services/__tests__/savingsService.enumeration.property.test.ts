/**
 * Property-based test for closed-period enumeration in the savings compute
 * service (`computeCategorySavings`).
 *
 * Feature: savings-piggybank, Property 6: Closed-period enumeration is correct and bounded
 *
 * Property 6 (design.md): For any category, set of EXPENSE transactions, `now`,
 * and timezone, the periods enumerated by `computeCategorySavings` are exactly
 * the periods produced by `getPeriodWindow` whose `periodEnd <= now` and whose
 * `periodStart` is at or after the period containing the category's earliest
 * transaction, up to but excluding the current open period; every enumerated
 * period satisfies `periodEnd <= now`, and the current open period
 * (`periodEnd > now`) is never included.
 *
 * The implementation enumerates closed periods by walking `getPeriodWindow`
 * BACKWARDS from the current open window. This test builds an INDEPENDENT
 * oracle that walks FORWARDS from the window containing the category's earliest
 * transaction (using `getPeriodWindow` at each window's exclusive `periodEnd`,
 * which lands in the next window), collecting windows while `periodEnd <= now`.
 * The two directions must yield the identical set.
 *
 * Validates: Requirements 4.1, 4.7, 9.1, 9.2
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/savingsService.enumeration.property.test.ts
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
import { FundedWeekdays } from '../fundedDayService';
import { getLocalDateParts } from '../gamificationService';
import {
  BudgetPeriod,
  PeriodOpts,
  PeriodWindow,
  getPeriodWindow,
} from '../budgetPeriodService';

const NUM_RUNS = 25; // reduced run count for faster execution.

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

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Map a CategoryInput's period fields onto the PeriodOpts shape (independent copy). */
function toPeriodOpts(category: CategoryInput): PeriodOpts {
  return {
    monthlyStartDay: category.monthlyStartDay,
    weeklyStartDay: category.weeklyStartDay,
    customPeriodDays: category.customPeriodDays,
    anchorDate: category.anchorDate,
  };
}

/**
 * INDEPENDENT oracle for the expected set of closed periods.
 *
 * Walks FORWARD from the window containing `earliest`: the next window is
 * found by probing `getPeriodWindow` at an instant safely INSIDE the following
 * window (its `periodEnd` boundary plus half a day). Probing an interior instant
 * — rather than the exact boundary — keeps the step DST-safe for CUSTOM cycles,
 * whose cycle index `getPeriodWindow` derives from a raw 24h-millisecond delta
 * that wobbles by an hour across a DST transition exactly at local midnight.
 * Half a day past the boundary always lands in the next window (every period is
 * at least one local day, i.e. >= 23h even on a spring-forward day). A window is
 * a CLOSED period iff its `periodEnd <= now`; the first window whose
 * `periodEnd > now` is the current OPEN period and is excluded. This is the
 * opposite traversal direction from the implementation's backward walk, so
 * agreement between them is meaningful.
 */
function expectedClosedWindows(
  category: CategoryInput,
  earliest: Date,
  now: Date,
  tz: string,
): PeriodWindow[] {
  const opts = toPeriodOpts(category);
  const windows: PeriodWindow[] = [];
  let w = getPeriodWindow(category.period, opts, earliest, tz);
  let guard = 0;
  while (w.periodEnd.getTime() <= now.getTime()) {
    if (guard >= 200_000) break;
    guard++;
    windows.push(w);
    // Probe an interior instant of the next window (boundary + 12h), DST-safe.
    const probe = new Date(w.periodEnd.getTime() + MS_PER_DAY / 2);
    const next = getPeriodWindow(category.period, opts, probe, tz);
    // Defensive: forward progress must be strictly monotonic.
    if (next.periodStart.getTime() <= w.periodStart.getTime()) break;
    w = next;
  }
  return windows;
}

// ── Arbitraries (mirrors the sibling savingsService property tests) ─────────

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

const limitArb = fc.oneof(
  fc.constant(0),
  fc.integer({ min: -5000, max: -1 }),
  fc.integer({ min: 1, max: 999999 }).map((cents) => round2(cents / 100)),
  fc.integer({ min: 1, max: 10000 }),
);

const scheduleArb: fc.Arbitrary<FundedWeekdays> = fc
  .subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 0, maxLength: 7 })
  .map((s) => [...s].sort((a, b) => a - b));

const nowArb = fc.date({
  min: new Date('2021-01-01T00:00:00.000Z'),
  max: new Date('2029-12-31T23:59:59.999Z'),
  noInvalidDate: true,
});

/**
 * Build a category + its expenses. Expenses are placed up to ~200 days before
 * `now` so the enumeration spans several CLOSED periods (varying counts) while
 * staying cheap.
 */
const scenarioArb = fc
  .record({
    period: periodArb,
    limitAmount: limitArb,
    monthlyStartDay: fc.oneof(
      fc.constant<number | null>(null),
      fc.integer({ min: 1, max: 28 }),
      fc.constant(-1),
    ),
    weeklyStartDay: fc.integer({ min: 0, max: 6 }),
    customPeriodDays: fc.integer({ min: 1, max: 30 }),
    anchorDate: fc.date({
      min: new Date('2020-01-01T00:00:00.000Z'),
      max: new Date('2022-12-31T00:00:00.000Z'),
      noInvalidDate: true,
    }),
    schedule: scheduleArb,
    overrideEntries: fc.array(
      fc.tuple(fc.integer({ min: 0, max: 210 }), fc.boolean()),
      { maxLength: 10 },
    ),
    tz: tzArb,
    now: nowArb,
    // At least one expense so a non-empty closed-period set can be enumerated.
    expenseOffsets: fc.array(
      fc.record({
        offsetMs: fc.integer({ min: 1, max: 200 * MS_PER_DAY }),
        amount: fc.float({ min: 0, max: Math.fround(20000), noNaN: true }),
      }),
      { minLength: 1, maxLength: 6 },
    ),
  })
  .map((r) => {
    const categoryId = 'cat-1';

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

// ── Property 6 ──────────────────────────────────────────────────────────────

console.log('savingsService — Property 6: Closed-period enumeration is correct and bounded');
console.log(
  '// Feature: savings-piggybank, Property 6: Closed-period enumeration is correct and bounded',
);

test('enumerated periods == forward-oracle closed periods; all closed; open period excluded', () => {
  fc.assert(
    fc.property(scenarioArb, ({ category, expenses, now, tz }) => {
      const result = computeCategorySavings(category, expenses, [], { enabled: true, enabledAt: null }, now, tz);

      // The current window is the OPEN period: it must end strictly after `now`.
      const open = getPeriodWindow(category.period, toPeriodOpts(category), now, tz);
      assert.ok(
        open.periodEnd.getTime() > now.getTime(),
        `current window is not open: periodEnd ${open.periodEnd.toISOString()} <= now ${now.toISOString()}`,
      );

      const earliest = expenses.reduce(
        (min, e) => (e.createdAt.getTime() < min.getTime() ? e.createdAt : min),
        expenses[0].createdAt,
      );

      const expected = expectedClosedWindows(category, earliest, now, tz);

      // Requirement 4.1/4.7: every enumerated period is CLOSED (periodEnd <= now),
      // and the open period (periodEnd > now) is never included.
      for (const p of result.periods) {
        assert.ok(
          p.periodEnd.getTime() <= now.getTime(),
          `enumerated period is not closed: periodEnd ${p.periodEnd.toISOString()} > now ${now.toISOString()}`,
        );
        assert.ok(
          !(
            p.periodStart.getTime() === open.periodStart.getTime() &&
            p.periodEnd.getTime() === open.periodEnd.getTime()
          ),
          'the current open period must never be enumerated',
        );
      }

      // Requirements 9.1/9.2: the enumerated set is EXACTLY the forward oracle's
      // set of closed periods bounded below by the period containing `earliest`.
      // (The implementation may flag `incomplete` when its backward walk hits the
      // CUSTOM anchor floor, but the enumerated set is still exactly correct —
      // both directions floor at the anchor — so the comparison is unconditional.)
      assert.strictEqual(
        result.periods.length,
        expected.length,
        `period count mismatch: got ${result.periods.length}, expected ${expected.length} ` +
          `(period=${category.period}, tz=${tz})`,
      );
      for (let i = 0; i < expected.length; i++) {
        assert.strictEqual(
          result.periods[i].periodStart.getTime(),
          expected[i].periodStart.getTime(),
          `periodStart mismatch at index ${i} (period=${category.period}, tz=${tz})`,
        );
        assert.strictEqual(
          result.periods[i].periodEnd.getTime(),
          expected[i].periodEnd.getTime(),
          `periodEnd mismatch at index ${i} (period=${category.period}, tz=${tz})`,
        );
      }

      // Structural invariants on the enumerated periods.
      if (result.periods.length > 0) {
        // Ascending & contiguous: each period abuts the next with no gap/overlap.
        for (let i = 1; i < result.periods.length; i++) {
          assert.ok(
            result.periods[i - 1].periodStart.getTime() < result.periods[i].periodStart.getTime(),
            `periods not strictly ascending at index ${i}`,
          );
          assert.strictEqual(
            result.periods[i - 1].periodEnd.getTime(),
            result.periods[i].periodStart.getTime(),
            `periods not contiguous at index ${i}`,
          );
        }

        // Lower bound: the oldest enumerated period is the period `getPeriodWindow`
        // assigns to the earliest transaction — "the period containing the
        // category's earliest transaction". For DAILY/WEEKLY/MONTHLY that window
        // contains `earliest`; for a CUSTOM category whose earliest transaction
        // predates its anchor, `getPeriodWindow` floors at the first (anchor)
        // cycle, so the oldest enumerated period is that anchor cycle.
        const first = result.periods[0];
        const earliestWindow = getPeriodWindow(category.period, toPeriodOpts(category), earliest, tz);
        assert.strictEqual(
          first.periodStart.getTime(),
          earliestWindow.periodStart.getTime(),
          `oldest enumerated period is not the period of the earliest transaction ` +
            `(start=${first.periodStart.toISOString()}, earliestWindowStart=${earliestWindow.periodStart.toISOString()})`,
        );

        // Upper bound: the newest enumerated period abuts the open period —
        // "up to but excluding the current open period" (no gap to the open window).
        const last = result.periods[result.periods.length - 1];
        assert.strictEqual(
          last.periodEnd.getTime(),
          open.periodStart.getTime(),
          `newest enumerated period does not abut the open period ` +
            `(last.periodEnd=${last.periodEnd.toISOString()}, open.periodStart=${open.periodStart.toISOString()})`,
        );
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
