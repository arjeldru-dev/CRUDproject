/**
 * Property-based tests for fundedDayService (savings-piggybank feature).
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/fundedDayService.property.test.ts
 * Exits non-zero if any property fails.
 *
 * Uses `fast-check` (already installed in backend/node_modules) with a minimum
 * of 100 generated cases per property.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import { validateFundedWeekdays, ValidationError } from '../fundedDayService';

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

/**
 * Reference oracle: an input is a *valid* schedule iff it is an array whose
 * every element is an integer in 0..6 with no duplicates.
 */
function isValidSchedule(input: unknown): boolean {
  if (!Array.isArray(input)) return false;
  const seen = new Set<unknown>();
  for (const v of input) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 6) return false;
    if (seen.has(v)) return false;
    seen.add(v);
  }
  return true;
}

function isSortedUniqueInRange(arr: number[]): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isInteger(arr[i]) || arr[i] < 0 || arr[i] > 6) return false;
    if (i > 0 && arr[i] <= arr[i - 1]) return false; // strictly increasing ⇒ sorted + unique
  }
  return true;
}

console.log('fundedDayService — property tests');
console.log('// Feature: savings-piggybank, Property 1: Funded-day schedule validation');

// ── Property 1 (general oracle form) ──────────────────────────────────────────
// For ANY array of values, validateFundedWeekdays returns a sorted, duplicate-
// free set of ints in 0..6 exactly when the input is a valid schedule, and
// throws ValidationError otherwise.
//
// Validates: Requirements 1.1, 1.4
test('accepts iff valid; result is sorted, unique, in 0..6, and preserves the set', () => {
  const anyElement = fc.oneof(
    fc.integer({ min: 0, max: 6 }), // in-range ints (drives valid + duplicate cases)
    fc.integer(), // any int, often out of range
    fc.double(), // non-integers / NaN / Infinity
    fc.string(), // non-numbers
    fc.constantFrom(null, undefined, true, {} as unknown),
  );

  fc.assert(
    fc.property(fc.array(anyElement, { maxLength: 12 }), (input) => {
      if (isValidSchedule(input)) {
        const result = validateFundedWeekdays(input);
        // sorted, unique, every element in 0..6
        assert.ok(isSortedUniqueInRange(result), `result not sorted/unique/in-range: ${JSON.stringify(result)}`);
        // same set as the (already-unique) input
        const expected = [...(input as number[])].sort((a, b) => a - b);
        assert.deepStrictEqual(result, expected);
        // 0..7 entries (naturally bounded)
        assert.ok(result.length >= 0 && result.length <= 7);
      } else {
        assert.throws(
          () => validateFundedWeekdays(input),
          (e: unknown) => e instanceof ValidationError,
          `expected ValidationError for invalid input ${JSON.stringify(input)}`,
        );
      }
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 1 (valid subset, thorough positive coverage) ─────────────────────
// Any shuffled subset of {0..6} is accepted and normalized to sorted+unique.
test('any shuffled subset of 0..6 is accepted and sorted', () => {
  fc.assert(
    fc.property(
      fc.subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 0, maxLength: 7 }).chain((sub) =>
        // shuffle the chosen subset so ordering does not matter
        fc.constant(sub).chain((s) => fc.shuffledSubarray(s, { minLength: s.length, maxLength: s.length })),
      ),
      (shuffled) => {
        const result = validateFundedWeekdays(shuffled);
        assert.deepStrictEqual(result, [...shuffled].sort((a, b) => a - b));
        assert.ok(isSortedUniqueInRange(result));
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 1 (out-of-range rejection) ───────────────────────────────────────
// Any array containing at least one out-of-range or non-integer value throws.
test('rejects arrays containing an out-of-range or non-integer value', () => {
  const badValue = fc.oneof(
    fc.integer({ min: 7 }),
    fc.integer({ max: -1 }),
    fc.double({ min: 0, max: 6, noInteger: true, noNaN: true }),
  );
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 6 }), { maxLength: 6 }),
      badValue,
      (base, bad) => {
        // splice the bad value somewhere into an otherwise in-range array
        const input = [...base, bad];
        assert.throws(
          () => validateFundedWeekdays(input),
          (e: unknown) => e instanceof ValidationError,
        );
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 1 (duplicate rejection) ──────────────────────────────────────────
// Any array of in-range ints that contains a duplicate throws.
test('rejects arrays containing a duplicate weekday', () => {
  fc.assert(
    fc.property(
      // a non-empty in-range base, plus a duplicate of one of its elements
      fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 7 }),
      fc.nat(),
      (base, pick) => {
        const dup = base[pick % base.length];
        const input = [...base, dup]; // guaranteed at least one duplicate
        assert.throws(
          () => validateFundedWeekdays(input),
          (e: unknown) => e instanceof ValidationError,
        );
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 1 (non-array rejection) ──────────────────────────────────────────
test('rejects any non-array input', () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.integer(), fc.string(), fc.double(), fc.object(), fc.constantFrom(null, undefined, true)),
      (notArray) => {
        assert.throws(
          () => validateFundedWeekdays(notArray),
          (e: unknown) => e instanceof ValidationError,
        );
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
