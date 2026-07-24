/**
 * Property-based test for the Savings_PIN format validator (`validatePinFormat`).
 *
 * Feature: savings-piggybank, Property 13: Savings_PIN format validation
 *
 * Property 13 (design.md): For any input, `validatePinFormat` returns the input
 * unchanged when — and only when — it is a string of exactly 6 characters, each a
 * digit 0–9 (i.e. it matches `PIN_REGEX = /^[0-9]{6}$/`); for anything else — a
 * string of the wrong length, a string containing any non-digit character
 * (letters, symbols, surrounding whitespace, sign, decimal point), or any
 * non-string type (number, boolean, null, undefined, object, array) — it throws a
 * `ValidationError` and returns nothing. The validator is pure: it never hashes
 * and never mutates its input.
 *
 * Validates: Requirements 12.2
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/savingsService.pinFormat.property.test.ts
 * Exits non-zero if any assertion / property fails.
 *
 * Uses `fast-check` (already installed in backend/node_modules) with a minimum of
 * 100 generated cases per property.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import { validatePinFormat, PIN_REGEX } from '../savingsService';
import { ValidationError } from '../../errors';

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

/**
 * Independent oracle: decide, from the specification alone (Requirement 12.2),
 * whether an input should be accepted. Written WITHOUT reusing the implementation
 * so it is a genuine cross-check — a string of exactly six characters each in
 * '0'..'9'.
 */
function shouldAccept(input: unknown): boolean {
  if (typeof input !== 'string') return false;
  if (input.length !== 6) return false;
  for (const ch of input) {
    if (ch < '0' || ch > '9') return false;
  }
  return true;
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

const digitChar = fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9');

/** Exactly-6-digit strings — the only accepted form. */
const validPin = fc
  .array(digitChar, { minLength: 6, maxLength: 6 })
  .map((chars) => chars.join(''));

/** Digit-only strings whose length is NOT 6 (0..5 or 7..20). */
const wrongLengthDigits = fc
  .oneof(
    fc.integer({ min: 0, max: 5 }),
    fc.integer({ min: 7, max: 20 }),
  )
  .chain((len) => fc.array(digitChar, { minLength: len, maxLength: len }).map((c) => c.join('')));

/** A single non-digit character (letters, symbols, whitespace, sign, dot, unicode digit-lookalikes). */
const nonDigitChar = fc.oneof(
  fc.constantFrom(' ', '\t', '\n', '-', '+', '.', ',', 'a', 'Z', '_', '/', '#', '*', 'x'),
  // Full-width / non-ASCII "digits" must NOT be accepted by /^[0-9]{6}$/.
  fc.constantFrom('\uFF10', '\u0660', '\u06F0', '\u2070'),
  fc.char().filter((c) => c < '0' || c > '9'),
);

/** Length-6 strings that contain at least one non-digit character. */
const sixCharsWithNonDigit = fc
  .tuple(
    fc.array(digitChar, { minLength: 5, maxLength: 5 }),
    nonDigitChar,
    fc.integer({ min: 0, max: 5 }),
  )
  .map(([digits, bad, pos]) => {
    const chars = [...digits];
    chars.splice(pos, 0, bad); // insert the bad char → length 6
    return chars.join('');
  });

/** Well-formed 6-digit PIN with surrounding or embedded whitespace (must be rejected). */
const whitespacePin = fc.oneof(
  validPin.map((p) => ` ${p}`),
  validPin.map((p) => `${p} `),
  validPin.map((p) => ` ${p} `),
  validPin.map((p) => `${p.slice(0, 3)} ${p.slice(3)}`),
  validPin.map((p) => `\t${p}`),
);

/** Non-string inputs of many shapes. */
const nonStringInput = fc.oneof(
  fc.integer(),
  fc.integer({ min: 100000, max: 999999 }), // a 6-digit NUMBER — still not a string
  fc.double({ noNaN: true }),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(NaN),
  fc.object(),
  fc.array(fc.anything()),
  fc.array(digitChar, { minLength: 6, maxLength: 6 }), // array of 6 digit chars, NOT a string
);

/** Any invalid string form (wrong length, non-digit content, whitespace, arbitrary). */
const anyInvalidString = fc.oneof(
  wrongLengthDigits,
  sixCharsWithNonDigit,
  whitespacePin,
  fc.string(),
  fc.constantFrom('', '12345', '1234567', '00000a', 'abcdef', '12 456', '-12345', '+12345', '1.2345', '𝟙𝟚𝟛𝟜𝟝𝟞'),
);

/** The full input space: valid PINs, invalid strings, and non-string values. */
const anyInput = fc.oneof(validPin, anyInvalidString, nonStringInput);

// ── Properties ─────────────────────────────────────────────────────────────

console.log('savingsService — Property 13: Savings_PIN format validation');
console.log('// Feature: savings-piggybank, Property 13: Savings_PIN format validation');

// Core "accepts iff" property across the whole input space, checked against the
// independent oracle (Requirement 12.2).
test('validatePinFormat accepts iff input is a string of exactly 6 digits (0-9)', () => {
  fc.assert(
    fc.property(anyInput, (input) => {
      if (shouldAccept(input)) {
        const result = validatePinFormat(input);
        assert.strictEqual(result, input, `accepted PIN should be returned unchanged: ${JSON.stringify(input)}`);
      } else {
        assert.throws(
          () => validatePinFormat(input),
          (e: unknown) => e instanceof ValidationError,
          `expected ValidationError for ${JSON.stringify(input)}`,
        );
      }
    }),
    { numRuns: NUM_RUNS },
  );
});

// Positive: every exactly-6-digit string is accepted and returned unchanged.
test('accepts every exactly-6-digit string and returns it unchanged', () => {
  fc.assert(
    fc.property(validPin, (pin) => {
      assert.strictEqual(validatePinFormat(pin), pin);
      // The oracle and the exported regex agree it is valid.
      assert.ok(PIN_REGEX.test(pin), `PIN_REGEX should match a valid PIN: ${pin}`);
    }),
    { numRuns: NUM_RUNS },
  );
});

// Negative: digit-only strings of any length other than 6 are rejected.
test('rejects digit strings whose length is not exactly 6', () => {
  fc.assert(
    fc.property(wrongLengthDigits, (s) => {
      assert.throws(
        () => validatePinFormat(s),
        (e: unknown) => e instanceof ValidationError,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// Negative: length-6 strings containing any non-digit character are rejected.
test('rejects length-6 strings that contain a non-digit character', () => {
  fc.assert(
    fc.property(sixCharsWithNonDigit, (s) => {
      // Guard against the (excluded) chance the inserted char was itself a digit.
      if (shouldAccept(s)) return;
      assert.throws(
        () => validatePinFormat(s),
        (e: unknown) => e instanceof ValidationError,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// Negative: a valid PIN wrapped in whitespace is rejected (no trimming).
test('rejects 6-digit PINs surrounded by or containing whitespace', () => {
  fc.assert(
    fc.property(whitespacePin, (s) => {
      assert.throws(
        () => validatePinFormat(s),
        (e: unknown) => e instanceof ValidationError,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// Negative: non-string inputs are always rejected — including a 6-digit NUMBER.
test('rejects every non-string input (including a 6-digit number)', () => {
  fc.assert(
    fc.property(nonStringInput, (v) => {
      assert.throws(
        () => validatePinFormat(v),
        (e: unknown) => e instanceof ValidationError,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// Purity: the validator never mutates its input (arrays/objects come back untouched).
test('does not mutate a non-string input while rejecting it', () => {
  fc.assert(
    fc.property(fc.array(digitChar, { minLength: 6, maxLength: 6 }), (arr) => {
      const snapshot = [...arr];
      assert.throws(
        () => validatePinFormat(arr),
        (e: unknown) => e instanceof ValidationError,
      );
      assert.deepStrictEqual(arr, snapshot, 'input array was mutated');
    }),
    { numRuns: NUM_RUNS },
  );
});

// Explicit boundary examples (documented edge cases).
test('boundary examples: all-zeros and all-nines accepted; 5 and 7 digits rejected', () => {
  assert.strictEqual(validatePinFormat('000000'), '000000');
  assert.strictEqual(validatePinFormat('999999'), '999999');
  assert.strictEqual(validatePinFormat('482913'), '482913');
  assert.throws(() => validatePinFormat('00000'), (e: unknown) => e instanceof ValidationError);
  assert.throws(() => validatePinFormat('0000000'), (e: unknown) => e instanceof ValidationError);
  assert.throws(() => validatePinFormat(''), (e: unknown) => e instanceof ValidationError);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
