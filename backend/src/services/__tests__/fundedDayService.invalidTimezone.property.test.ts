/**
 * Property-based test for the funded-day resolver's timezone guard.
 *
 * Feature: savings-piggybank, Property 4: Resolver rejects invalid timezones
 *
 * Property 4 (design.md): For any string that is not a valid IANA timezone
 * identifier, `isDateFunded` throws and returns no funded value.
 *
 * Validates: Requirements 3.5
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/fundedDayService.invalidTimezone.property.test.ts
 * Exits non-zero if any assertion / property fails.
 *
 * Uses `fast-check` (already installed in backend/node_modules) with a minimum
 * of 100 generated cases. Generated strings are filtered through the exported
 * `isValidTimezone` so any accidentally-valid identifier is excluded, leaving
 * only genuinely-invalid timezones under test.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import {
  ValidationError,
  isDateFunded,
  isValidTimezone,
  type FundedWeekdays,
} from '../fundedDayService';

const NUM_RUNS = 300; // >= 100 generated cases (task requirement).

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

/**
 * Assert that `isDateFunded` both throws a `ValidationError` AND returns no
 * funded value for the given invalid timezone. `assert.throws` guarantees the
 * call did not return: if the function had returned a boolean instead of
 * throwing, `assert.throws` fails.
 */
function assertRejectsTimezone(
  date: Date,
  tz: string,
  schedule: FundedWeekdays,
  overrides: Map<string, boolean>,
): void {
  assert.throws(
    () => isDateFunded(date, tz, schedule, overrides),
    (e: unknown) => e instanceof ValidationError,
    `expected ValidationError for invalid timezone ${JSON.stringify(tz)}`,
  );
}

// ── Arbitraries ─────────────────────────────────────────────────────────────

/** Any date across a wide instant range; the value is irrelevant since the
 *  guard fires before any date math runs. */
const anyDate = fc
  .date({ min: new Date('1970-01-01T00:00:00Z'), max: new Date('2100-12-31T23:59:59Z') })
  // fast-check may emit an Invalid Date at the extremes; normalize to epoch.
  .map((d) => (Number.isNaN(d.getTime()) ? new Date(0) : d));

/** An effective schedule (any subset of 0..6). Irrelevant to the guard. */
const anySchedule: fc.Arbitrary<FundedWeekdays> = fc
  .subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 0, maxLength: 7 })
  .map((s) => [...s].sort((a, b) => a - b));

/** An arbitrary override map keyed by YYYY-MM-DD. Irrelevant to the guard. */
const anyOverrides: fc.Arbitrary<Map<string, boolean>> = fc
  .array(
    fc.tuple(
      fc
        .date({ min: new Date('1900-01-01'), max: new Date('2999-12-31') })
        .map((d) => (Number.isNaN(d.getTime()) ? '2000-01-01' : d.toISOString().slice(0, 10))),
      fc.boolean(),
    ),
    { maxLength: 5 },
  )
  .map((entries) => new Map(entries));

/**
 * Strings that are very likely NOT valid IANA identifiers. A mix of:
 *  - arbitrary unicode / ascii strings,
 *  - hand-picked look-alikes and near-misses,
 *  - mutations of real zone names with junk appended,
 *  - offset-ish and empty forms.
 * Any generated value that `isValidTimezone` accepts is filtered out below.
 */
const likelyInvalidTz = fc.oneof(
  fc.string(),
  fc.unicodeString(),
  fc.constantFrom(
    '',
    ' ',
    'Not/AZone',
    'Mars/Phobos',
    'XYZ',
    'GMT+25',
    'UTC+99',
    'America/Fake_City',
    'Europe/Atlantis',
    'Asia/Nowhere',
    'america/new_york', // wrong case is not a valid identifier
    'US/PacificOcean',
    'Etc/GMT+99',
    'PST8PDTX',
    '12345',
    'null',
    'undefined',
    '/',
    'Continent/',
    '/City',
    'Region//Sub',
    'Europe/London ', // trailing space
    ' Europe/London', // leading space
  ),
  // Real-ish zone name with random junk appended → almost certainly invalid.
  fc
    .constantFrom('America/New_York', 'Europe/London', 'Asia/Manila', 'UTC', 'Etc/UTC')
    .chain((base) => fc.string({ minLength: 1, maxLength: 8 }).map((junk) => `${base}${junk}`)),
);

// ── Properties ────────────────────────────────────────────────────────────

console.log('fundedDayService — Property 4: Resolver rejects invalid timezones');

// Core property: for any string that is not a valid IANA timezone,
// isDateFunded throws ValidationError and returns no value.
test('isDateFunded throws ValidationError for any non-IANA timezone string', () => {
  fc.assert(
    fc.property(anyDate, likelyInvalidTz, anySchedule, anyOverrides, (date, tz, schedule, overrides) => {
      // Precondition: only exercise genuinely-invalid timezones. Exclude any
      // generated string that turns out to be a valid IANA identifier.
      fc.pre(!isValidTimezone(tz));
      assertRejectsTimezone(date, tz, schedule, overrides);
    }),
    { numRuns: NUM_RUNS },
  );
});

// Explicit coverage of the hand-picked invalid identifiers, so the suite has
// deterministic negatives independent of the random generator's precondition
// filtering. Every one of these must be rejected.
test('rejects a fixed roster of known-invalid identifiers', () => {
  const known = [
    '',
    ' ',
    'Not/AZone',
    'Mars/Phobos',
    'XYZ',
    'GMT+25',
    'America/Fake_City',
    'Europe/London ',
    ' Europe/London',
    'Etc/GMT+99',
    'null',
    '/',
  ];
  const date = new Date('2026-07-04T12:00:00Z');
  const schedule: FundedWeekdays = [1, 2, 3, 4, 5];
  const overrides = new Map<string, boolean>([['2026-07-04', true]]);

  for (const tz of known) {
    // Sanity: our roster really is invalid (guards against a future ICU/data
    // change silently making one of these acceptable).
    assert.ok(!isValidTimezone(tz), `expected ${JSON.stringify(tz)} to be an invalid timezone`);
    // Even when an override exists for this local date, the invalid-tz guard
    // must fire first — no funded value is produced.
    assertRejectsTimezone(date, tz, schedule, overrides);
  }
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
