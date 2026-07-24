/**
 * Property-based test for deterministic per-category ordering and two-decimal
 * rounding in the savings compute service (`computePiggybank`).
 *
 * Feature: savings-piggybank, Property 15: Deterministic per-category ordering and two-decimal rounding
 *
 * Property 15 (design.md): For any set of categories, the per-category list is
 * ordered by category name in ascending lexicographic order (identical across
 * runs), and every reported monetary amount equals its own 2-decimal rounding
 * (has at most two decimal places).
 *
 * This exercises `computePiggybank` from `savingsService.ts`:
 *   (a) the returned `categories` list is sorted by `categoryName` ascending
 *       (lexicographic), tie-broken by `categoryId`, so consecutive rows are
 *       non-decreasing by (name, id);
 *   (b) that ordering is identical across repeated runs AND when the input
 *       category array is shuffled (determinism, Requirement 5.6);
 *   (c) every reported monetary amount — `totalSavingsBalance`,
 *       `aggregateShortfall`, and each row's `savingsBalance` — equals its own
 *       `round2`, i.e. carries at most two decimal places (Requirement 5.7).
 *
 * Validates: Requirements 5.6, 5.7
 *
 * Self-contained assertion script (project convention, no jest/vitest):
 *   npx ts-node src/services/__tests__/savingsService.orderingRounding.property.test.ts
 * Exits non-zero if any property fails.
 *
 * Uses `fast-check` (installed in backend/node_modules) with a reduced run count
 * for fast local execution (per request); the property is still exercised across
 * many generated inputs.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import {
  computePiggybank,
  CategoryInput,
  ExpenseInput,
} from '../savingsService';
import { getLocalDateParts } from '../gamificationService';
import type { BudgetPeriod } from '../budgetPeriodService';

const NUM_RUNS = 25; // reduced for fast local execution; property still exercised across many inputs
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Same 2-decimal rounding the service uses (Math.round((n + EPSILON) * 100) / 100). */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** A number has at most two decimal places iff it equals its own round2. */
const hasAtMostTwoDecimals = (n: number): boolean => round2(n) === n;

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

// ── Arbitraries ──────────────────────────────────────────────────────────────

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

// A small pool of names — including duplicates, mixed case, and unicode — so the
// name-then-id ordering (and its determinism under shuffling) is exercised.
const NAME_POOL = ['Food', 'food', 'Transport', 'Bills', 'Bills', 'Álvaro', 'Zebra', '', 'a', 'A'];
const nameArb = fc.constantFrom(...NAME_POOL);

// Generated per-category configuration (id is assigned by index later).
const categoryGenArb = fc.record({
  name: nameArb,
  period: periodArb,
  limitAmount: fc.double({ min: 0, max: 3000, noNaN: true, noDefaultInfinity: true }).map(round2),
  monthlyStartDay: fc.oneof(fc.constant<number | null>(null), fc.integer({ min: 1, max: 28 })),
  weeklyStartDay: fc.oneof(fc.constant<number | null>(null), fc.integer({ min: 0, max: 6 })),
  customPeriodDays: fc.oneof(fc.constant<number | null>(null), fc.integer({ min: 1, max: 30 })),
  schedule: scheduleArb,
  overrideSpecs: fc.array(
    fc.record({ offsetDays: fc.integer({ min: 0, max: 130 }), funded: fc.boolean() }),
    { maxLength: 4 },
  ),
  // Amounts with up to 4 decimal places so rounding to 2dp is genuinely tested.
  expenseSpecs: fc.array(
    fc.record({
      offsetDays: fc.integer({ min: 1, max: 120 }),
      amount: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
    }),
    { maxLength: 10 },
  ),
});

const userArb = fc.record({
  categories: fc.array(categoryGenArb, { minLength: 0, maxLength: 6 }),
  now: nowArb,
  tz: tzArb,
});

interface CategoryGen {
  name: string;
  period: BudgetPeriod;
  limitAmount: number;
  monthlyStartDay: number | null;
  weeklyStartDay: number | null;
  customPeriodDays: number | null;
  schedule: number[];
  overrideSpecs: Array<{ offsetDays: number; funded: boolean }>;
  expenseSpecs: Array<{ offsetDays: number; amount: number }>;
}

/** Local calendar date key ('YYYY-MM-DD') for an instant in a timezone. */
function localDateKey(instant: Date, tz: string): string {
  const { year, month, day } = getLocalDateParts(instant, tz);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Materialize a generated category into a CategoryInput + its expenses. */
function materialize(
  gen: CategoryGen,
  index: number,
  now: Date,
  tz: string,
): { category: CategoryInput; expenses: ExpenseInput[] } {
  const id = `cat-${index}`;
  const overrides = new Map<string, boolean>();
  for (const o of gen.overrideSpecs) {
    const d = new Date(now.getTime() - o.offsetDays * MS_PER_DAY);
    overrides.set(localDateKey(d, tz), o.funded);
  }

  const category: CategoryInput = {
    id,
    name: gen.name,
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

  return { category, expenses };
}

/** Deterministic shuffle of an array driven by a numeric seed (Fisher–Yates). */
function seededShuffle<T>(input: T[], seed: number): T[] {
  const arr = [...input];
  let s = seed >>> 0;
  const next = () => {
    // xorshift32 — deterministic pseudo-random for reproducible reordering.
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

console.log(
  '// Feature: savings-piggybank, Property 15: Deterministic per-category ordering and two-decimal rounding',
);

// ── Property 15 (a): the per-category list is ordered by name asc, tie id asc ──
// For any set of categories, consecutive rows of the returned list are
// non-decreasing by (categoryName, categoryId) in lexicographic order.
//
// Validates: Requirements 5.6
test('per-category list is ordered by category name ascending (tie-broken by id)', () => {
  fc.assert(
    fc.property(userArb, ({ categories: gens, now, tz }) => {
      const materialized = gens.map((g, i) => materialize(g, i, now, tz));
      const categories = materialized.map((m) => m.category);
      const expensesByCategory = new Map<string, ExpenseInput[]>();
      for (const m of materialized) expensesByCategory.set(m.category.id, m.expenses);

      const piggy = computePiggybank(categories, expensesByCategory, new Map(), { enabled: true, enabledAt: null }, now, tz);
      const list = piggy.categories;

      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1];
        const cur = list[i];
        const nameOrdered =
          prev.categoryName < cur.categoryName ||
          (prev.categoryName === cur.categoryName && prev.categoryId <= cur.categoryId);
        assert.ok(
          nameOrdered,
          `out of order at index ${i}: ("${prev.categoryName}", ${prev.categoryId}) should not precede ("${cur.categoryName}", ${cur.categoryId})`,
        );
      }

      // The list contains exactly the input categories (none dropped when config valid).
      assert.strictEqual(
        list.length,
        categories.length,
        `expected ${categories.length} rows, got ${list.length}`,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 15 (b): ordering is identical across runs and under shuffling ─────
// Recomputing the piggybank — and recomputing it with the input categories (and
// their expense map) reordered — yields an identical ordered per-category list.
//
// Validates: Requirements 5.6
test('per-category ordering is deterministic across runs and independent of input order', () => {
  fc.assert(
    fc.property(userArb, fc.integer({ min: 1, max: 0x7fffffff }), ({ categories: gens, now, tz }, seed) => {
      const materialized = gens.map((g, i) => materialize(g, i, now, tz));
      const categories = materialized.map((m) => m.category);
      const expensesByCategory = new Map<string, ExpenseInput[]>();
      for (const m of materialized) expensesByCategory.set(m.category.id, m.expenses);

      const a = computePiggybank(categories, expensesByCategory, new Map(), { enabled: true, enabledAt: null }, now, tz);
      const b = computePiggybank(categories, expensesByCategory, new Map(), { enabled: true, enabledAt: null }, now, tz);

      // Same inputs, computed twice → identical ordered rows (byte-for-byte on the
      // ordering key and the reported balance).
      const keyOf = (p: typeof a) =>
        p.categories.map((c) => `${c.categoryName}\u0000${c.categoryId}\u0000${c.savingsBalance}`).join('|');
      assert.strictEqual(keyOf(a), keyOf(b), 'repeated computation produced a different ordered list');

      // Shuffle the input categories (and rebuild the map) → ordering must not change.
      const shuffled = seededShuffle(categories, seed);
      const c = computePiggybank(shuffled, expensesByCategory, new Map(), { enabled: true, enabledAt: null }, now, tz);
      assert.strictEqual(
        keyOf(a),
        keyOf(c),
        'reordering the input categories changed the ordered per-category list',
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 15 (c): every reported monetary amount has at most two decimals ───
// totalSavingsBalance, aggregateShortfall, and each row's savingsBalance equal
// their own round2 — i.e. carry at most two decimal places.
//
// Validates: Requirements 5.7
test('every reported monetary amount is rounded to (at most) two decimal places', () => {
  fc.assert(
    fc.property(userArb, ({ categories: gens, now, tz }) => {
      const materialized = gens.map((g, i) => materialize(g, i, now, tz));
      const categories = materialized.map((m) => m.category);
      const expensesByCategory = new Map<string, ExpenseInput[]>();
      for (const m of materialized) expensesByCategory.set(m.category.id, m.expenses);

      const piggy = computePiggybank(categories, expensesByCategory, new Map(), { enabled: true, enabledAt: null }, now, tz);

      assert.ok(
        hasAtMostTwoDecimals(piggy.totalSavingsBalance),
        `totalSavingsBalance not 2dp: ${piggy.totalSavingsBalance}`,
      );
      assert.ok(
        hasAtMostTwoDecimals(piggy.aggregateShortfall),
        `aggregateShortfall not 2dp: ${piggy.aggregateShortfall}`,
      );
      for (const row of piggy.categories) {
        assert.ok(
          hasAtMostTwoDecimals(row.savingsBalance),
          `savingsBalance for "${row.categoryName}" (${row.categoryId}) not 2dp: ${row.savingsBalance}`,
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
