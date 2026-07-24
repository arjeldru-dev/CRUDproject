/**
 * Unit tests for release-to-budget accrual + auto-return in the savings compute
 * service (`savingsService.ts`), covering the "Move savings to budget" feature
 * (feature-spec-savings-release-to-budget, Requirement Group 2).
 *
 * A RELEASE usage is added into the budget of the CLOSED period that contains its
 * `createdAt` (`releasedIntoPeriod`), and is also subtracted as `appliedUsage`.
 * It therefore nets to zero when unspent and to the spent portion when spent —
 * the auto-return. These tests pin the exact worked example from the spec:
 *
 *   piggybank ₱500 (prior accrual), monthly limit ₱1000, release ₱50:
 *     spent ₱0    → balance 1500  (full ₱50 returned + new ₱1000 saved)
 *     spent ₱1030 → balance  470  (₱30 of savings actually used)
 *     spent ₱1050 → balance  450  (full ₱50 used, none returns)
 *
 * They also cover: a release in the CURRENT OPEN period lowers the balance
 * immediately (not yet accrued), and legacy SPEND usages stay pure offsets that
 * never feed a period's budget (historical figures unchanged, spec Rule 6).
 *
 * Validates: Requirement Group 2 (Rules 1–7).
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/savingsRelease.test.ts
 * Exits non-zero if any assertion fails.
 */
import assert from 'node:assert';
import {
  computeCategorySavings,
  CategoryInput,
  ExpenseInput,
  SavingsUsageInput,
} from '../savingsService';
import type { BudgetPeriod } from '../budgetPeriodService';

const TZ = 'UTC';
const ENABLED = { enabled: true, enabledAt: null } as const;

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

/** A fully-funded MONTHLY category (start day 1), limit ₱1000, no overrides. */
function monthlyCategory(overrides: Partial<CategoryInput> = {}): CategoryInput {
  return {
    id: 'cat-1',
    name: 'Food',
    limitAmount: 1000,
    period: 'MONTHLY' as BudgetPeriod,
    monthlyStartDay: 1,
    weeklyStartDay: null,
    customPeriodDays: null,
    anchorDate: null,
    schedule: [0, 1, 2, 3, 4, 5, 6],
    overrides: new Map<string, boolean>(),
    ...overrides,
  };
}

const expense = (amount: number, iso: string): ExpenseInput => ({
  categoryId: 'cat-1',
  amount,
  createdAt: new Date(iso),
});
const release = (amount: number, iso: string): SavingsUsageInput => ({
  categoryId: 'cat-1',
  amount,
  createdAt: new Date(iso),
  kind: 'RELEASE',
});

console.log('savingsService — release-to-budget & auto-return (Requirement Group 2)');

// Worked-example fixture: now is mid-April, so February and March are CLOSED
// periods and April is open. A ₱500 spend in February gives the "prior ₱500"
// (1000 − 500). The ₱50 release lands in March (a closed period).
const NOW_APRIL = new Date('2025-04-15T00:00:00.000Z');
const FEB_BASELINE = expense(500, '2025-02-10T00:00:00.000Z'); // Feb periodSavings = 1000 − 500 = 500
const RELEASE_MARCH = release(50, '2025-03-15T00:00:00.000Z');

// ── Worked example row 1: ₱0 spent in March → full return, balance 1500 ───────
test('release ₱50, ₱0 spent → unspent release returns fully; balance 1500', () => {
  const cat = monthlyCategory();
  const result = computeCategorySavings(cat, [FEB_BASELINE], [RELEASE_MARCH], ENABLED, NOW_APRIL, TZ);
  // Feb 500 + March (1000 + 50 − 0) = 1550 accrued; minus ₱50 applied usage = 1500.
  assert.strictEqual(result.accruedSavings, 1550, `accrued should be 1550, got ${result.accruedSavings}`);
  assert.strictEqual(result.appliedUsage, 50, `appliedUsage should be 50, got ${result.appliedUsage}`);
  assert.strictEqual(result.savingsBalance, 1500, `balance should be 1500, got ${result.savingsBalance}`);
});

// ── Worked example row 2: ₱1030 spent → only ₱20 of the release survives; 470 ─
test('release ₱50, base budget overspent by ₱30 (spend ₱1030) → balance 470', () => {
  const cat = monthlyCategory();
  const expenses = [FEB_BASELINE, expense(1030, '2025-03-16T00:00:00.000Z')];
  const result = computeCategorySavings(cat, expenses, [RELEASE_MARCH], ENABLED, NOW_APRIL, TZ);
  // March periodSavings = max(0, 1000 + 50 − 1030) = 20; accrued 500 + 20 = 520; − 50 usage = 470.
  assert.strictEqual(result.accruedSavings, 520, `accrued should be 520, got ${result.accruedSavings}`);
  assert.strictEqual(result.savingsBalance, 470, `balance should be 470, got ${result.savingsBalance}`);
});

// ── Worked example row 3: ₱1050 spent → whole release consumed; 450 ───────────
test('release ₱50, spend ₱1050 → full release consumed, none returns; balance 450', () => {
  const cat = monthlyCategory();
  const expenses = [FEB_BASELINE, expense(1050, '2025-03-16T00:00:00.000Z')];
  const result = computeCategorySavings(cat, expenses, [RELEASE_MARCH], ENABLED, NOW_APRIL, TZ);
  // March periodSavings = max(0, 1000 + 50 − 1050) = 0; accrued 500; − 50 usage = 450.
  assert.strictEqual(result.accruedSavings, 500, `accrued should be 500, got ${result.accruedSavings}`);
  assert.strictEqual(result.savingsBalance, 450, `balance should be 450, got ${result.savingsBalance}`);
});

// ── Open-period release lowers the balance immediately (auto-return pending) ───
test('a release in the CURRENT OPEN period is not yet accrued but lowers the balance now', () => {
  const cat = monthlyCategory();
  // Baseline: Feb 500 + March 1000 (no March spend) = 1500 accrued, no usage.
  const baseline = computeCategorySavings(cat, [FEB_BASELINE], [], ENABLED, NOW_APRIL, TZ);
  assert.strictEqual(baseline.savingsBalance, 1500, `baseline balance should be 1500, got ${baseline.savingsBalance}`);

  // A ₱50 release in the OPEN April period: April is not enumerated, so accrued
  // is unchanged, but the usage offset drops the visible balance by ₱50 now.
  const openRelease = release(50, '2025-04-05T00:00:00.000Z');
  const withOpen = computeCategorySavings(cat, [FEB_BASELINE], [openRelease], ENABLED, NOW_APRIL, TZ);
  assert.strictEqual(withOpen.accruedSavings, baseline.accruedSavings, 'accrued must not change for an open-period release');
  assert.strictEqual(withOpen.savingsBalance, 1450, `open-period release must lower balance to 1450, got ${withOpen.savingsBalance}`);
});

// ── Legacy SPEND usages are pure offsets — never feed a period's budget ───────
const NOW_MARCH = new Date('2025-03-15T00:00:00.000Z'); // only February is closed

test('a legacy SPEND usage is a pure offset and is NOT added into any period budget', () => {
  const cat = monthlyCategory();
  // Only February is closed → accrued = 1000 − 500 = 500.
  const noUsage = computeCategorySavings(cat, [FEB_BASELINE], [], ENABLED, NOW_MARCH, TZ);
  assert.strictEqual(noUsage.accruedSavings, 500, `accrued should be 500, got ${noUsage.accruedSavings}`);

  const spend: SavingsUsageInput = { categoryId: 'cat-1', amount: 50, createdAt: new Date('2025-02-15T00:00:00.000Z'), kind: 'SPEND' };
  const withSpend = computeCategorySavings(cat, [FEB_BASELINE], [spend], ENABLED, NOW_MARCH, TZ);
  // SPEND must NOT change accrued (historical figures unchanged) — pure offset.
  assert.strictEqual(withSpend.accruedSavings, 500, `SPEND must not change accrued (got ${withSpend.accruedSavings})`);
  assert.strictEqual(withSpend.savingsBalance, 450, `SPEND balance should be 500 − 50 = 450, got ${withSpend.savingsBalance}`);

  // A RELEASE of the same amount in the same closed period DOES feed the budget,
  // so its accrued is higher and the unspent portion returns.
  const rel = release(50, '2025-02-15T00:00:00.000Z');
  const withRelease = computeCategorySavings(cat, [FEB_BASELINE], [rel], ENABLED, NOW_MARCH, TZ);
  assert.strictEqual(withRelease.accruedSavings, 550, `RELEASE should raise accrued to 550, got ${withRelease.accruedSavings}`);
  assert.strictEqual(withRelease.savingsBalance, 500, `RELEASE balance should be 550 − 50 = 500 (full return), got ${withRelease.savingsBalance}`);
});

// ── An omitted `kind` is treated as legacy SPEND (backfill default) ───────────
test('a usage with no kind is treated as legacy SPEND (pure offset)', () => {
  const cat = monthlyCategory();
  const legacy: SavingsUsageInput = { categoryId: 'cat-1', amount: 50, createdAt: new Date('2025-02-15T00:00:00.000Z') };
  const result = computeCategorySavings(cat, [FEB_BASELINE], [legacy], ENABLED, NOW_MARCH, TZ);
  assert.strictEqual(result.accruedSavings, 500, `omitted kind must not feed budget (got ${result.accruedSavings})`);
  assert.strictEqual(result.savingsBalance, 450, `omitted-kind balance should be 450, got ${result.savingsBalance}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
