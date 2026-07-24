/**
 * Integration tests for PIN-gated savings usage
 * (endpoint `POST /api/savings/categories/:categoryId/usage`, implemented by
 * `postUsage` in `savingsController.ts` and wired in `savingsRoutes.ts`).
 * Task 6.13 of the savings-piggybank spec.
 *
 * Coverage (requirements in parentheses):
 *   A. Correct PIN → 201, exactly one Savings_Usage + one Transaction + one
 *      BUDGET_DEDUCTION LedgerEntry, all linked by transactionId; failedPinAttempts
 *      reset to 0                                                    (12.5, 12.13)
 *   B. Wrong PIN → 401, no rows, failedPinAttempts incremented by 1  (12.6, 12.12)
 *   C. Missing PIN → rejected (no rows) before the PIN gate          (12.6)
 *   D. Usage while no PIN is set → 400, no rows                      (12.7)
 *   E. Over-withdrawal → 400, no rows                                (12.10)
 *   F. Non-positive / too-precise amount → 400, no rows             (12.11)
 *   G. Foreign / absent category → 403 / 404, no rows                (12.20)
 *   H. Usage while disabled → 409, no rows                           (9.5)
 *
 * Conventions (matching `savingsController.resilience.integration.test.ts`):
 *   - Self-contained `ts-node` assertion script (no jest/vitest runner):
 *       npx ts-node src/controllers/__tests__/savingsController.usage.integration.test.ts
 *     Exits non-zero if any assertion fails.
 *   - The controller is driven DB-free by monkeypatching the exported `prisma`
 *     singleton with recording in-memory fakes. Because `postUsage` runs its
 *     PIN gate + writes inside `prisma.$transaction(fn)` using a
 *     `SELECT … FOR UPDATE` raw query on `savings_settings`, the fake provides:
 *       * `$transaction(fn)` that invokes `fn` with a recording `tx` client;
 *       * `tx.$queryRaw` returning the (locked) settings row;
 *       * `tx.savingsSettings.update` that mutates the in-memory settings row so
 *         `failedPinAttempts` / `pinLockedUntil` transitions can be asserted;
 *       * recording `tx.transaction.create`, `tx.ledgerEntry.create`,
 *         `tx.savingsUsage.create`, so "exactly one row" / "no rows" is verified
 *         structurally.
 *   - `bcrypt` is used for real: the "correct" PIN is a genuine bcrypt hash, so
 *     `bcrypt.compare` in the controller exercises the real verification path.
 */
import assert from 'node:assert';
import bcrypt from 'bcrypt';

// Pull in the global `Express.Request.user` augmentation so the controller
// type-checks when compiled standalone by ts-node.
import '../../middleware/requireAuth';
import { prisma } from '../../config/db';
import { postUsage } from '../savingsController';
import { gamificationService } from '../../services/gamificationService';

// `postUsage` fires gamification updates fire-and-forget after a successful
// spend. Stub it so this DB-free controller test never reaches the real
// Prisma-backed gamification path (that logic has its own suite); this keeps the
// controller under test isolated from its downstream side effect.
(gamificationService as unknown as {
  triggerGamificationUpdates: (userId: string) => Promise<void>;
}).triggerGamificationUpdates = async () => {};

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
const OTHER_ID = 'other-user-id';
const CAT_OWNED = 'cat-owned';
const CAT_FOREIGN = 'cat-foreign';
const CAT_MISSING = 'cat-missing';
const TZ = 'Asia/Manila';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CORRECT_PIN = '482913';
const WRONG_PIN = '000000';
// A genuine bcrypt hash (saltRounds = 10, matching the controller) so the real
// `bcrypt.compare` verification path is exercised.
const PIN_HASH = bcrypt.hashSync(CORRECT_PIN, 10);

/** A locked settings row as returned by the `SELECT … FOR UPDATE` raw query. */
interface SettingsRow {
  id: string;
  pinHash: string | null;
  failedPinAttempts: number;
  pinLockedUntil: Date | null;
  enabled: boolean;
  enabledAt: Date | null;
}

/** A Prisma-shaped category row (superset covering both `select` and `include`). */
function catRow(overrides: Partial<{
  id: string;
  userId: string;
  name: string;
  limitAmount: number;
  period: string;
  monthlyStartDay: number | null;
  weeklyStartDay: number | null;
  customPeriodDays: number | null;
  anchorDate: Date | null;
}> = {}) {
  return {
    id: CAT_OWNED,
    userId: OWNER_ID,
    name: 'Food',
    limitAmount: 1000,
    period: 'MONTHLY',
    monthlyStartDay: 1,
    weeklyStartDay: null,
    customPeriodDays: null,
    anchorDate: null,
    fundedDaySchedule: null,
    fundedDayOverrides: [] as { date: Date; funded: boolean }[],
    ...overrides,
  };
}

interface UsageState {
  timezone: string | null;
  /** Category rows keyed by id — used by both the pre-tx ownership lookup and the in-tx reload. */
  categories: Record<string, ReturnType<typeof catRow>>;
  /** The row returned by the FOR UPDATE query (null → no SavingsSettings row). */
  settings: SettingsRow | null;
  /** EXPENSE transactions returned inside the tx (drive accrued savings). */
  expenses: { categoryId: string; totalAmount: number; createdAt: Date }[];
  /** Committed Savings_Usage rows returned inside the tx (offset accrual). */
  usages: { categoryId: string; amount: number; createdAt: Date }[];
  // Recorders.
  created: { transactions: any[]; ledgerEntries: any[]; savingsUsages: any[] };
  settingsUpdates: any[];
}

function freshState(partial: Partial<UsageState> = {}): UsageState {
  return {
    timezone: TZ,
    categories: {
      [CAT_OWNED]: catRow(),
      [CAT_FOREIGN]: catRow({ id: CAT_FOREIGN, userId: OTHER_ID, name: 'Rent' }),
    },
    settings: {
      id: 'settings-1',
      pinHash: PIN_HASH,
      failedPinAttempts: 0,
      pinLockedUntil: null,
      enabled: true,
      enabledAt: null,
    },
    expenses: [],
    usages: [],
    created: { transactions: [], ledgerEntries: [], savingsUsages: [] },
    settingsUpdates: [],
    ...partial,
  };
}

/**
 * Install recording in-memory fakes onto the exported `prisma` singleton for the
 * usage write path, closing over `state` so its counters/rows can be asserted.
 */
function installUsageMock(state: UsageState) {
  let txnSeq = 0;
  let useSeq = 0;

  const txClient = {
    // The FOR UPDATE lock read — tagged-template call; args are ignored.
    $queryRaw: async (..._args: any[]) => (state.settings ? [state.settings] : []),
    savingsSettings: {
      update: async (args: any) => {
        state.settingsUpdates.push(args);
        if (state.settings) Object.assign(state.settings, args.data);
        return state.settings;
      },
    },
    category: {
      findUnique: async (args: any) => state.categories[args.where.id] ?? null,
    },
    transaction: {
      findMany: async (_args: any) => state.expenses,
      create: async (args: any) => {
        const row = { id: `txn-${++txnSeq}`, ...args.data };
        state.created.transactions.push(row);
        return row;
      },
    },
    ledgerEntry: {
      create: async (args: any) => {
        const row = { id: `led-${state.created.ledgerEntries.length + 1}`, ...args.data };
        state.created.ledgerEntries.push(row);
        return row;
      },
    },
    savingsUsage: {
      findMany: async (_args: any) => state.usages,
      create: async (args: any) => {
        const row = { id: `use-${++useSeq}`, createdAt: new Date(), ...args.data };
        state.created.savingsUsages.push(row);
        return row;
      },
    },
  };

  (prisma as any).userGamification = {
    findUnique: async () => (state.timezone === null ? null : { timezone: state.timezone }),
  };
  (prisma as any).category = {
    findUnique: async (args: any) => state.categories[args.where.id] ?? null,
  };
  (prisma as any).$transaction = async (fn: (tx: any) => any) => fn(txClient);
}

// ── Express req/res doubles ──────────────────────────────────────────────────

function mockReqRes(opts: {
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  userId?: string;
}) {
  const req = {
    body: opts.body ?? {},
    query: {},
    params: opts.params ?? {},
    headers: opts.headers ?? { 'x-timezone': TZ },
    user: { id: opts.userId ?? OWNER_ID },
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

/** Assert that NO Savings_Usage, Transaction, or LedgerEntry rows were written. */
function assertNoRows(state: UsageState) {
  assert.strictEqual(state.created.transactions.length, 0, 'a Transaction was created');
  assert.strictEqual(state.created.ledgerEntries.length, 0, 'a LedgerEntry was created');
  assert.strictEqual(state.created.savingsUsages.length, 0, 'a Savings_Usage was created');
}

// ── Test suite ───────────────────────────────────────────────────────────────

async function run() {
  console.log('Savings_API PIN-gated usage integration tests (task 6.13)');

  // ══ A. Correct PIN → one RELEASE usage + one TOP_UP txn + one negative
  //       BUDGET_DEDUCTION ledger entry, linked (12.5, 12.13) ══════════════════
  await test('correct PIN creates exactly one RELEASE Savings_Usage, TOP_UP Transaction, and linked NEGATIVE BUDGET_DEDUCTION LedgerEntry; resets failedPinAttempts (12.5, 12.13)', async () => {
    const state = freshState({
      // An old expense establishes closed periods so the category has accrued
      // savings well above the requested amount.
      expenses: [{ categoryId: CAT_OWNED, totalAmount: 10, createdAt: new Date(Date.now() - 120 * MS_PER_DAY) }],
    });
    state.settings!.failedPinAttempts = 2; // will be reset to 0 on success (12.13)
    installUsageMock(state);

    const { req, res, captured } = mockReqRes({
      params: { categoryId: CAT_OWNED },
      body: { amount: 100, pin: CORRECT_PIN },
    });
    await postUsage(req, res);

    assert.strictEqual(captured.status, 201, `expected 201, got ${captured.status} (${JSON.stringify(captured.body)})`);

    // Exactly one of each row (12.5).
    assert.strictEqual(state.created.savingsUsages.length, 1, 'expected exactly one Savings_Usage');
    assert.strictEqual(state.created.transactions.length, 1, 'expected exactly one Transaction');
    assert.strictEqual(state.created.ledgerEntries.length, 1, 'expected exactly one LedgerEntry');

    const txn = state.created.transactions[0];
    const ledger = state.created.ledgerEntries[0];
    const usage = state.created.savingsUsages[0];

    // The release credits the budget: a TOP_UP transaction with a NEGATIVE
    // BUDGET_DEDUCTION (raises remaining) and a RELEASE-kind Savings_Usage, all
    // linked by transactionId (spec Requirement Group 1, 12.5).
    assert.strictEqual(ledger.type, 'BUDGET_DEDUCTION', 'ledger entry must be a BUDGET_DEDUCTION');
    assert.strictEqual(ledger.amountChange, -100, 'BUDGET_DEDUCTION must be NEGATIVE to raise remaining budget');
    assert.strictEqual(ledger.transactionId, txn.id, 'ledger entry must link the created transaction');
    assert.strictEqual(usage.transactionId, txn.id, 'Savings_Usage must reference the created transaction');
    assert.strictEqual(usage.kind, 'RELEASE', 'Savings_Usage must be tagged kind = RELEASE');
    assert.strictEqual(txn.type, 'TOP_UP', 'transaction type must be TOP_UP');
    assert.strictEqual(txn.totalAmount, 100, 'transaction amount must match the request');
    assert.strictEqual(usage.amount, 100, 'usage amount must match the request');

    // Response mirrors the transaction shape with type TOP_UP (Requirement Group 1).
    assert.strictEqual(captured.body.transaction.type, 'TOP_UP', 'response transaction.type must be TOP_UP');
    // Response body links usage → transaction (12.5).
    assert.strictEqual(captured.body.usage.transactionId, captured.body.transaction.id, 'response usage.transactionId must match transaction.id');

    // failedPinAttempts reset to 0 on a correct PIN (12.13).
    assert.strictEqual(state.settings!.failedPinAttempts, 0, 'failedPinAttempts must reset to 0 on a correct PIN');
    assert.strictEqual(state.settings!.pinLockedUntil, null, 'pinLockedUntil must clear on a correct PIN');
  });

  // ══ A2. Legacy `type: 'SETTLEMENT'` is ignored → still a TOP_UP release ═════
  await test("body type 'SETTLEMENT' is ignored and a TOP_UP release is performed (SETTLEMENT path removed)", async () => {
    const state = freshState({
      expenses: [{ categoryId: CAT_OWNED, totalAmount: 10, createdAt: new Date(Date.now() - 120 * MS_PER_DAY) }],
    });
    installUsageMock(state);

    const { req, res, captured } = mockReqRes({
      params: { categoryId: CAT_OWNED },
      body: { amount: 100, pin: CORRECT_PIN, type: 'SETTLEMENT' },
    });
    await postUsage(req, res);

    assert.strictEqual(captured.status, 201, `expected 201, got ${captured.status} (${JSON.stringify(captured.body)})`);
    assert.strictEqual(state.created.transactions.length, 1, 'expected exactly one Transaction');
    assert.strictEqual(state.created.transactions[0].type, 'TOP_UP', 'a SETTLEMENT body must still produce a TOP_UP');
    assert.strictEqual(state.created.savingsUsages[0].kind, 'RELEASE', 'usage must be a RELEASE regardless of body.type');
  });

  // ══ B. Wrong PIN → 401, no rows, failedPinAttempts +1 (12.6, 12.12) ════════
  await test('wrong PIN → 401 with no rows and failedPinAttempts incremented by 1 (12.6, 12.12)', async () => {
    const state = freshState();
    state.settings!.failedPinAttempts = 0;
    installUsageMock(state);

    const { req, res, captured } = mockReqRes({
      params: { categoryId: CAT_OWNED },
      body: { amount: 100, pin: WRONG_PIN },
    });
    await postUsage(req, res);

    assert.strictEqual(captured.status, 401, `expected 401, got ${captured.status}`);
    assertNoRows(state);
    assert.strictEqual(state.settings!.failedPinAttempts, 1, 'failedPinAttempts must increment by 1 on a wrong PIN');
  });

  // ══ C. Missing PIN → rejected before the PIN gate, no rows (12.6) ══════════
  // The endpoint guards PIN presence up front (before opening the locked
  // transaction), so an omitted PIN is rejected with a 400 validation error and
  // no Savings_Usage/Transaction is created — satisfying Req 12.6's "reject with
  // no rows" guarantee. (The counter is only incremented for an incorrect PIN
  // submission — Req 12.12 — not an omitted one, since no compare is performed.)
  await test('missing PIN → rejected (4xx) with no rows (12.6)', async () => {
    const state = freshState();
    installUsageMock(state);

    const { req, res, captured } = mockReqRes({
      params: { categoryId: CAT_OWNED },
      body: { amount: 100 }, // no pin
    });
    await postUsage(req, res);

    assert.strictEqual(captured.status, 400, `expected 400, got ${captured.status}`);
    assertNoRows(state);
    assert.strictEqual(state.settingsUpdates.length, 0, 'no settings write should occur when the PIN is omitted');
  });

  // ══ D. Usage while no PIN is set → 400, no rows (12.7) ═════════════════════
  await test('usage while no Savings_PIN is set → 400 with no rows (12.7)', async () => {
    const state = freshState();
    state.settings!.pinHash = null; // no PIN configured
    installUsageMock(state);

    const { req, res, captured } = mockReqRes({
      params: { categoryId: CAT_OWNED },
      body: { amount: 100, pin: CORRECT_PIN },
    });
    await postUsage(req, res);

    assert.strictEqual(captured.status, 400, `expected 400, got ${captured.status}`);
    assertNoRows(state);
    const msg = (captured.body as { error?: string })?.error ?? '';
    assert.ok(/pin/i.test(msg), `expected a "PIN must be set" message, got: ${msg}`);
  });

  // ══ E. Over-withdrawal → 400, no rows (12.10) ══════════════════════════════
  await test('over-withdrawal (amount > available) → 400 with no rows (12.10)', async () => {
    // No expenses → the category accrues 0, so available is 0 and ANY positive
    // amount over-withdraws. The correct PIN + enabled state let the request
    // reach the over-withdrawal check.
    const state = freshState({ expenses: [], usages: [] });
    installUsageMock(state);

    const { req, res, captured } = mockReqRes({
      params: { categoryId: CAT_OWNED },
      body: { amount: 50, pin: CORRECT_PIN },
    });
    await postUsage(req, res);

    assert.strictEqual(captured.status, 400, `expected 400, got ${captured.status}`);
    assertNoRows(state);
    const msg = (captured.body as { error?: string })?.error ?? '';
    assert.ok(/exceed|available/i.test(msg), `expected an over-withdrawal message, got: ${msg}`);
  });

  // ══ F. Non-positive / too-precise amount → 400, no rows (12.11) ════════════
  await test('zero amount → 400 with no rows (12.11)', async () => {
    const state = freshState();
    installUsageMock(state);
    const { req, res, captured } = mockReqRes({
      params: { categoryId: CAT_OWNED },
      body: { amount: 0, pin: CORRECT_PIN },
    });
    await postUsage(req, res);
    assert.strictEqual(captured.status, 400, `expected 400, got ${captured.status}`);
    assertNoRows(state);
    assert.strictEqual(state.settingsUpdates.length, 0, 'amount validation must run before any settings write');
  });

  await test('negative amount → 400 with no rows (12.11)', async () => {
    const state = freshState();
    installUsageMock(state);
    const { req, res, captured } = mockReqRes({
      params: { categoryId: CAT_OWNED },
      body: { amount: -25, pin: CORRECT_PIN },
    });
    await postUsage(req, res);
    assert.strictEqual(captured.status, 400, `expected 400, got ${captured.status}`);
    assertNoRows(state);
  });

  await test('too-precise amount (3 decimals) → 400 with no rows (12.11)', async () => {
    const state = freshState();
    installUsageMock(state);
    const { req, res, captured } = mockReqRes({
      params: { categoryId: CAT_OWNED },
      body: { amount: 1.234, pin: CORRECT_PIN },
    });
    await postUsage(req, res);
    assert.strictEqual(captured.status, 400, `expected 400, got ${captured.status}`);
    assertNoRows(state);
  });

  // ══ G. Foreign / absent category → 403 / 404, no rows (12.20) ══════════════
  await test('foreign category → 403 with no rows (12.20)', async () => {
    const state = freshState();
    installUsageMock(state);
    const { req, res, captured } = mockReqRes({
      params: { categoryId: CAT_FOREIGN }, // owned by OTHER_ID
      body: { amount: 100, pin: CORRECT_PIN },
    });
    await postUsage(req, res);
    assert.strictEqual(captured.status, 403, `expected 403, got ${captured.status}`);
    assertNoRows(state);
    assert.strictEqual(state.settingsUpdates.length, 0, 'a foreign category must never open the usage transaction');
  });

  await test('absent category → 404 with no rows (12.20)', async () => {
    const state = freshState();
    installUsageMock(state);
    const { req, res, captured } = mockReqRes({
      params: { categoryId: CAT_MISSING }, // no such category
      body: { amount: 100, pin: CORRECT_PIN },
    });
    await postUsage(req, res);
    assert.strictEqual(captured.status, 404, `expected 404, got ${captured.status}`);
    assertNoRows(state);
  });

  // ══ H. Usage while disabled → 409, no rows (9.5) ═══════════════════════════
  await test('usage while savings are disabled → 409 with no rows (9.5)', async () => {
    const state = freshState();
    state.settings!.enabled = false; // savings turned off
    installUsageMock(state);

    const { req, res, captured } = mockReqRes({
      params: { categoryId: CAT_OWNED },
      body: { amount: 100, pin: CORRECT_PIN },
    });
    await postUsage(req, res);

    assert.strictEqual(captured.status, 409, `expected 409, got ${captured.status}`);
    assertNoRows(state);
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error('\nFailures:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unexpected error running PIN-gated usage integration tests:', err);
  process.exit(1);
});
