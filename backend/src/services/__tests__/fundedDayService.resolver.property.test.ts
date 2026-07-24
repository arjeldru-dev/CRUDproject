/**
 * Property-based tests for the Funded_Day_Resolver `isDateFunded`
 * (savings-piggybank feature).
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/fundedDayService.resolver.property.test.ts
 * Exits non-zero if any property fails.
 *
 * Uses `fast-check` (already installed in backend/node_modules) with a minimum
 * of 100 generated cases per property, asserted across multiple timezones.
 *
 * // Feature: savings-piggybank, Property 3: Resolver precedence, schedule lookup, default, and determinism
 */
import assert from 'node:assert';
import fc from 'fast-check';
import { isDateFunded, FundedWeekdays } from '../fundedDayService';
import { getLocalDateParts, getLocalDateStr } from '../gamificationService';

const NUM_RUNS = 200; // ≥ 100 generated cases (design requirement)

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
  }
}

// A spread of valid IANA timezones: whole-hour, half-hour, three-quarter-hour,
// line-of-date extremes, and DST-observing zones (Requirement 3.3 — assert
// across multiple generated timezones).
const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata', // +05:30
  'Asia/Kathmandu', // +05:45
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Honolulu',
  'Pacific/Chatham', // +12:45 / +13:45
  'Pacific/Kiritimati', // +14:00
];

const ALL_SEVEN: FundedWeekdays = [0, 1, 2, 3, 4, 5, 6];

const tzArb = fc.constantFrom(...TIMEZONES);
const dateArb = fc.date({
  min: new Date('1950-01-01T00:00:00.000Z'),
  max: new Date('2100-12-31T23:59:59.999Z'),
  noInvalidDate: true,
});
// Any subset of the seven weekdays, in arbitrary order (the resolver treats the
// schedule as a set).
const scheduleArb = fc.shuffledSubarray([0, 1, 2, 3, 4, 5, 6], { minLength: 0, maxLength: 7 });

/**
 * Independent oracle for the local weekday of `date` in `tz`, computed from the
 * timezone helpers (0=Sun … 6=Sat). Matches how the resolver derives weekday but
 * is written here separately so the test does not call the resolver's internals.
 */
function localWeekday(date: Date, tz: string): number {
  const { year, month, day } = getLocalDateParts(date, tz);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

console.log('fundedDayService — isDateFunded resolver property tests');
console.log(
  '// Feature: savings-piggybank, Property 3: Resolver precedence, schedule lookup, default, and determinism',
);

// ── Property 3 (a): override precedence ───────────────────────────────────────
// When an override exists for the date's LOCAL calendar date, isDateFunded
// returns the override's value regardless of the schedule (Requirement 3.1).
//
// Validates: Requirements 3.1
test('an override for the local date wins over any schedule', () => {
  fc.assert(
    fc.property(dateArb, tzArb, scheduleArb, fc.boolean(), (date, tz, schedule, overrideVal) => {
      const localKey = getLocalDateStr(date, tz);
      // Include a couple of unrelated override entries to prove they are ignored.
      const overrides = new Map<string, boolean>([
        ['1900-01-01', !overrideVal],
        ['2999-12-31', !overrideVal],
        [localKey, overrideVal], // the one that must win
      ]);
      assert.strictEqual(isDateFunded(date, tz, schedule, overrides), overrideVal);
      // Precedence holds even against the maximal (all-seven) schedule.
      assert.strictEqual(isDateFunded(date, tz, ALL_SEVEN, overrides), overrideVal);
      // …and against the empty schedule.
      assert.strictEqual(isDateFunded(date, tz, [], overrides), overrideVal);
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 3 (b): schedule lookup when no override ──────────────────────────
// With no override for the local date, isDateFunded returns true iff the local
// weekday (computed in tz) is in the schedule (Requirement 3.2, 3.3).
//
// Validates: Requirements 3.2, 3.3
test('no override ⇒ funded iff local weekday is in the schedule', () => {
  fc.assert(
    fc.property(dateArb, tzArb, scheduleArb, (date, tz, schedule) => {
      const localKey = getLocalDateStr(date, tz);
      // Overrides that deliberately do NOT match the target local date.
      const overrides = new Map<string, boolean>([
        ['1899-12-31', true],
        ['3000-01-01', false],
      ]);
      overrides.delete(localKey); // ensure no accidental collision
      const weekday = localWeekday(date, tz);
      const expected = schedule.includes(weekday);
      assert.strictEqual(isDateFunded(date, tz, schedule, overrides), expected);
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 3 (b): empty schedule ⇒ never funded (no override) ───────────────
// Validates: Requirements 3.2
test('empty schedule with no override ⇒ never funded', () => {
  fc.assert(
    fc.property(dateArb, tzArb, (date, tz) => {
      assert.strictEqual(isDateFunded(date, tz, [], new Map()), false);
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 3 (b): default all-seven schedule ⇒ always funded (no override) ──
// This is the effective schedule callers substitute when a category has no
// stored schedule (Requirement 1.2).
//
// Validates: Requirements 1.2, 3.2
test('default all-seven schedule with no override ⇒ always funded', () => {
  fc.assert(
    fc.property(dateArb, tzArb, (date, tz) => {
      assert.strictEqual(isDateFunded(date, tz, ALL_SEVEN, new Map()), true);
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 3 (c): determinism ───────────────────────────────────────────────
// Evaluating the same inputs any number of times yields an identical result
// while the schedule, overrides, and timezone are unchanged (Requirement 3.6).
//
// Validates: Requirements 3.6
test('repeated evaluation of unchanged inputs is identical', () => {
  fc.assert(
    fc.property(
      dateArb,
      tzArb,
      scheduleArb,
      fc.boolean(),
      fc.integer({ min: 2, max: 8 }),
      (date, tz, schedule, includeOverride, repeats) => {
        const localKey = getLocalDateStr(date, tz);
        const overrides = includeOverride
          ? new Map<string, boolean>([[localKey, true]])
          : new Map<string, boolean>();
        const first = isDateFunded(date, tz, schedule, overrides);
        for (let i = 0; i < repeats; i++) {
          assert.strictEqual(isDateFunded(date, tz, schedule, overrides), first);
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
