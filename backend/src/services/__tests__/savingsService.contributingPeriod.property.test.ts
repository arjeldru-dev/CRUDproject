/**
 * Property-based test for the ENABLE-GATED contributing-period selection in the
 * savings compute service (`computeCategorySavings`).
 *
 * Feature: savings-piggybank, Property 6: Contributing closed-period enumeration is bounded by `now` and `Savings_Enabled_At`
 *
 * Property 6 (design.md / tasks.md 4.6): For any category, set of EXPENSE
 * transactions, `now`, timezone, and enablement instant `enabledAt`,
 * `computeCategorySavings` contributes savings from a closed period IF AND ONLY
 * IF that period's `periodEnd` is at or after `enabledAt` (Requirements 4.10,
 * 9.4). It never includes the current OPEN period (`periodEnd > now`, Requirement
 * 4.7) and every contributing period is CLOSED (`periodEnd <= now`, Requirement
 * 4.1). A period whose `periodEnd` precedes `enabledAt` is non-contributing and
 * contributes exactly 0.00 to `Category_Accrued_Savings`.
 *
 * Independence of the oracle:
 *   1. The set of ALL closed periods is derived from an INDEPENDENT forward walk
 *      of `getPeriodWindow` (opposite traversal direction from the service's
 *      backward walk), starting from the window containing the earliest
 *      transaction — identical technique to the sibling enumeration test.
 *   2. The EXPECTED contributing set is that forward-oracle set filtered to
 *      `periodEnd >= enabledAt`, computed here (not read from the service).
 *   3. The "exactly 0.00 from pre-enablement periods" claim is cross-checked
 *      against a second, orthogonal axis: an `enabledAt = null` baseline call
 *      (the un-gated code path). The gated accrual must equal the baseline's
 *      accrual restricted to periods with `periodEnd >= enabledAt`, and the
 *      dropped (pre-enablement) periods must account for exactly the difference.
 *
 * Validates: Requirements 4.1, 4.7, 4.10, 9.4
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/savingsService.contributingPeriod.property.test.ts
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
 * INDEPENDENT oracle for the set of ALL closed periods (before any enable gate).
 *
 * Walks FORWARD from the window containing `earliest`: the next window is found
 * by probing `getPeriodWindow` at an instant safely INSIDE the following window
 * (its `periodEnd` boundary plus half a day). Probing an interior instant keeps
 * the step DST-safe for CUSTOM cycles. A window is a CLOSED period iff its
 * `periodEnd <= now`; the first window whose `periodEnd > now` is the current
 * OPEN period and is excluded. This is the opposite traversal direction from the
 * implementation's backward walk, so agreement between them is meaningful.
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
    const probe = new Date(w.periodEnd.getTime() + MS_PER_DAY / 2);
    const next = getPeriodWindow(category.period, opts, probe, tz);
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
 * Build a category + its expenses spread over ~200 days before `now` so the
 * enumeration spans several CLOSED periods. Also carries the raw generator
 * values used to derive `enabledAt` inside the property body.
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
    overrideEntries: fc.array(fc.tuple(fc.integer({ min: 0, max: 210 }), fc.boolean()), {
      maxLength: 10,
    }),
    tz: tzArb,
    now: nowArb,
    expenseOffsets: fc.array(
      fc.record({
        offsetMs: fc.integer({ min: 1, max: 200 * MS_PER_DAY }),
        amount: fc.float({ min: 0, max: Math.fround(20000), noNaN: true }),
      }),
      { minLength: 1, maxLength: 6 },
    ),
    // Enable-instant controls (resolved against actual period ends in the body):
    // days before `now` (negative → future, i.e. after `now`).
    enabledOffsetDays: fc.integer({ min: -5, max: 220 }),
    // When true, snap `enabledAt` to an exact period boundary to exercise the
    // inclusive "at or after" edge (Requirement 9.4).
    snapToBoundary: fc.boolean(),
    boundaryIndex: fc.nat(),
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

    return {
      category,
      expenses,
      now: r.now,
      tz: r.tz,
      enabledOffsetDays: r.enabledOffsetDays,
      snapToBoundary: r.snapToBoundary,
      boundaryIndex: r.boundaryIndex,
    };
  });

// ── Property 6 ──────────────────────────────────────────────────────────────

console.log(
  'savingsService — Property 6: Contributing closed-period enumeration is bounded by now and Savings_Enabled_At',
);
console.log(
  '// Feature: savings-piggybank, Property 6: Contributing closed-period enumeration is bounded by `now` and `Savings_Enabled_At`',
);

test('contributing periods == closed periods with periodEnd >= enabledAt; open period excluded; pre-enable periods contribute 0.00', () => {
  fc.assert(
    fc.property(scenarioArb, (s) => {
      const { category, expenses, now, tz } = s;

      const earliest = expenses.reduce(
        (min, e) => (e.createdAt.getTime() < min.getTime() ? e.createdAt : min),
        expenses[0].createdAt,
      );

      // Independent forward-oracle: the full set of closed periods (un-gated).
      const fullClosed = expectedClosedWindows(category, earliest, now, tz);

      // The current window is the OPEN period: it must end strictly after `now`.
      const open = getPeriodWindow(category.period, toPeriodOpts(category), now, tz);
      assert.ok(
        open.periodEnd.getTime() > now.getTime(),
        `current window is not open: periodEnd ${open.periodEnd.toISOString()} <= now ${now.toISOString()}`,
      );

      // Derive the enablement instant. Optionally snap it EXACTLY onto a closed
      // period's `periodEnd` boundary to exercise the inclusive edge (a period
      // whose periodEnd === enabledAt MUST contribute — Requirement 9.4).
      let enabledAt: Date;
      if (s.snapToBoundary && fullClosed.length > 0) {
        const idx = s.boundaryIndex % fullClosed.length;
        enabledAt = new Date(fullClosed[idx].periodEnd.getTime());
      } else {
        enabledAt = new Date(now.getTime() - s.enabledOffsetDays * MS_PER_DAY);
      }

      // EXPECTED contributing set = forward-oracle closed periods with
      // periodEnd >= enabledAt (Requirements 4.7, 4.10, 9.4).
      const expected = fullClosed.filter(
        (w) => w.periodEnd.getTime() >= enabledAt.getTime(),
      );

      const gated = computeCategorySavings(
        category,
        expenses,
        [],
        { enabled: true, enabledAt },
        now,
        tz,
      );

      // Un-gated baseline (orthogonal code path) for the 0.00 cross-check.
      const baseline = computeCategorySavings(
        category,
        expenses,
        [],
        { enabled: true, enabledAt: null },
        now,
        tz,
      );

      // ── Boundedness invariants on every contributing period ──────────────
      for (const p of gated.periods) {
        // Requirement 4.1/4.7: every contributing period is CLOSED.
        assert.ok(
          p.periodEnd.getTime() <= now.getTime(),
          `contributing period is not closed: periodEnd ${p.periodEnd.toISOString()} > now ${now.toISOString()}`,
        );
        // Requirement 4.10/9.4: never before the enable instant.
        assert.ok(
          p.periodEnd.getTime() >= enabledAt.getTime(),
          `contributing period precedes enabledAt: periodEnd ${p.periodEnd.toISOString()} < enabledAt ${enabledAt.toISOString()}`,
        );
        // Requirement 4.7: the current open period is never included.
        assert.ok(
          !(
            p.periodStart.getTime() === open.periodStart.getTime() &&
            p.periodEnd.getTime() === open.periodEnd.getTime()
          ),
          'the current open period must never be a contributing period',
        );
      }

      // ── Exact contributing SET equality against the independent oracle ───
      assert.strictEqual(
        gated.periods.length,
        expected.length,
        `contributing count mismatch: got ${gated.periods.length}, expected ${expected.length} ` +
          `(period=${category.period}, tz=${tz}, enabledAt=${enabledAt.toISOString()})`,
      );
      for (let i = 0; i < expected.length; i++) {
        assert.strictEqual(
          gated.periods[i].periodStart.getTime(),
          expected[i].periodStart.getTime(),
          `periodStart mismatch at index ${i} (period=${category.period}, tz=${tz})`,
        );
        assert.strictEqual(
          gated.periods[i].periodEnd.getTime(),
          expected[i].periodEnd.getTime(),
          `periodEnd mismatch at index ${i} (period=${category.period}, tz=${tz})`,
        );
      }

      // ── "Exactly 0.00 from pre-enablement periods" (Requirement 4.10) ────
      // Cross-check against the un-gated baseline: the gated accrual must equal
      // the baseline accrual restricted to periods with periodEnd >= enabledAt,
      // and the dropped (pre-enable) periods must account for exactly the rest.
      const kept = baseline.periods.filter(
        (p) => p.periodEnd.getTime() >= enabledAt.getTime(),
      );
      const dropped = baseline.periods.filter(
        (p) => p.periodEnd.getTime() < enabledAt.getTime(),
      );

      const expectedGatedAccrued = round2(
        kept.reduce((sum, p) => sum + p.periodSavings, 0),
      );
      assert.strictEqual(
        gated.accruedSavings,
        expectedGatedAccrued,
        `gated accrued mismatch: got ${gated.accruedSavings}, expected ${expectedGatedAccrued} ` +
          `(kept ${kept.length}/${baseline.periods.length} periods, enabledAt=${enabledAt.toISOString()})`,
      );

      // The pre-enablement periods contribute exactly the difference — i.e. each
      // of them contributed exactly 0.00 to the gated accrual.
      const droppedSavings = round2(dropped.reduce((sum, p) => sum + p.periodSavings, 0));
      assert.strictEqual(
        round2(baseline.accruedSavings - gated.accruedSavings),
        droppedSavings,
        `pre-enablement contribution not exactly excluded: baseline ${baseline.accruedSavings} − ` +
          `gated ${gated.accruedSavings} != dropped ${droppedSavings}`,
      );

      // Per-period savings for the KEPT periods must be identical between the
      // gated result and the baseline (same windows → same deterministic math),
      // confirming gating only removes periods and never rescales them.
      assert.strictEqual(
        gated.periods.length,
        kept.length,
        `gated/baseline kept-period count mismatch: ${gated.periods.length} vs ${kept.length}`,
      );
      for (let i = 0; i < kept.length; i++) {
        assert.strictEqual(
          gated.periods[i].periodSavings,
          kept[i].periodSavings,
          `kept-period savings mismatch at index ${i}: ${gated.periods[i].periodSavings} vs ${kept[i].periodSavings}`,
        );
      }

      // ── Degenerate edge: enabledAt strictly after `now` → nothing contributes ─
      if (enabledAt.getTime() > now.getTime()) {
        assert.strictEqual(
          gated.periods.length,
          0,
          `enabledAt after now must yield no contributing periods, got ${gated.periods.length}`,
        );
        assert.strictEqual(
          gated.accruedSavings,
          0,
          `enabledAt after now must yield 0.00 accrual, got ${gated.accruedSavings}`,
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
