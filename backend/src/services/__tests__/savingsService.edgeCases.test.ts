/**
 * Unit / edge-case tests for the savings compute service (`savingsService.ts`).
 *
 * These cover the boundary behaviors called out in task 3.13:
 *   - limitAmount <= 0  → zero savings for the category (Requirement 4.8)
 *   - a category with no transactions → zero balance, no throw (Requirements 5.2, 9.4)
 *   - no categories at all → total 0 and an empty per-category list (Requirement 5.8)
 *
 * They complement the property-based tests (which quantify universal invariants)
 * with concrete, human-readable examples of the important edge cases.
 *
 * Validates: Requirements 4.8, 5.2, 5.8, 9.4
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/savingsService.edgeCases.test.ts
 * Exits non-zero if any assertion fails.
 */
import assert from 'node:assert';
import {
  computeCategorySavings,
  computePiggybank,
  buildTimeSeries,
  CategoryInput,
  CategorySavings,
  ExpenseInput,
} from '../savingsService';

type PiggybankResult = ReturnType<typeof computePiggybank>;
import type { BudgetPeriod } from '../budgetPeriodService';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const TZ = 'UTC';

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

/** Build a DAILY category with an all-seven-weekday schedule and no overrides. */
function makeCategory(overrides: Partial<CategoryInput> = {}): CategoryInput {
  return {
    id: 'cat-1',
    name: 'Food',
    limitAmount: 100,
    period: 'DAILY' as BudgetPeriod,
    monthlyStartDay: null,
    weeklyStartDay: null,
    customPeriodDays: null,
    anchorDate: null,
    schedule: [0, 1, 2, 3, 4, 5, 6],
    overrides: new Map<string, boolean>(),
    ...overrides,
  };
}

console.log('savingsService — edge cases (Requirements 4.8, 5.2, 5.8, 9.4)');

// ── Requirement 4.8: limitAmount <= 0 → zero savings ──────────────────────────
// A category with closed periods (there ARE expenses, so periods are enumerated)
// but a non-positive limit must accrue exactly 0 savings and 0 shortfall for
// every period.
const now = new Date('2025-02-01T00:00:00.000Z');

test('limitAmount = 0 yields zero savings across all closed periods', () => {
  const category = makeCategory({ limitAmount: 0 });
  // Ten daily expenses in the ~30 days before `now` so closed periods exist.
  const expenses: ExpenseInput[] = Array.from({ length: 10 }, (_, i) => ({
    categoryId: category.id,
    amount: 5,
    createdAt: new Date(now.getTime() - (i + 1) * MS_PER_DAY),
  }));

  const result = computeCategorySavings(category, expenses, [], { enabled: true, enabledAt: null }, now, TZ);

  assert.ok(result.periods.length > 0, 'expected at least one closed period to be enumerated');
  assert.strictEqual(result.savingsBalance, 0, `savingsBalance should be 0, got ${result.savingsBalance}`);
  assert.strictEqual(result.shortfall, 0, `shortfall should be 0, got ${result.shortfall}`);
  for (const p of result.periods) {
    assert.strictEqual(p.fundedBudget, 0, `fundedBudget should be 0, got ${p.fundedBudget}`);
    assert.strictEqual(p.periodSavings, 0, `periodSavings should be 0, got ${p.periodSavings}`);
    assert.strictEqual(p.periodShortfall, 0, `periodShortfall should be 0, got ${p.periodShortfall}`);
  }
});

test('negative limitAmount also yields zero savings (never negative)', () => {
  const category = makeCategory({ limitAmount: -50 });
  const expenses: ExpenseInput[] = Array.from({ length: 5 }, (_, i) => ({
    categoryId: category.id,
    amount: 3,
    createdAt: new Date(now.getTime() - (i + 1) * MS_PER_DAY),
  }));

  const result = computeCategorySavings(category, expenses, [], { enabled: true, enabledAt: null }, now, TZ);
  assert.strictEqual(result.savingsBalance, 0, `savingsBalance should be 0, got ${result.savingsBalance}`);
  assert.strictEqual(result.shortfall, 0, `shortfall should be 0, got ${result.shortfall}`);
});

test('a non-positive limit contributes 0 to the piggybank total', () => {
  const category = makeCategory({ limitAmount: 0 });
  const expenses: ExpenseInput[] = Array.from({ length: 8 }, (_, i) => ({
    categoryId: category.id,
    amount: 7,
    createdAt: new Date(now.getTime() - (i + 1) * MS_PER_DAY),
  }));
  const byCat = new Map<string, ExpenseInput[]>([[category.id, expenses]]);

  const piggy = computePiggybank([category], byCat, new Map(), { enabled: true, enabledAt: null }, now, TZ);
  assert.strictEqual(piggy.totalSavingsBalance, 0, `total should be 0, got ${piggy.totalSavingsBalance}`);
  assert.strictEqual(piggy.categories.length, 1, 'the category is still reported, just with 0 balance');
  assert.strictEqual(piggy.categories[0].savingsBalance, 0, 'category balance should be 0');
});

// ── Requirements 5.2 & 9.4: category with no transactions → zero balance, no throw ─
test('computeCategorySavings on a category with no transactions returns zero balance without throwing', () => {
  const category = makeCategory();
  let result: CategorySavings | undefined;
  assert.doesNotThrow(() => {
    result = computeCategorySavings(category, [], [], { enabled: true, enabledAt: null }, now, TZ);
  }, 'computeCategorySavings must not throw for a transaction-less category');

  assert.ok(result, 'expected a result');
  assert.strictEqual(result!.savingsBalance, 0, `savingsBalance should be 0, got ${result!.savingsBalance}`);
  assert.strictEqual(result!.shortfall, 0, `shortfall should be 0, got ${result!.shortfall}`);
  assert.strictEqual(result!.periods.length, 0, 'no transactions → no enumerated periods');
  assert.strictEqual(result!.incomplete, false, 'no transactions is a complete (not incomplete) result');
});

test('expenses belonging only to OTHER categories count as no transactions for this category', () => {
  const category = makeCategory({ id: 'cat-1' });
  // All expenses reference a different category id → none are relevant here.
  const foreignExpenses: ExpenseInput[] = Array.from({ length: 4 }, (_, i) => ({
    categoryId: 'cat-other',
    amount: 10,
    createdAt: new Date(now.getTime() - (i + 1) * MS_PER_DAY),
  }));

  let result: CategorySavings | undefined;
  assert.doesNotThrow(() => {
    result = computeCategorySavings(category, foreignExpenses, [], { enabled: true, enabledAt: null }, now, TZ);
  });
  assert.strictEqual(result!.savingsBalance, 0, 'no relevant transactions → zero balance');
  assert.strictEqual(result!.periods.length, 0, 'no relevant transactions → no periods');
});

test('piggybank includes a transaction-less category with a zero balance and does not throw', () => {
  const category = makeCategory();
  const byCat = new Map<string, ExpenseInput[]>([[category.id, []]]);

  let piggy: PiggybankResult | undefined;
  assert.doesNotThrow(() => {
    piggy = computePiggybank([category], byCat, new Map(), { enabled: true, enabledAt: null }, now, TZ);
  });
  assert.strictEqual(piggy!.totalSavingsBalance, 0, 'total should be 0');
  assert.strictEqual(piggy!.categories.length, 1, 'the category is still listed');
  assert.strictEqual(piggy!.categories[0].savingsBalance, 0, 'its balance should be 0');
  assert.strictEqual(piggy!.incomplete, false, 'a transaction-less category is not an incomplete result');
});

// ── Requirement 5.8: no categories → total 0 and empty list ───────────────────
test('computePiggybank with no categories returns total 0 and an empty list', () => {
  const piggy = computePiggybank([], new Map<string, ExpenseInput[]>(), new Map(), { enabled: true, enabledAt: null }, now, TZ);
  assert.strictEqual(piggy.totalSavingsBalance, 0, `total should be 0, got ${piggy.totalSavingsBalance}`);
  assert.strictEqual(piggy.aggregateShortfall, 0, `aggregate shortfall should be 0, got ${piggy.aggregateShortfall}`);
  assert.deepStrictEqual(piggy.categories, [], 'the per-category list should be empty');
  assert.strictEqual(piggy.incomplete, false, 'no categories is a complete result');
});

test('buildTimeSeries with no categories returns an empty series', () => {
  const result = buildTimeSeries([], new Map<string, ExpenseInput[]>(), { enabled: true, enabledAt: null }, now, TZ);
  const points = result.view === 'total' ? result.points : [];
  assert.deepStrictEqual(points, [], 'no categories → no time-series points');
});

test('buildTimeSeries includes usages in open period (after last closed period) in currentBalance for latest point', () => {
  const category: CategoryInput = {
    id: 'cat-1',
    name: 'Food',
    limitAmount: 500,
    period: 'MONTHLY' as BudgetPeriod,
    monthlyStartDay: 1,
    weeklyStartDay: null,
    customPeriodDays: null,
    anchorDate: null,
    schedule: [0, 1, 2, 3, 4, 5, 6],
    overrides: new Map(),
  };

  // Expense in previous closed period (e.g., June 2026)
  const expenses = new Map<string, ExpenseInput[]>([
    ['cat-1', [{ categoryId: 'cat-1', amount: 0, createdAt: new Date('2026-06-15T00:00:00Z') }]],
  ]);

  // Usage created after closed period ended (e.g. Aug 3, 2026 when now is Aug 5, 2026)
  const usages = new Map([
    ['cat-1', [{ categoryId: 'cat-1', amount: 500, createdAt: new Date('2026-08-03T00:00:00Z') }]],
  ]);

  const testNow = new Date('2026-08-05T00:00:00Z');
  const result = buildTimeSeries(
    [category],
    expenses,
    { enabled: true, enabledAt: null },
    testNow,
    TZ,
    { view: 'total' },
    usages,
    usages,
  );

  assert.strictEqual(result.view, 'total');
  const points = result.points;
  assert.ok(points.length > 0, 'should have at least one point');
  const latest = points[points.length - 1];
  assert.strictEqual(latest.cumulativeBalance, 1000, `cumulativeBalance should be 1000, got ${latest.cumulativeBalance}`);
  assert.strictEqual(latest.currentBalance, 500, `currentBalance should be 500 (1000 - 500 usage), got ${latest.currentBalance}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
