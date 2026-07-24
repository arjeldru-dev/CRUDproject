/**
 * Property-based test for the Savings_API timezone resolver `resolveTimezone`
 * (savings-piggybank feature).
 *
 * // Feature: savings-piggybank, Property 13: Timezone resolution order
 *
 * Property 13 (design.md): For any combination of `x-timezone` header value and
 * stored `UserGamification.timezone`, `resolveTimezone` returns the header value
 * when it is a valid IANA identifier, otherwise the stored value when it is
 * valid, otherwise `UTC`; it always returns a valid identifier and never throws.
 *
 * Validates: Requirements 7.4, 7.5, 10.4, 10.5
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/controllers/__tests__/savingsController.timezone.property.test.ts
 * Exits non-zero if any assertion / property fails.
 *
 * Uses `fast-check` (already installed in backend/node_modules) with a minimum
 * of 100 generated cases per property. The exported `isValidTimezone` from
 * `fundedDayService` is used as the independent oracle for what counts as a
 * valid IANA identifier — the same predicate the resolver itself relies on.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import { resolveTimezone } from '../savingsController';
import { isValidTimezone } from '../../services/fundedDayService';

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

// ── Arbitraries ───────────────────────────────────────────────────────────

/** A spread of genuinely-valid IANA identifiers (whole/half/quarter-hour
 *  offsets, DST zones, and the canonical fallback). */
const VALID_TZS = [
  'UTC',
  'Etc/UTC',
  'America/New_York',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata', // +05:30
  'Asia/Kathmandu', // +05:45
  'Asia/Manila',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Honolulu',
  'Pacific/Chatham', // +12:45 / +13:45
  'Pacific/Kiritimati', // +14:00
];

const validTzArb = fc.constantFrom(...VALID_TZS);

/** Strings that are very likely NOT valid IANA identifiers. Any generated value
 *  that `isValidTimezone` happens to accept is filtered out per-property. */
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

/** Non-string header values that must never be selected as the timezone. */
const nonStringHeader = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.boolean(),
  fc.constant({}),
  fc.array(fc.string()),
);

/** Stored timezone values: strings (valid or not), plus null/undefined. */
const storedArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  validTzArb,
  likelyInvalidTz,
  fc.constant(null),
  fc.constant(undefined),
);

/** Header values: strings (valid or not), plus assorted non-string types. */
const headerArb: fc.Arbitrary<unknown> = fc.oneof(validTzArb, likelyInvalidTz, nonStringHeader);

console.log('savingsController — resolveTimezone property tests');
console.log('// Feature: savings-piggybank, Property 13: Timezone resolution order');

// ── Property 13 — full specification, one assertion per branch ──────────────
// The resolver mirrors this reference oracle for EVERY input, and the returned
// value is always a valid IANA identifier and never throws.
//
// Validates: Requirements 7.4, 7.5, 10.4, 10.5
test('resolveTimezone matches the header→stored→UTC precedence oracle', () => {
  fc.assert(
    fc.property(headerArb, storedArb, (headerTz, storedTz) => {
      let result: string;
      // Never throws (Requirements 7.4, 7.5, 10.4, 10.5).
      try {
        result = resolveTimezone(headerTz, storedTz);
      } catch (err) {
        assert.fail(
          `resolveTimezone threw for header=${JSON.stringify(headerTz)} stored=${JSON.stringify(
            storedTz,
          )}: ${(err as Error).message}`,
        );
      }

      const headerValid = typeof headerTz === 'string' && isValidTimezone(headerTz);
      const storedValid = typeof storedTz === 'string' && isValidTimezone(storedTz);

      // Independent reference for the required precedence order.
      const expected = headerValid
        ? (headerTz as string)
        : storedValid
          ? (storedTz as string)
          : 'UTC';

      assert.strictEqual(
        result,
        expected,
        `wrong resolution for header=${JSON.stringify(headerTz)} stored=${JSON.stringify(storedTz)}`,
      );

      // The result is ALWAYS a valid IANA identifier (Requirement: always returns
      // a valid identifier).
      assert.ok(
        isValidTimezone(result),
        `resolveTimezone returned a non-IANA value: ${JSON.stringify(result)}`,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 13 (a): a valid header always wins ─────────────────────────────
// Validates: Requirements 10.4, 7.4
test('a valid header timezone wins regardless of the stored value', () => {
  fc.assert(
    fc.property(validTzArb, storedArb, (headerTz, storedTz) => {
      assert.strictEqual(resolveTimezone(headerTz, storedTz), headerTz);
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 13 (b): invalid/absent header ⇒ valid stored is used ───────────
// Validates: Requirements 10.5, 7.5, 10.4
test('an invalid or absent header falls through to a valid stored timezone', () => {
  fc.assert(
    fc.property(fc.oneof(likelyInvalidTz, nonStringHeader), validTzArb, (headerTz, storedTz) => {
      // Only exercise genuinely-invalid headers (exclude accidental valids).
      fc.pre(!(typeof headerTz === 'string' && isValidTimezone(headerTz)));
      assert.strictEqual(resolveTimezone(headerTz, storedTz), storedTz);
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 13 (c): neither valid ⇒ UTC fallback ───────────────────────────
// Validates: Requirements 7.5, 10.5
test('when neither header nor stored is a valid timezone, falls back to UTC', () => {
  fc.assert(
    fc.property(
      fc.oneof(likelyInvalidTz, nonStringHeader),
      fc.oneof(likelyInvalidTz, fc.constant(null), fc.constant(undefined)),
      (headerTz, storedTz) => {
        fc.pre(!(typeof headerTz === 'string' && isValidTimezone(headerTz)));
        fc.pre(!(typeof storedTz === 'string' && isValidTimezone(storedTz)));
        assert.strictEqual(resolveTimezone(headerTz, storedTz), 'UTC');
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

// ── Fixed deterministic cases (independent of the random generator) ─────────
test('fixed precedence cases resolve as specified', () => {
  // valid header + valid stored → header
  assert.strictEqual(resolveTimezone('Asia/Manila', 'Europe/London'), 'Asia/Manila');
  // invalid header + valid stored → stored
  assert.strictEqual(resolveTimezone('Not/AZone', 'Europe/London'), 'Europe/London');
  // null header + valid stored → stored
  assert.strictEqual(resolveTimezone(null, 'Asia/Tokyo'), 'Asia/Tokyo');
  // undefined header + valid stored → stored
  assert.strictEqual(resolveTimezone(undefined, 'Asia/Tokyo'), 'Asia/Tokyo');
  // valid header + invalid stored → header
  assert.strictEqual(resolveTimezone('UTC', 'Bogus/Zone'), 'UTC');
  // invalid header + invalid stored → UTC
  assert.strictEqual(resolveTimezone('Bogus/Zone', 'Also/Bogus'), 'UTC');
  // invalid header + null stored → UTC
  assert.strictEqual(resolveTimezone('Bogus/Zone', null), 'UTC');
  // null header + null stored → UTC
  assert.strictEqual(resolveTimezone(null, null), 'UTC');
  // undefined header + undefined stored → UTC
  assert.strictEqual(resolveTimezone(undefined, undefined), 'UTC');
  // non-string header (number) + valid stored → stored
  assert.strictEqual(resolveTimezone(42, 'Europe/Berlin'), 'Europe/Berlin');
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
