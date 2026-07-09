/**
 * Unit tests for transactionValidationService.
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/transactionValidationService.test.ts
 * Exits non-zero if any assertion fails.
 */
import assert from 'node:assert';
import {
  MAX_AMOUNT,
  MAX_MESSAGE_LENGTH,
  SPLIT_TOLERANCE,
  ValidationError,
  hasAtMostTwoDecimals,
  validateAmount,
  validateMessage,
  validateSplits,
} from '../transactionValidationService';

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

function throwsValidation(fn: () => unknown) {
  assert.throws(fn, (e: unknown) => e instanceof ValidationError);
}

const split = (profileId: string, amount: number) => ({ profileId, amount });

console.log('transactionValidationService');

// ── validateAmount ────────────────────────────────────────────────────────
test('accepts a valid positive amount and returns it unchanged', () => {
  assert.strictEqual(validateAmount(100), 100);
  assert.strictEqual(validateAmount(0.01), 0.01);
  assert.strictEqual(validateAmount(1234.56), 1234.56);
});

test('rejects NaN (old guard let this reach Prisma as a 500)', () => {
  throwsValidation(() => validateAmount(Number.NaN));
});

test('rejects ±Infinity', () => {
  throwsValidation(() => validateAmount(Number.POSITIVE_INFINITY));
  throwsValidation(() => validateAmount(Number.NEGATIVE_INFINITY));
});

test('rejects non-numbers, zero, and negatives', () => {
  throwsValidation(() => validateAmount('100' as unknown));
  throwsValidation(() => validateAmount(null as unknown));
  throwsValidation(() => validateAmount(undefined as unknown));
  throwsValidation(() => validateAmount(0));
  throwsValidation(() => validateAmount(-5));
});

test('rejects amounts above the Decimal(10,2) ceiling', () => {
  throwsValidation(() => validateAmount(MAX_AMOUNT + 0.01));
  // The old frontend allowed 100,000,000 which overflowed the column.
  throwsValidation(() => validateAmount(100_000_000));
});

test('accepts an amount exactly at the ceiling', () => {
  assert.strictEqual(validateAmount(MAX_AMOUNT), MAX_AMOUNT);
});

test('rejects more than 2 decimal places', () => {
  throwsValidation(() => validateAmount(10.001));
  throwsValidation(() => validateAmount(0.999));
});

test('error carries statusCode 400 for the controllers catch blocks', () => {
  try {
    validateAmount(-1);
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e instanceof ValidationError);
    assert.strictEqual((e as ValidationError).statusCode, 400);
  }
});

// ── hasAtMostTwoDecimals ─────────────────────────────────────────────────────
test('hasAtMostTwoDecimals handles float drift', () => {
  assert.strictEqual(hasAtMostTwoDecimals(1.1), true);
  assert.strictEqual(hasAtMostTwoDecimals(10.99), true);
  assert.strictEqual(hasAtMostTwoDecimals(1.115), false);
  assert.strictEqual(hasAtMostTwoDecimals(0.999), false);
});

// ── validateSplits ────────────────────────────────────────────────────────
test('accepts well-formed splits that sum to the total', () => {
  const result = validateSplits([split('self', 50), split('friend-1', 50)], 100);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].amount, 50);
});

test('accepts splits within the rounding tolerance', () => {
  // 100 / 3 style split that lands a few centavos off.
  const result = validateSplits([split('self', 33.33), split('a', 33.33), split('b', 33.33)], 100);
  assert.strictEqual(result.length, 3);
  assert.ok(SPLIT_TOLERANCE >= 0.01);
});

test('rejects an empty or non-array splits value', () => {
  throwsValidation(() => validateSplits([], 100));
  throwsValidation(() => validateSplits(null, 100));
  throwsValidation(() => validateSplits('nope' as unknown, 100));
});

test('rejects a split with a missing/blank profileId', () => {
  throwsValidation(() => validateSplits([split('', 100)], 100));
  throwsValidation(() => validateSplits([{ amount: 100 } as unknown], 100));
});

test('rejects a split with a non-finite or negative amount', () => {
  throwsValidation(() => validateSplits([split('self', Number.NaN)], 100));
  throwsValidation(() => validateSplits([split('self', -10), split('a', 110)], 100));
});

test('rejects a split amount with >2 decimals', () => {
  throwsValidation(() => validateSplits([split('self', 50.005), split('a', 49.995)], 100));
});

test('rejects splits that do not sum to the total', () => {
  throwsValidation(() => validateSplits([split('self', 40), split('a', 40)], 100));
});

// ── validateMessage ──────────────────────────────────────────────────────────
test('passes through undefined/null as undefined', () => {
  assert.strictEqual(validateMessage(undefined), undefined);
  assert.strictEqual(validateMessage(null), undefined);
});

test('trims a valid message and drops whitespace-only to undefined', () => {
  assert.strictEqual(validateMessage('  lunch  '), 'lunch');
  assert.strictEqual(validateMessage('   '), undefined);
});

test('rejects a non-string message', () => {
  throwsValidation(() => validateMessage(123 as unknown));
});

test('accepts a message exactly at the length cap (matches VarChar(255))', () => {
  const msg = 'x'.repeat(MAX_MESSAGE_LENGTH);
  assert.strictEqual(validateMessage(msg), msg);
});

test('rejects a message over the length cap', () => {
  throwsValidation(() => validateMessage('x'.repeat(MAX_MESSAGE_LENGTH + 1)));
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
