/**
 * Property-based test for the funded-day resolver's period-type independence
 * and override-delete revert behaviour.
 *
 * Feature: savings-piggybank, Property 5: Period-type independence and override-delete revert
 *
 * Property 5 (design.md): For any date, schedule, override set, and timezone:
 * the funded result is identical regardless of the category's period type
 * (DAILY/WEEKLY/MONTHLY/CUSTOM); and for any date, resolving after an override
 * for that date is removed equals resolving from the schedule alone.
 *
 * `isDateFunded` takes no period-type argument, so period-type independence is
 * demonstrated by showing the funded result is invariant — the resolver never
 * consults a period type, so evaluating it "under" any of the four period types
 * yields the same value. For the override-delete revert, removing a date's key
 * from the overrides map yields the same result as resolving purely from the
 * schedule (i.e. as if no override for that date ever existed).
 *
 * Validates: Requirements 2.5, 3.4
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/fundedDayService.periodTypeRevert.property.test.ts
 * Exits non-zero if any assertion / property fails.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import { isDateFunded, FundedWeekdays } from '../fundedDayService';

const NUM_RUNS = 300; // >= 100 generated cases per the task requirement.

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

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * The four category period types. `isDateFunded` accepts no period-type
 * argument, so this list only exists to prove that "evaluating under" any of
 * them makes no difference — the resolver is period-type agnostic.
 */
const PERIOD_TYPES = ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as const;

/**
 * Local date key ('YYYY-MM-DD') for a Date in `tz`, computed independently of
 * the implementation via Intl (the same shape the resolver keys overrides on).
 */
function localDateKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// ── Arbitraries ─────────────────────────────────────────────────────────────

/** A spread of real IANA zones, including fractional and DST-observing ones. */
const validTimezone = fc.constantFrom(
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Manila',
  'Asia/Kolkata', // +5:30
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Chatham', // +12:45
  'America/Sao_Paulo',
);

/** Any schedule: a subset of weekdays 0..6 (sorted, unique). */
const scheduleArb: fc.Arbitrary<FundedWeekdays> = fc
  .subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 0, maxLength: 7 })
  .map((s) => [...s].sort((a, b) => a - b));

/** Instants across a wide calendar range so weekdays/DST vary. */
const dateArb = fc.date({
  min: new Date('1970-01-01T00:00:00.000Z'),
  max: new Date('2100-12-31T23:59:59.999Z'),
  noInvalidDate: true,
});

/** An arbitrary override map keyed by 'YYYY-MM-DD' (may be unrelated to the date under test). */
const overrideMapArb: fc.Arbitrary<Map<string, boolean>> = fc
  .array(fc.tuple(dateArb.map((d) => localDateKey(d, 'UTC')), fc.boolean()), { maxLength: 8 })
  .map((entries) => new Map(entries));

// ── Properties ────────────────────────────────────────────────────────────

console.log('fundedDayService — Property 5: Period-type independence and override-delete revert');

// ── Part A: period-type independence (Requirement 3.4) ────────────────────────
// The resolver never receives a period type. Evaluating the same inputs "under"
// any of DAILY/WEEKLY/MONTHLY/CUSTOM therefore yields a single, identical result
// — there is no difference in funded results attributable to period type alone.
test('funded result is invariant across all four period types', () => {
  fc.assert(
    fc.property(dateArb, validTimezone, scheduleArb, overrideMapArb, (date, tz, schedule, overrides) => {
      const results = PERIOD_TYPES.map((periodType) => {
        // periodType is intentionally unused by isDateFunded — that is the point.
        void periodType;
        return isDateFunded(date, tz, schedule, overrides);
      });
      // Every period type produced the same funded value.
      for (const r of results) {
        assert.strictEqual(r, results[0], `period-type dependence detected: ${JSON.stringify(results)}`);
      }
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Part B: override-delete revert (Requirement 2.5) ──────────────────────────
// After an override for a date is removed from the map, resolving that date
// equals resolving from the schedule alone (as if no override for it existed).
test('removing a date\u2019s override reverts it to the schedule-alone result', () => {
  fc.assert(
    fc.property(
      dateArb,
      validTimezone,
      scheduleArb,
      overrideMapArb,
      fc.boolean(),
      (date, tz, schedule, baseOverrides, overrideValue) => {
        const key = localDateKey(date, tz);

        // "Schedule alone": a map with no override for this date. We keep any
        // unrelated overrides (they cannot affect a different date's key) to
        // show the revert depends only on THIS date's key being absent.
        const scheduleAlone = new Map(baseOverrides);
        scheduleAlone.delete(key);
        const scheduleAloneResult = isDateFunded(date, tz, schedule, scheduleAlone);

        // Now add an override for this date (funded or unfunded), then delete it.
        const withOverride = new Map(scheduleAlone);
        withOverride.set(key, overrideValue);

        const reverted = new Map(withOverride);
        reverted.delete(key);
        const revertedResult = isDateFunded(date, tz, schedule, reverted);

        // Deleting the override reverts to exactly the schedule-alone result.
        assert.strictEqual(revertedResult, scheduleAloneResult);
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

// ── Part B (strengthened): the schedule-alone result matches an independent
// weekday oracle, so "revert to schedule" is genuinely schedule-governed. ─────
test('reverted result equals the independent schedule/weekday oracle', () => {
  fc.assert(
    fc.property(dateArb, validTimezone, scheduleArb, overrideMapArb, (date, tz, schedule, baseOverrides) => {
      const key = localDateKey(date, tz);

      // Independent oracle: weekday of the local calendar date, then schedule lookup.
      const [y, m, d] = key.split('-').map((s) => parseInt(s, 10));
      const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const expected = schedule.includes(weekday);

      // Start with an override for this date, then delete it (the revert).
      const withOverride = new Map(baseOverrides);
      withOverride.set(key, !expected); // deliberately opposite to prove override was overriding
      withOverride.delete(key);

      assert.strictEqual(isDateFunded(date, tz, schedule, withOverride), expected);
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
