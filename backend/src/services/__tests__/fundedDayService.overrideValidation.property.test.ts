/**
 * Property-based test for the funded-day override validator.
 *
 * Feature: savings-piggybank, Property 2: Funded-day override validation
 *
 * Property 2 (design.md): For any date string and funded state,
 * `validateOverride` accepts it iff the date is a well-formed `YYYY-MM-DD`
 * within `1900-01-01 … 2999-12-31` and the state is funded or unfunded (a
 * boolean), and throws a `ValidationError` for any malformed date,
 * out-of-range date, or invalid state.
 *
 * Validates: Requirements 2.1, 2.3
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/fundedDayService.overrideValidation.property.test.ts
 * Exits non-zero if any assertion / property fails.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import { ValidationError, validateOverride } from '../fundedDayService';

const NUM_RUNS = 300; // >= 100 generated cases per the task requirement.

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
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
const pad = (n: number, len: number): string => String(n).padStart(len, '0');

/** Days in a given (1-based) month, Gregorian leap-year aware. */
const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const MIN_DATE = '1900-01-01';
const MAX_DATE = '2999-12-31';

/**
 * Independent oracle: decide, by the specification alone, whether a given
 * (dateInput, fundedInput) pair should be accepted. Deliberately written
 * without reusing the implementation so it is a genuine cross-check.
 */
function shouldAccept(dateInput: unknown, fundedInput: unknown): boolean {
  if (typeof dateInput !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return false;
  const [y, m, d] = dateInput.split('-').map((s) => parseInt(s, 10));
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > daysInMonth(y, m)) return false;
  // Lexicographic comparison is valid for zero-padded YYYY-MM-DD strings.
  if (dateInput < MIN_DATE || dateInput > MAX_DATE) return false;
  if (typeof fundedInput !== 'boolean') return false;
  return true;
}

// ── Arbitraries ─────────────────────────────────────────────────────────────

/** Well-formed calendar dates inside the accepted 1900–2999 range. */
const validInRangeDate = fc
  .integer({ min: 1900, max: 2999 })
  .chain((year) =>
    fc
      .integer({ min: 1, max: 12 })
      .chain((month) =>
        fc
          .integer({ min: 1, max: daysInMonth(year, month) })
          .map((day) => `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`),
      ),
  );

/** Well-formed calendar dates whose year is OUTSIDE the accepted range. */
const outOfRangeDate = fc
  .oneof(fc.integer({ min: 0, max: 1899 }), fc.integer({ min: 3000, max: 9999 }))
  .chain((year) =>
    fc
      .integer({ min: 1, max: 12 })
      .chain((month) =>
        fc
          .integer({ min: 1, max: daysInMonth(year, month) })
          .map((day) => `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`),
      ),
  );

/** Format-correct (dddd-dd-dd) strings with an impossible month or day. */
const invalidMonthOrDay = fc.oneof(
  // Invalid month: 00 or 13–99.
  fc
    .tuple(
      fc.integer({ min: 1900, max: 2999 }),
      fc.oneof(fc.constant(0), fc.integer({ min: 13, max: 99 })),
      fc.integer({ min: 1, max: 31 }),
    )
    .map(([y, m, d]) => `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`),
  // Invalid day: 00 or beyond the real length of the month (up to 99).
  fc
    .tuple(fc.integer({ min: 1900, max: 2999 }), fc.integer({ min: 1, max: 12 }))
    .chain(([y, m]) =>
      fc
        .oneof(fc.constant(0), fc.integer({ min: daysInMonth(y, m) + 1, max: 99 }))
        .map((d) => `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`),
    ),
);

/** Strings that do not match the YYYY-MM-DD shape at all. */
const malformedDateString = fc.oneof(
  fc.string(),
  fc.constantFrom(
    '',
    '2020-1-1',
    '2020/01/01',
    '01-01-2020',
    '2020-13',
    '2020-01',
    '20200101',
    'abcd-ef-gh',
    '2020-01-01T00:00:00Z',
    '  2020-01-01  ',
    '+2020-01-01',
  ),
  fc.date({ min: new Date('1900-01-01'), max: new Date('2999-12-31') }).map((d) => d.toISOString()),
);

/** Non-string date inputs. */
const nonStringDate = fc.oneof(
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.object(),
  fc.array(fc.anything()),
);

/** Any date input across every category above. */
const anyDateInput = fc.oneof(
  validInRangeDate,
  outOfRangeDate,
  invalidMonthOrDay,
  malformedDateString,
  nonStringDate,
);

/** Non-boolean funded states — including the tempting string forms. */
const invalidFunded = fc.oneof(
  fc.integer(),
  fc.double(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constantFrom('funded', 'unfunded', 'true', 'false', '0', '1'),
  fc.object(),
);

/** Any funded input: valid boolean or invalid. */
const anyFundedInput = fc.oneof(fc.boolean(), invalidFunded);

// ── Properties ────────────────────────────────────────────────────────────

console.log('fundedDayService — Property 2: Funded-day override validation');

// Core "accepts iff" property across the whole input space, checked against
// the independent oracle.
test('validateOverride accepts iff (well-formed in-range date) AND (boolean state)', () => {
  fc.assert(
    fc.property(anyDateInput, anyFundedInput, (dateInput, fundedInput) => {
      const expectAccept = shouldAccept(dateInput, fundedInput);
      if (expectAccept) {
        const result = validateOverride(dateInput, fundedInput);
        assert.deepStrictEqual(result, { date: dateInput, funded: fundedInput });
      } else {
        assert.throws(
          () => validateOverride(dateInput, fundedInput),
          (e: unknown) => e instanceof ValidationError,
        );
      }
    }),
    { numRuns: NUM_RUNS },
  );
});

// Positive direction: every valid in-range date with a boolean is accepted and
// returned normalized, unchanged.
test('accepts every well-formed in-range date with a boolean state', () => {
  fc.assert(
    fc.property(validInRangeDate, fc.boolean(), (date, funded) => {
      assert.deepStrictEqual(validateOverride(date, funded), { date, funded });
    }),
    { numRuns: NUM_RUNS },
  );
});

// Negative: well-formed but out-of-range dates are always rejected.
test('rejects well-formed dates outside 1900-01-01 … 2999-12-31', () => {
  fc.assert(
    fc.property(outOfRangeDate, fc.boolean(), (date, funded) => {
      assert.throws(
        () => validateOverride(date, funded),
        (e: unknown) => e instanceof ValidationError,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// Negative: format-correct strings with impossible month/day are rejected.
test('rejects format-correct strings with an invalid month or day', () => {
  fc.assert(
    fc.property(invalidMonthOrDay, fc.boolean(), (date, funded) => {
      assert.throws(
        () => validateOverride(date, funded),
        (e: unknown) => e instanceof ValidationError,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// Negative: malformed date strings are rejected. (Guard against the vanishingly
// rare case that a random string happens to be a valid in-range date.)
test('rejects malformed date strings', () => {
  fc.assert(
    fc.property(malformedDateString, fc.boolean(), (date, funded) => {
      if (shouldAccept(date, funded)) return; // not actually malformed; skip
      assert.throws(
        () => validateOverride(date, funded),
        (e: unknown) => e instanceof ValidationError,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// Negative: a non-boolean funded state is rejected even when the date is valid.
test('rejects a non-boolean funded state (even with a valid date)', () => {
  fc.assert(
    fc.property(validInRangeDate, invalidFunded, (date, funded) => {
      assert.throws(
        () => validateOverride(date, funded),
        (e: unknown) => e instanceof ValidationError,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// Boundary dates are accepted (inclusive bounds).
test('accepts the inclusive boundary dates', () => {
  assert.deepStrictEqual(validateOverride(MIN_DATE, true), { date: MIN_DATE, funded: true });
  assert.deepStrictEqual(validateOverride(MAX_DATE, false), { date: MAX_DATE, funded: false });
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
