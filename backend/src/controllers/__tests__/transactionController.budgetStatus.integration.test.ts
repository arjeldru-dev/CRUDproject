/**
 * Integration tests for budget status
 * (endpoint `GET /api/transactions/budget`, implemented by `getBudgetStatus` in
 * `transactionController.ts`).
 *
 * These close the coverage gap flagged in the savings release-to-budget review:
 * `getBudgetStatus` had no automated coverage, so the "a release raises the
 * category's remaining budget" behavior (feature-spec-savings-release-to-budget,
 * Acceptance Criterion 2) and the disabled-after-release edge were verified only
 * by reading the code. This suite pins them.
 *
 * Coverage:
 *   A. Baseline — a positive BUDGET_DEDUCTION (a normal expense) raises `spent`
 *      and lowers `remaining`.
 *   B. Release — a NEGATIVE BUDGET_DEDUCTION (from a savings release TOP_UP)
 *      lowers `spent` and raises `remaining` by exactly the released amount
 *      (Acceptance Criterion 2).
 *   C. Windowing — a deduction whose transaction falls OUTSIDE the current
 *      period window is not counted.
 *   D. Disabled-after-release — `getBudgetStatus` reads no SavingsSettings, so a
 *      released amount stays reflected in the budget regardless of whether
 *      savings are enabled (spec Edge Case: "released-but-unreturned amount is
 *      not surfaced while disabled" — it lives in the budget, not the piggybank).
 *
 * Conventions (matching `savingsController.usage.integration.test.ts`):
 *   - Self-contained `ts-node` assertion script (no jest/vitest runner):
 *       npx ts-node src/controllers/__tests__/transactionController.budgetStatus.integration.test.ts
 *     Exits non-zero if any assertion fails.
 *   - The controller is driven DB-free by monkeypatching the exported `prisma`
 *     singleton with in-memory fakes for `category.findMany`,
 *     `userGamification.findUnique`, and `ledgerEntry.findMany`. `getPeriodWindow`
 *     and `generateSpendingForecast` run for real (pure functions), so window
 *     bucketing is exercised end-to-end.
 */
import assert from 'node:assert';
import { Prisma } from '@prisma/client';

// Pull in the global `Express.Request.user` augmentation so the controller
// type-checks when compiled standalone by ts-node.
import '../../middleware/requireAuth';
import { prisma } from '../../config/db';
import { getBudgetStatus } from '../transactionController';

// ── Tiny assertion harness ───────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
    console.error(`  \u2717 ${name}`);
    console.error(`    ${(err as Error).stack ?? (err as Error).message}`);
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const OWNER_ID = 'owner-user-id';
const CAT_FOOD = 'cat-food';
const TZ = 'UTC';
// A fixed "now" inside June 2025 so a MONTHLY (start day 1) window resolves to
// [2025-06-01, 2025-07-01) deterministically, independent of the wall clock.
const NOW_ISO = '2025-06-15T00:00:00.000Z';
const IN_WINDOW = new Date('2025-06-10T00:00:00.000Z');
const OUT_OF_WINDOW = new Date('2025-05-20T00:00:00.000Z');

/** A category row shaped for the `select` in `getBudgetStatus`. */
function catRow(overrides: Partial<{ id: string; name: string; limitAmount: number }> = {}) {
  const { limitAmount = 1000, ...rest } = overrides;
  return {
    id: CAT_FOOD,
    name: 'Food',
    limitAmount: new Prisma.Decimal(limitAmount),
    period: 'MONTHLY',
    monthlyStartDay: 1,
    weeklyStartDay: null,
    customPeriodDays: null,
    anchorDate: null,
    iconKey: null,
    ...rest,
  };
}

/** A BUDGET_DEDUCTION ledger entry shaped for the `include` in `getBudgetStatus`. */
function deduction(amountChange: number, createdAt: Date, categoryId = CAT_FOOD) {
  return {
    amountChange: new Prisma.Decimal(amountChange),
    type: 'BUDGET_DEDUCTION',
    transaction: { categoryId, createdAt },
  };
}

interface BudgetState {
  timezone: string | null;
  categories: ReturnType<typeof catRow>[];
  deductions: ReturnType<typeof deduction>[];
}

/**
 * Install in-memory fakes onto the exported `prisma` singleton for the
 * budget-status read path. The `ledgerEntry.findMany` fake ignores the `where`
 * (createdAt range) and returns every seeded deduction; the controller then
 * buckets each into its category window, so window filtering is genuinely
 * exercised by returning both in- and out-of-window rows.
 */
function installBudgetMock(state: BudgetState) {
  (prisma as any).category = {
    findMany: async (_args: any) => state.categories,
  };
  (prisma as any).userGamification = {
    findUnique: async () => (state.timezone === null ? null : { timezone: state.timezone }),
  };
  (prisma as any).ledgerEntry = {
    findMany: async (_args: any) => state.deductions,
  };
}

// ── Express req/res doubles ──────────────────────────────────────────────────

function mockReqRes(query: Record<string, unknown> = {}) {
  const req = {
    body: {},
    query: { timezone: TZ, now: NOW_ISO, ...query },
    params: {},
    headers: {},
    user: { id: OWNER_ID },
  } as unknown as import('express').Request;

  const captured: { status: number; body: any } = { status: 0, body: undefined };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  } as unknown as import('express').Response;

  return { req, res, captured };
}

/** Pull the single budget status for CAT_FOOD out of a captured response. */
function foodStatus(captured: { body: any }) {
  const status = captured.body?.budgetStatuses?.find((s: any) => s.categoryId === CAT_FOOD);
  assert.ok(status, 'expected a budget status for the Food category');
  return status as { spent: number; remaining: number; limitAmount: number };
}

// ── Test suite ───────────────────────────────────────────────────────────────

async function run() {
  console.log('Budget status integration tests (release-to-budget review follow-up)');

  // ── A. Baseline: a positive deduction raises spent, lowers remaining ─────────
  await test('a positive BUDGET_DEDUCTION (expense) sets spent and lowers remaining', async () => {
    installBudgetMock({
      timezone: TZ,
      categories: [catRow({ limitAmount: 1000 })],
      deductions: [deduction(200, IN_WINDOW)],
    });
    const { req, res, captured } = mockReqRes();
    await getBudgetStatus(req, res);

    assert.strictEqual(captured.status, 200, `expected 200, got ${captured.status}`);
    const food = foodStatus(captured);
    assert.strictEqual(food.spent, 200, `spent should be 200, got ${food.spent}`);
    assert.strictEqual(food.remaining, 800, `remaining should be 1000 − 200 = 800, got ${food.remaining}`);
  });

  // ── B. Release: a NEGATIVE deduction lowers spent, raises remaining ──────────
  // Acceptance Criterion 2: a release of ₱X makes remaining ₱X higher (and spent
  // ₱X lower) than the same category without the release.
  await test('a release (negative BUDGET_DEDUCTION) raises remaining by exactly the released amount', async () => {
    installBudgetMock({
      timezone: TZ,
      categories: [catRow({ limitAmount: 1000 })],
      // ₱200 spent this period, then a ₱50 savings release credits the budget.
      deductions: [deduction(200, IN_WINDOW), deduction(-50, IN_WINDOW)],
    });
    const { req, res, captured } = mockReqRes();
    await getBudgetStatus(req, res);

    assert.strictEqual(captured.status, 200, `expected 200, got ${captured.status}`);
    const food = foodStatus(captured);
    // spent = 200 + (−50) = 150 → ₱50 lower than the ₱200 baseline.
    assert.strictEqual(food.spent, 150, `spent should be 200 − 50 = 150, got ${food.spent}`);
    // remaining = 1000 − 150 = 850 → ₱50 higher than the 800 baseline.
    assert.strictEqual(food.remaining, 850, `remaining should be 850 (₱50 above baseline 800), got ${food.remaining}`);
  });

  // ── C. Windowing: an out-of-window deduction is not counted ──────────────────
  await test('a deduction whose transaction is outside the current period window is excluded', async () => {
    installBudgetMock({
      timezone: TZ,
      categories: [catRow({ limitAmount: 1000 })],
      // In-window ₱200 counts; a ₱-50 release dated in May (previous period) must not.
      deductions: [deduction(200, IN_WINDOW), deduction(-50, OUT_OF_WINDOW)],
    });
    const { req, res, captured } = mockReqRes();
    await getBudgetStatus(req, res);

    const food = foodStatus(captured);
    assert.strictEqual(food.spent, 200, `only the in-window ₱200 should count, got spent ${food.spent}`);
    assert.strictEqual(food.remaining, 800, `remaining should be 800, got ${food.remaining}`);
  });

  // ── D. Disabled-after-release: the budget path has no savings-enablement gate ─
  // `getBudgetStatus` never reads SavingsSettings, so a released amount stays in
  // the budget (raising remaining) regardless of whether savings are enabled —
  // this is the spec's documented edge: a released-but-unreturned amount is not
  // surfaced in the piggybank while disabled, because it lives in the budget.
  await test('a released amount stays reflected in the budget independent of savings settings', async () => {
    installBudgetMock({
      timezone: TZ,
      categories: [catRow({ limitAmount: 1000 })],
      deductions: [deduction(-50, IN_WINDOW)],
    });
    const { req, res, captured } = mockReqRes();
    await getBudgetStatus(req, res);

    const food = foodStatus(captured);
    // No expenses, one ₱50 release: spent = −50, remaining = 1050 — the release is
    // fully reflected in the budget with no reference to savings enablement.
    assert.strictEqual(food.spent, -50, `spent should be −50 (release only), got ${food.spent}`);
    assert.strictEqual(food.remaining, 1050, `remaining should be 1000 + 50 = 1050, got ${food.remaining}`);
  });

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error('\nFailures:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

run();
