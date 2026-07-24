/**
 * Property-based test for deterministic, order-independent recomputation of the
 * savings compute service (`computeCategorySavings` + `computePiggybank` +
 * `buildTimeSeries`).
 *
 * Feature: savings-piggybank, Property 17: Deterministic, order-independent recomputation
 *
 * Property 17 (design.md): For any fixed set of categories, transactions,
 * funded-day configuration, `Savings_Enabled` state, `Savings_Enabled_At`,
 * `Savings_Usage` records, `now`, and resolved timezone, computing the piggybank
 * and time series two or more times — including after reordering the input
 * categories, transactions, AND usage records — yields byte-for-byte identical
 * results and identical contributing-period selections.
 *
 * The implementations under test are `computeCategorySavings`, `computePiggybank`
 * and `buildTimeSeries` from `savingsService.ts`. "Byte-for-byte identical" is
 * asserted by comparing `JSON.stringify` of the two results (the outputs are
 * plain JSON-serializable objects/arrays), so a change in value OR ordering
 * fails the property. The "identical contributing-period selections" clause
 * (Requirement 9.9) is asserted directly by comparing the `periodStart`/
 * `periodEnd` list `computeCategorySavings` selects for a fixed enablement.
 *
 * Validates: Requirements 7.2, 7.3, 9.9, 12.19
 *
 * Self-contained assertion script (project convention, no jest/vitest):
 *   npx ts-node src/services/__tests__/savingsService.determinism.property.test.ts
 * Exits non-zero if any property fails.
 *
 * Uses `fast-check` (installed in backend/node_modules) with at least 100
 * generated cases per property (spec minimum).
 */
import assert from 'node:assert';
import fc from 'fast-check';
import {
  computeCategorySavings,
  computePiggybank,
  buildTimeSeries,
  CategoryInput,
  ExpenseInput,
  SavingsUsageInput,
  SavingsEnablement,
} from '../savingsService';
import { getLocalDateParts } from '../gamificationService';
import type { BudgetPeriod } from '../budgetPeriodService';

const NUM_RUNS = 120; // >= 100 generated cases (spec minimum)
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Same 2-decimal rounding the service uses. */
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

// ── Deterministic shuffle (mulberry32 + Fisher–Yates) ────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// A spread of valid IANA timezones (whole/half/three-quarter-hour + line-of-date).
const TIMEZONES = [
  'UTC',
  'America/New_York',
  'Asia/Manila',
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
  monthlyStartDay: fc.oneof(
    fc.constant<number | null>(null),
    fc.integer({ min: 1, max: 28 }),
    fc.constant(-1),
  ),
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
  // Savings_Usage records for this category (Requirement 12.19). Amounts include
  // sums that can exceed accrual, exercising the zero floor while staying
  // order-independent.
  usageSpecs: fc.array(
    fc.record({
      offsetDays: fc.integer({ min: 0, max: 120 }),
      amount: fc.double({ min: 0.01, max: 400, noNaN: true, noDefaultInfinity: true }).map(round2),
    }),
    { maxLength: 8 },
  ),
});

// Enablement (Requirement 9.9): a fixed enabled state + enabledAt lower bound.
// `enabledAt` is generated as an offset back from `now` (or null / far past) so
// contributing-period gating is genuinely exercised.
const enablementSpecArb = fc.record({
  enabled: fc.oneof(
    { weight: 4, arbitrary: fc.constant(true) },
    { weight: 1, arbitrary: fc.constant(false) },
  ),
  enabledAtOffsetDays: fc.oneof(
    fc.constant<number | null>(null), // no lower bound
    fc.integer({ min: 0, max: 200 }), // a bound that trims older periods
  ),
});

// A user has between 0 and 4 categories, an enablement, plus a shuffle seed.
const userArb = fc.record({
  categories: fc.array(categoryGenArb, { minLength: 0, maxLength: 4 }),
  enablement: enablementSpecArb,
  now: nowArb,
  tz: tzArb,
  seed: fc.integer({ min: 1, max: 2 ** 31 - 1 }),
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
  usageSpecs: Array<{ offsetDays: number; amount: number }>;
}

/** Local calendar date key ('YYYY-MM-DD') for an instant in a timezone. */
function localDateKey(instant: Date, tz: string): string {
  const { year, month, day } = getLocalDateParts(instant, tz);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Materialize a generated category into a CategoryInput + its expenses + usages. */
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
    // Distinct, non-sorted names so the deterministic name-ordering of the output
    // is genuinely exercised (input index order != output name order).
    name: `Cat-${(index * 7 + 3) % 11}`,
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

/** Resolve the generated enablement spec to a concrete SavingsEnablement. */
function toEnablement(
  spec: { enabled: boolean; enabledAtOffsetDays: number | null },
  now: Date,
): SavingsEnablement {
  if (!spec.enabled) return { enabled: false, enabledAt: null };
  const enabledAt =
    spec.enabledAtOffsetDays === null
      ? null
      : new Date(now.getTime() - spec.enabledAtOffsetDays * MS_PER_DAY);
  return { enabled: true, enabledAt };
}

console.log('savingsService — Property 17: Deterministic, order-independent recomputation');
console.log(
  '// Feature: savings-piggybank, Property 17: Deterministic, order-independent recomputation',
);

// ── Property 17 (a): computePiggybank is idempotent and order-independent ─────
// Recomputing over identical inputs, and over reordered categories / reordered
// per-category expenses / reordered per-category Savings_Usage records, yields
// byte-for-byte identical piggybank results.
//
// Validates: Requirements 7.2, 7.3, 12.19
test('computePiggybank is byte-for-byte identical on recompute and after reordering categories/expenses/usages', () => {
  fc.assert(
    fc.property(userArb, ({ categories: gens, enablement: enSpec, now, tz, seed }) => {
      const materialized = gens.map((g, i) => materialize(g, i, now, tz));
      const categories = materialized.map((m) => m.category);
      const enablement = toEnablement(enSpec, now);

      const expensesByCategory = new Map<string, ExpenseInput[]>();
      const usagesByCategory = new Map<string, SavingsUsageInput[]>();
      for (const m of materialized) {
        expensesByCategory.set(m.category.id, m.expenses);
        usagesByCategory.set(m.category.id, m.usages);
      }

      // Baseline, and an immediate recompute over the very same inputs (7.2).
      const first = JSON.stringify(
        computePiggybank(categories, expensesByCategory, usagesByCategory, enablement, now, tz),
      );
      const second = JSON.stringify(
        computePiggybank(categories, expensesByCategory, usagesByCategory, enablement, now, tz),
      );
      assert.strictEqual(second, first, 'recompute over identical inputs differed');

      // Reorder the categories AND each category's expenses AND its usage
      // records (7.3, 12.19), then recompute.
      const reorderedCategories = shuffle(categories, seed);
      const reorderedExpenses = new Map<string, ExpenseInput[]>();
      const reorderedUsages = new Map<string, SavingsUsageInput[]>();
      for (const m of materialized) {
        const s = (seed ^ (m.category.id.length * 2654435761)) >>> 0 || 1;
        reorderedExpenses.set(m.category.id, shuffle(m.expenses, s));
        reorderedUsages.set(m.category.id, shuffle(m.usages, (s ^ 0x9e3779b9) >>> 0 || 1));
      }
      const reordered = JSON.stringify(
        computePiggybank(
          reorderedCategories,
          reorderedExpenses,
          reorderedUsages,
          enablement,
          now,
          tz,
        ),
      );
      assert.strictEqual(
        reordered,
        first,
        'result changed after reordering categories/expenses/usages',
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 17 (b): buildTimeSeries is idempotent and order-independent ──────
// The cumulative accrued series (default windowing and an explicit limit) is
// byte-for-byte identical on recompute and after reordering categories /
// per-category expenses. buildTimeSeries plots ACCRUED savings only, so usage
// records are not an input to it.
//
// Validates: Requirements 7.2, 7.3
test('buildTimeSeries is byte-for-byte identical on recompute and after reordering inputs', () => {
  fc.assert(
    fc.property(
      userArb,
      fc.integer({ min: 0, max: 20 }),
      ({ categories: gens, enablement: enSpec, now, tz, seed }, limit) => {
        const materialized = gens.map((g, i) => materialize(g, i, now, tz));
        const categories = materialized.map((m) => m.category);
        const enablement = toEnablement(enSpec, now);
        const expensesByCategory = new Map<string, ExpenseInput[]>();
        for (const m of materialized) expensesByCategory.set(m.category.id, m.expenses);

        for (const view of ['total', 'byCategory'] as const) {
          for (const opts of [{ view }, { view, limit }]) {
            const first = JSON.stringify(
              buildTimeSeries(categories, expensesByCategory, enablement, now, tz, opts),
            );
            const second = JSON.stringify(
              buildTimeSeries(categories, expensesByCategory, enablement, now, tz, opts),
            );
            assert.strictEqual(
              second,
              first,
              'time-series recompute over identical inputs differed',
            );

            const reorderedCategories = shuffle(categories, seed);
            const reorderedExpenses = new Map<string, ExpenseInput[]>();
            for (const m of materialized) {
              reorderedExpenses.set(
                m.category.id,
                shuffle(m.expenses, (seed ^ (m.category.id.length * 40503)) >>> 0 || 1),
              );
            }
            const reordered = JSON.stringify(
              buildTimeSeries(reorderedCategories, reorderedExpenses, enablement, now, tz, opts),
            );
            assert.strictEqual(
              reordered,
              first,
              'time series changed after reordering categories/expenses',
            );
          }
        }
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 17 (c): contributing-period selection is identical (Req 9.9) ─────
// For a fixed enablement (state + enabledAt), `computeCategorySavings` selects an
// identical set of contributing periods (same periodStart/periodEnd list) and an
// identical accrued balance across recomputes and after reordering the category's
// expenses and usage records.
//
// Validates: Requirements 9.9, 7.3, 12.19
test('computeCategorySavings selects identical contributing periods and accrued balance for a fixed enablement', () => {
  fc.assert(
    fc.property(userArb, ({ categories: gens, enablement: enSpec, now, tz, seed }) => {
      const materialized = gens.map((g, i) => materialize(g, i, now, tz));
      const enablement = toEnablement(enSpec, now);

      const selection = (r: {
        accruedSavings: number;
        appliedUsage: number;
        savingsBalance: number;
        periods: Array<{ periodStart: Date; periodEnd: Date }>;
      }) =>
        JSON.stringify({
          accruedSavings: r.accruedSavings,
          appliedUsage: r.appliedUsage,
          savingsBalance: r.savingsBalance,
          periods: r.periods.map((p) => [
            p.periodStart.toISOString(),
            p.periodEnd.toISOString(),
          ]),
        });

      for (const m of materialized) {
        const first = selection(
          computeCategorySavings(m.category, m.expenses, m.usages, enablement, now, tz),
        );
        // Recompute over identical inputs (7.2/9.9).
        const second = selection(
          computeCategorySavings(m.category, m.expenses, m.usages, enablement, now, tz),
        );
        assert.strictEqual(second, first, 'contributing-period selection differed on recompute');

        // Reorder expenses and usages (7.3, 12.19) — selection must not change.
        const s = (seed ^ (m.category.id.length * 22695477)) >>> 0 || 1;
        const reordered = selection(
          computeCategorySavings(
            m.category,
            shuffle(m.expenses, s),
            shuffle(m.usages, (s ^ 0x85ebca6b) >>> 0 || 1),
            enablement,
            now,
            tz,
          ),
        );
        assert.strictEqual(
          reordered,
          first,
          'contributing-period selection or accrued balance changed after reordering',
        );
      }
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
