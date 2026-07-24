/**
 * Property-based test for the available-balance floor in the savings compute
 * service (`computeCategorySavings` + `computePiggybank`).
 *
 * Feature: savings-piggybank, Property 11: Available balance is accrued minus applied usage, floored at zero
 *
 * Property 11 (design.md): For any category accrued amount and any set of
 * `Savings_Usage` records for that category,
 *   Category_Savings_Balance == max(0, round2(accruedSavings − Σ usage.amount))
 * and is never less than 0.00; and
 *   Total_Savings_Balance    == round2(Σ Category_Savings_Balance)
 * across the user's categories and is never less than 0.00. Applying a usage
 * reduces the drawn category's available balance (and the total) by the usage
 * amount, down to the zero floor. The offset is a plain sum, so it is
 * independent of the order the usage records are supplied.
 *
 * This exercises `computeCategorySavings` and `computePiggybank` from
 * `savingsService.ts`. The applied-usage sum and the floored balance are
 * recomputed INDEPENDENTLY here (from the raw usage amounts and the returned
 * accrual) so the test does not merely echo the service internals.
 *
 * Validates: Requirements 5.2, 5.3, 5.4, 12.8, 12.9
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/services/__tests__/savingsService.availableBalanceFloor.property.test.ts
 * Exits non-zero if any assertion / property fails.
 *
 * Uses `fast-check` (already installed in backend/node_modules) with a minimum
 * of 100 generated cases per property.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import {
  computeCategorySavings,
  computePiggybank,
  CategoryInput,
  ExpenseInput,
  SavingsUsageInput,
} from '../savingsService';
import { getLocalDateParts } from '../gamificationService';
import type { BudgetPeriod } from '../budgetPeriodService';

const NUM_RUNS = 100; // minimum 100 generated cases per property
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Same 2-decimal rounding the service uses (Math.round((n + EPSILON) * 100) / 100). */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

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

// A spread of valid IANA timezones (whole/half/three-quarter-hour + line-of-date).
const TIMEZONES = [
  'UTC',
  'America/New_York',
  'Asia/Kolkata', // +05:30
  'Asia/Kathmandu', // +05:45
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Kiritimati', // +14:00
];

const tzArb = fc.constantFrom(...TIMEZONES);
const periodArb = fc.constantFrom<BudgetPeriod>('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');
const scheduleArb = fc
  .subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 0, maxLength: 7 })
  .map((s) => [...s].sort((a, b) => a - b));
const nowArb = fc.date({
  min: new Date('2025-01-01T00:00:00.000Z'),
  max: new Date('2027-12-31T00:00:00.000Z'),
  noInvalidDate: true,
});

// Generated per-category configuration (id/name are assigned by index later).
const categoryGenArb = fc.record({
  period: periodArb,
  limitAmount: fc
    .double({ min: 0, max: 3000, noNaN: true, noDefaultInfinity: true })
    .map(round2),
  monthlyStartDay: fc.oneof(fc.constant<number | null>(null), fc.integer({ min: 1, max: 28 }), fc.constant(-1)),
  weeklyStartDay: fc.oneof(fc.constant<number | null>(null), fc.integer({ min: 0, max: 6 })),
  customPeriodDays: fc.oneof(fc.constant<number | null>(null), fc.integer({ min: 1, max: 30 })),
  schedule: scheduleArb,
  overrideSpecs: fc.array(
    fc.record({ offsetDays: fc.integer({ min: 0, max: 130 }), funded: fc.boolean() }),
    { maxLength: 6 },
  ),
  expenseSpecs: fc.array(
    fc.record({
      offsetDays: fc.integer({ min: 1, max: 120 }),
      amount: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }).map(round2),
    }),
    { maxLength: 12 },
  ),
  // Usage amounts (> 0, 2dp). The range spans small draws AND large draws that
  // can exceed accrual, so the zero floor is exercised often.
  usageSpecs: fc.array(
    fc.record({
      amount: fc.double({ min: 0.01, max: 4000, noNaN: true, noDefaultInfinity: true }).map(round2),
      offsetDays: fc.integer({ min: 0, max: 120 }),
    }),
    { maxLength: 6 },
  ),
});

// A user has between 0 and 4 categories.
const userArb = fc.record({
  categories: fc.array(categoryGenArb, { minLength: 0, maxLength: 4 }),
  now: nowArb,
  tz: tzArb,
});

interface CategoryGen {
  period: BudgetPeriod;
  limitAmount: number;
  monthlyStartDay: number | null;
  weeklyStartDay: number | null;
  customPeriodDays: number | null;
  schedule: number[];
  overrideSpecs: Array<{ offsetDays: number; funded: boolean }>;
  expenseSpecs: Array<{ offsetDays: number; amount: number }>;
  usageSpecs: Array<{ amount: number; offsetDays: number }>;
}

/** Local calendar date key ('YYYY-MM-DD') for an instant in a timezone. */
function localDateKey(instant: Date, tz: string): string {
  const { year, month, day } = getLocalDateParts(instant, tz);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Materialize a generated category into a CategoryInput + its expenses + its usages. */
function materialize(
  gen: CategoryGen,
  index: number,
  now: Date,
  tz: string,
): { category: CategoryInput; expenses: ExpenseInput[]; usages: SavingsUsageInput[] } {
  const id = `cat-${index}`;
  const overrides = new Map<string, boolean>();
  for (const o of gen.overrideSpecs) {
    const d = new Date(now.getTime() - o.offsetDays * MS_PER_DAY);
    overrides.set(localDateKey(d, tz), o.funded);
  }

  const category: CategoryInput = {
    id,
    // Names intentionally collide across indices sometimes to exercise the id
    // tie-break in ordering; the balance identity does not depend on it.
    name: `Cat-${index % 3}`,
    limitAmount: gen.limitAmount,
    period: gen.period,
    monthlyStartDay: gen.monthlyStartDay,
    weeklyStartDay: gen.weeklyStartDay,
    customPeriodDays: gen.customPeriodDays,
    anchorDate: null,
    schedule: gen.schedule,
    overrides,
  };

  const expenses: ExpenseInput[] = gen.expenseSpecs.map((e) => ({
    categoryId: id,
    amount: e.amount,
    createdAt: new Date(now.getTime() - e.offsetDays * MS_PER_DAY),
  }));

  const usages: SavingsUsageInput[] = gen.usageSpecs.map((u) => ({
    categoryId: id,
    amount: u.amount,
    createdAt: new Date(now.getTime() - u.offsetDays * MS_PER_DAY),
  }));

  return { category, expenses, usages };
}

/** A seeded, deterministic shuffle so order-independence checks are reproducible. */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

console.log('savingsService — Property 11: Available balance is accrued minus applied usage, floored at zero');
console.log(
  '// Feature: savings-piggybank, Property 11: Available balance is accrued minus applied usage, floored at zero',
);

// ── Property 11 (a): per-category available balance identity + zero floor ─────
// For any category, appliedUsage == round2(Σ usage.amount) and
//   savingsBalance == max(0, round2(accruedSavings − appliedUsage))  and  >= 0.
// The applied-usage sum is recomputed INDEPENDENTLY from the raw usage amounts.
//
// Validates: Requirements 5.2, 12.8, 12.9
test('per-category savingsBalance == max(0, round2(accrued − Σ usage)) and is never negative', () => {
  fc.assert(
    fc.property(categoryGenArb, nowArb, tzArb, (gen, now, tz) => {
      const { category, expenses, usages } = materialize(gen, 0, now, tz);
      const result = computeCategorySavings(category, expenses, usages, { enabled: true, enabledAt: null }, now, tz);

      // Independent applied-usage sum from the raw amounts (order as generated).
      const expectedApplied = round2(usages.reduce((s, u) => s + u.amount, 0));
      assert.strictEqual(
        result.appliedUsage,
        expectedApplied,
        `appliedUsage != round2(Σ usage.amount): got ${result.appliedUsage}, expected ${expectedApplied}`,
      );

      // Available balance identity: max(0, round2(accrued − appliedUsage)). (5.2, 12.9)
      const expectedBalance = round2(Math.max(0, result.accruedSavings - expectedApplied));
      assert.strictEqual(
        result.savingsBalance,
        expectedBalance,
        `savingsBalance != max(0, round2(accrued − usage)): got ${result.savingsBalance}, expected ${expectedBalance} (accrued=${result.accruedSavings}, usage=${expectedApplied})`,
      );

      // Never negative — the zero floor. (5.2, 12.9)
      assert.ok(result.savingsBalance >= 0, `savingsBalance < 0: ${result.savingsBalance}`);

      // When usage meets or exceeds accrual, the floor pins the balance to exactly 0. (12.9)
      if (expectedApplied >= result.accruedSavings) {
        assert.strictEqual(
          result.savingsBalance,
          0,
          `usage >= accrued must floor balance to 0: accrued=${result.accruedSavings}, usage=${expectedApplied}, balance=${result.savingsBalance}`,
        );
      }
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 11 (b): total == round2(Σ per-category balance), never negative ──
// Across the user's categories, totalSavingsBalance == round2(Σ savingsBalance)
// where each per-category balance is obtained INDEPENDENTLY via
// computeCategorySavings, and the total is never negative.
//
// Validates: Requirements 5.3, 5.4, 12.9
test('piggybank total == round2(Σ per-category available balance) and is never negative', () => {
  fc.assert(
    fc.property(userArb, ({ categories: gens, now, tz }) => {
      const materialized = gens.map((g, i) => materialize(g, i, now, tz));
      const categories = materialized.map((m) => m.category);
      const expensesByCategory = new Map<string, ExpenseInput[]>();
      const usagesByCategory = new Map<string, SavingsUsageInput[]>();
      for (const m of materialized) {
        expensesByCategory.set(m.category.id, m.expenses);
        usagesByCategory.set(m.category.id, m.usages);
      }

      const piggy = computePiggybank(
        categories,
        expensesByCategory,
        usagesByCategory,
        { enabled: true, enabledAt: null },
        now,
        tz,
      );

      // Independent per-category recomputation of available balances.
      let expectedTotal = 0;
      for (const m of materialized) {
        const cs = computeCategorySavings(m.category, m.expenses, m.usages, { enabled: true, enabledAt: null }, now, tz);
        expectedTotal += cs.savingsBalance;
      }

      assert.strictEqual(
        piggy.totalSavingsBalance,
        round2(Math.max(0, expectedTotal)),
        `totalSavingsBalance != round2(Σ category savingsBalance): got ${piggy.totalSavingsBalance}, expected ${round2(Math.max(0, expectedTotal))}`,
      );

      // Never negative. (5.4, 12.9)
      assert.ok(piggy.totalSavingsBalance >= 0, `totalSavingsBalance < 0: ${piggy.totalSavingsBalance}`);

      // The per-category list balances also sum to the reported total. (5.3)
      const listSum = round2(piggy.categories.reduce((s, c) => s + c.savingsBalance, 0));
      assert.strictEqual(
        listSum,
        piggy.totalSavingsBalance,
        `sum of per-category list (${listSum}) != totalSavingsBalance (${piggy.totalSavingsBalance})`,
      );

      // Every reported per-category balance is itself non-negative. (5.2)
      for (const c of piggy.categories) {
        assert.ok(c.savingsBalance >= 0, `category ${c.categoryId} savingsBalance < 0: ${c.savingsBalance}`);
      }
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 11 (c): applying a usage reduces the balance by the amount, to 0 ─
// Adding one more usage of amount `d` (> 0) to a category reduces that
// category's available balance (and the total) by exactly `d`, UNTIL the zero
// floor — after which any further usage keeps the balance pinned at 0. Comparing
// baseline → augmented proves the reduction never overshoots below 0.
//
// Validates: Requirements 5.2, 5.4, 12.8, 12.9
test('applying a usage reduces available balance by the usage amount, down to the zero floor', () => {
  fc.assert(
    fc.property(
      categoryGenArb,
      nowArb,
      tzArb,
      fc.double({ min: 0.01, max: 4000, noNaN: true, noDefaultInfinity: true }).map(round2),
      (gen, now, tz, delta) => {
        const { category, expenses, usages } = materialize(gen, 0, now, tz);

        const base = computeCategorySavings(category, expenses, usages, { enabled: true, enabledAt: null }, now, tz);

        // Apply one extra usage of `delta` on the same category.
        const extra: SavingsUsageInput = { categoryId: category.id, amount: delta, createdAt: now };
        const augmented = computeCategorySavings(
          category,
          expenses,
          usages.concat(extra),
          { enabled: true, enabledAt: null },
          now,
          tz,
        );

        // Accrual is unaffected by usage — only the available balance moves. (12.8)
        assert.strictEqual(
          augmented.accruedSavings,
          base.accruedSavings,
          `accrued changed after adding usage: ${base.accruedSavings} -> ${augmented.accruedSavings}`,
        );

        // The new balance equals the old balance minus delta, floored at 0. (5.2, 12.9)
        const expected = round2(Math.max(0, base.savingsBalance - delta));
        assert.strictEqual(
          augmented.savingsBalance,
          expected,
          `balance after usage != max(0, prev − delta): prev=${base.savingsBalance}, delta=${delta}, got ${augmented.savingsBalance}, expected ${expected}`,
        );

        // A usage can only lower (or hold at the floor) the available balance. (12.8)
        assert.ok(
          augmented.savingsBalance <= base.savingsBalance + 1e-9,
          `usage increased the balance: ${base.savingsBalance} -> ${augmented.savingsBalance}`,
        );
        assert.ok(augmented.savingsBalance >= 0, `augmented balance < 0: ${augmented.savingsBalance}`);
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 11 (d): usage order-independence ─────────────────────────────────
// The applied-usage offset is a plain sum, so shuffling the usage records (both
// within a category and across the piggybank) yields byte-identical balances and
// totals (Requirement 12.19 supports this order-independence for 12.8/12.9).
//
// Validates: Requirements 5.3, 12.8, 12.9
test('shuffling usage records does not change available balances or the total', () => {
  fc.assert(
    fc.property(userArb, fc.integer({ min: 0, max: 2 ** 31 - 1 }), ({ categories: gens, now, tz }, seed) => {
      const materialized = gens.map((g, i) => materialize(g, i, now, tz));
      const categories = materialized.map((m) => m.category);
      const expensesByCategory = new Map<string, ExpenseInput[]>();
      const usagesByCategory = new Map<string, SavingsUsageInput[]>();
      const shuffledUsagesByCategory = new Map<string, SavingsUsageInput[]>();
      for (const m of materialized) {
        expensesByCategory.set(m.category.id, m.expenses);
        usagesByCategory.set(m.category.id, m.usages);
        shuffledUsagesByCategory.set(m.category.id, shuffle(m.usages, seed + m.category.id.length));
      }

      const original = computePiggybank(
        categories,
        expensesByCategory,
        usagesByCategory,
        { enabled: true, enabledAt: null },
        now,
        tz,
      );
      const reordered = computePiggybank(
        categories,
        expensesByCategory,
        shuffledUsagesByCategory,
        { enabled: true, enabledAt: null },
        now,
        tz,
      );

      assert.strictEqual(
        JSON.stringify(reordered),
        JSON.stringify(original),
        'shuffling usage records changed the piggybank result',
      );
    }),
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
