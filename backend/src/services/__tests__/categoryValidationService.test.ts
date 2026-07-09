/**
 * Unit tests for categoryValidationService.
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/categoryValidationService.test.ts
 * Exits non-zero if any assertion fails.
 */
import assert from 'node:assert';
import {
  MAX_LIMIT,
  MAX_NAME_LENGTH,
  ValidationError,
  isBudgetPeriod,
  normalizePeriodConfig,
  parseAnchorDate,
  validateLimitAmount,
  validateName,
} from '../categoryValidationService';

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

/** Assert that `fn` throws a ValidationError. */
function throwsValidation(fn: () => unknown) {
  assert.throws(fn, (e: unknown) => e instanceof ValidationError);
}

console.log('categoryValidationService');

// ── validateName ────────────────────────────────────────────────────────────
test('trims a valid name', () => {
  assert.strictEqual(validateName('  Dining Out  '), 'Dining Out');
});

test('rejects a non-string name', () => {
  throwsValidation(() => validateName(123 as unknown));
  throwsValidation(() => validateName({} as unknown));
  throwsValidation(() => validateName(null as unknown));
  throwsValidation(() => validateName(undefined as unknown));
});

test('rejects an empty / whitespace-only name', () => {
  throwsValidation(() => validateName(''));
  throwsValidation(() => validateName('   '));
});

test('rejects a name over the length cap', () => {
  throwsValidation(() => validateName('x'.repeat(MAX_NAME_LENGTH + 1)));
});

test('accepts a name exactly at the length cap', () => {
  const name = 'x'.repeat(MAX_NAME_LENGTH);
  assert.strictEqual(validateName(name), name);
});

// ── validateLimitAmount ───────────────────────────────────────────────────────
test('accepts a valid limit and rounds to 2 decimals', () => {
  assert.strictEqual(validateLimitAmount(100), 100);
  assert.strictEqual(validateLimitAmount(100.005), 100.01);
  assert.strictEqual(validateLimitAmount(0), 0);
});

test('rejects NaN (the old guard let this through into a Prisma 500)', () => {
  throwsValidation(() => validateLimitAmount(Number.NaN));
});

test('rejects ±Infinity', () => {
  throwsValidation(() => validateLimitAmount(Number.POSITIVE_INFINITY));
  throwsValidation(() => validateLimitAmount(Number.NEGATIVE_INFINITY));
});

test('rejects a non-number limit', () => {
  throwsValidation(() => validateLimitAmount('100' as unknown));
  throwsValidation(() => validateLimitAmount(null as unknown));
});

test('rejects a negative limit', () => {
  throwsValidation(() => validateLimitAmount(-1));
});

test('rejects a limit above the Decimal(10,2) ceiling', () => {
  throwsValidation(() => validateLimitAmount(MAX_LIMIT + 0.01));
  // The old app cap (999,999,999) exceeded the DB column and crashed on insert.
  throwsValidation(() => validateLimitAmount(999_999_999));
});

test('accepts a limit exactly at the ceiling', () => {
  assert.strictEqual(validateLimitAmount(MAX_LIMIT), MAX_LIMIT);
});

// ── isBudgetPeriod ────────────────────────────────────────────────────────────
test('recognizes valid periods and rejects junk', () => {
  assert.strictEqual(isBudgetPeriod('MONTHLY'), true);
  assert.strictEqual(isBudgetPeriod('DAILY'), true);
  assert.strictEqual(isBudgetPeriod('YEARLY'), false);
  assert.strictEqual(isBudgetPeriod(undefined), false);
  assert.strictEqual(isBudgetPeriod(5), false);
});

// ── normalizePeriodConfig: DAILY ──────────────────────────────────────────────
test('DAILY nulls out every sub-field', () => {
  const c = normalizePeriodConfig('DAILY', {});
  assert.deepStrictEqual(c, {
    period: 'DAILY', monthlyStartDay: null, weeklyStartDay: null, customPeriodDays: null, anchorDate: null,
  });
});

// ── normalizePeriodConfig: WEEKLY ─────────────────────────────────────────────
test('WEEKLY accepts a valid start day and clears other fields', () => {
  const c = normalizePeriodConfig('WEEKLY', { weeklyStartDay: 1, monthlyStartDay: 15 });
  assert.strictEqual(c.weeklyStartDay, 1);
  assert.strictEqual(c.monthlyStartDay, null);
});

test('WEEKLY rejects an out-of-range or non-integer start day', () => {
  throwsValidation(() => normalizePeriodConfig('WEEKLY', { weeklyStartDay: 7 }));
  throwsValidation(() => normalizePeriodConfig('WEEKLY', { weeklyStartDay: -1 }));
  throwsValidation(() => normalizePeriodConfig('WEEKLY', { weeklyStartDay: 2.5 }));
  throwsValidation(() => normalizePeriodConfig('WEEKLY', {}));
});

// ── normalizePeriodConfig: MONTHLY ────────────────────────────────────────────
test('MONTHLY defaults to the calendar 1st when start day omitted', () => {
  const c = normalizePeriodConfig('MONTHLY', {});
  assert.strictEqual(c.monthlyStartDay, null);
});

test('MONTHLY accepts 1–31 and the -1 "last day" sentinel', () => {
  assert.strictEqual(normalizePeriodConfig('MONTHLY', { monthlyStartDay: 15 }).monthlyStartDay, 15);
  assert.strictEqual(normalizePeriodConfig('MONTHLY', { monthlyStartDay: -1 }).monthlyStartDay, -1);
});

test('MONTHLY rejects 0, >31, and non-integers', () => {
  throwsValidation(() => normalizePeriodConfig('MONTHLY', { monthlyStartDay: 0 }));
  throwsValidation(() => normalizePeriodConfig('MONTHLY', { monthlyStartDay: 32 }));
  throwsValidation(() => normalizePeriodConfig('MONTHLY', { monthlyStartDay: 3.5 }));
});

// ── normalizePeriodConfig: CUSTOM ─────────────────────────────────────────────
test('CUSTOM requires a valid day count and anchor date', () => {
  const c = normalizePeriodConfig('CUSTOM', { customPeriodDays: 14, anchorDate: '2025-01-01' });
  assert.strictEqual(c.customPeriodDays, 14);
  assert.ok(c.anchorDate instanceof Date);
});

test('CUSTOM rejects an out-of-range day count', () => {
  throwsValidation(() => normalizePeriodConfig('CUSTOM', { customPeriodDays: 0, anchorDate: '2025-01-01' }));
  throwsValidation(() => normalizePeriodConfig('CUSTOM', { customPeriodDays: 367, anchorDate: '2025-01-01' }));
});

test('CUSTOM rejects a missing or unparseable anchor date', () => {
  throwsValidation(() => normalizePeriodConfig('CUSTOM', { customPeriodDays: 14 }));
  throwsValidation(() => normalizePeriodConfig('CUSTOM', { customPeriodDays: 14, anchorDate: 'not-a-date' }));
});

// ── parseAnchorDate ───────────────────────────────────────────────────────────
test('parseAnchorDate normalizes to UTC midnight', () => {
  const d = parseAnchorDate('2025-03-15T18:30:00Z');
  assert.strictEqual(d.getUTCHours(), 0);
  assert.strictEqual(d.getUTCFullYear(), 2025);
  assert.strictEqual(d.getUTCMonth(), 2);
  assert.strictEqual(d.getUTCDate(), 15);
});

test('parseAnchorDate rejects invalid input', () => {
  throwsValidation(() => parseAnchorDate('garbage'));
  throwsValidation(() => parseAnchorDate(42 as unknown));
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
