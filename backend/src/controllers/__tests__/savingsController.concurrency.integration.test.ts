/**
 * Concurrency integration tests for the PIN-gated savings-usage endpoint
 * (`postUsage` in `savingsController.ts`, mounted at
 * `POST /api/savings/categories/:categoryId/usage`). Task 6.15 of the
 * savings-piggybank spec.
 *
 * Coverage (requirements in parentheses):
 *   A. N concurrent correct-PIN usages whose combined amount exceeds the
 *      available balance never overdraw the category — committed `Savings_Usage`
 *      rows keep `available >= 0` — thanks to the `SELECT … FOR UPDATE`
 *      serialization of the per-user settings row                       (12.21)
 *   B. N concurrent WRONG-PIN usages count `failedPinAttempts` race-free
 *      (the counter equals N with no lost updates) via the same row lock,
 *      and create no `Savings_Usage` / `Transaction` rows            (12.12, 12.21)
 *
 * Conventions (matching `savingsController.resilience.integration.test.ts` and
 * `savingsController.integration.test.ts`):
 *   - Self-contained `ts-node` assertion script (no jest/vitest runner):
 *       npx ts-node src/controllers/__tests__/savingsController.concurrency.integration.test.ts
 *     Exits non-zero if any assertion fails.
 *   - Runs DB-free by monkeypatching the exported `prisma` singleton with an
 *     in-memory recording fake (a "mocked Prisma client", as the design's
 *     Testing Strategy sanctions).
 *   - To meaningfully exercise the `SELECT … FOR UPDATE` guarantee with an
 *     in-memory fake, `prisma.$transaction` is modelled so that concurrent
 *     invocations SERIALIZE on the locked settings row: the fake `tx.$queryRaw`
 *     that carries `FOR UPDATE` acquires a per-user async mutex (mimicking the
 *     row lock), which is released only when the surrounding transaction
 *     callback settles (commit/rollback). Without that serialization the
 *     assertions below fail (over-withdrawal slips through; `failedPinAttempts`
 *     loses updates), so the tests genuinely depend on the lock the endpoint
 *     relies on.
 *   - `bcrypt` hashing/verification is REAL (the endpoint's own dependency), so
 *     the PIN gate is exercised end-to-end.
 */
import assert from 'node:assert';

// Pull in the global `Express.Request.user` augmentation so the controller
// type-checks when compiled standalone by ts-node.
import '../../middleware/requireAuth';
import bcrypt from 'bcrypt';
import { prisma } from '../../config/db';
import { postUsage } from '../savingsController';
import { gamificationService } from '../../services/gamificationService';
import {
  computeCategorySavings,
  CategoryInput,
  ExpenseInput,
  SavingsEnablement,
  PIN_LOCK_THRESHOLD,
} from '../../services/savingsService';

// `postUsage` fires gamification updates fire-and-forget after a successful
// spend. Stub it so this DB-free concurrency test never reaches the real
// Prisma-backed gamification path and stays isolated from that side effect.
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

// ── Per-user async mutex (mimics SELECT … FOR UPDATE on the settings row) ─────
/**
 * A fair FIFO async lock keyed by user id. `acquire(key)` resolves with a
 * `release` function once the previous holder for that key has released. This is
 * exactly the serialization a `SELECT … FOR UPDATE` row lock provides: the
 * second transaction blocks at the SELECT until the first commits/rolls back.
 */
class UserMutex {
  private chain = new Map<string, Promise<void>>();

  acquire(key: string): Promise<() => void> {
    const prev = this.chain.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.chain.set(
      key,
      prev.then(() => next),
    );
    return prev.then(() => release);
  }
}

// ── In-memory recording store + fake Prisma client ───────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface SettingsRow {
  id: string;
  userId: string;
  pinHash: string | null;
  failedPinAttempts: number;
  pinLockedUntil: Date | null;
  enabled: boolean;
  enabledAt: Date | null;
}

interface CategoryRow {
  id: string;
  userId: string;
  name: string;
  limitAmount: number;
  period: string;
  monthlyStartDay: number | null;
  weeklyStartDay: number | null;
  customPeriodDays: number | null;
  anchorDate: Date | null;
  fundedDaySchedule: { fundedWeekdays: number[] } | null;
  fundedDayOverrides: { date: Date; funded: boolean }[];
}

interface Store {
  settings: SettingsRow;
  category: CategoryRow;
  expenses: { categoryId: string; totalAmount: number; createdAt: Date }[];
  usages: { id: string; userId: string; categoryId: string; amount: number; transactionId: string; createdAt: Date }[];
  transactions: { id: string; creatorId: string; categoryId: string; totalAmount: number; type: string }[];
  ledgerEntries: { id: string; transactionId: string; userId: string; amountChange: number; type: string }[];
  mutex: UserMutex;
  seq: number;
}

let store: Store;

function resetStore(settings: Partial<SettingsRow>, category: CategoryRow, expenses: Store['expenses']) {
  store = {
    settings: {
      id: 'settings-1',
      userId: category.userId,
      pinHash: null,
      failedPinAttempts: 0,
      pinLockedUntil: null,
      enabled: true,
      enabledAt: null,
      ...settings,
    },
    category,
    expenses,
    usages: [],
    transactions: [],
    ledgerEntries: [],
    mutex: new UserMutex(),
    seq: 0,
  };
}

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

/** Build a fake transactional client (`tx`) whose FOR-UPDATE query takes the lock. */
function buildTx(release: { fn: (() => void) | null }) {
  return {
    // Tagged-template `$queryRaw` — the controller issues the FOR UPDATE here.
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (/FOR UPDATE/i.test(sql) && /savings_settings/i.test(sql)) {
        const userId = String(values[0]);
        // Acquire the per-user lock; hold it until the transaction settles.
        release.fn = await store.mutex.acquire(userId);
        const s = store.settings;
        return [
          {
            id: s.id,
            pinHash: s.pinHash,
            failedPinAttempts: s.failedPinAttempts,
            pinLockedUntil: s.pinLockedUntil,
            enabled: s.enabled,
            enabledAt: s.enabledAt,
          },
        ];
      }
      return [];
    },
    savingsSettings: {
      update: async ({ data }: { where: unknown; data: Partial<SettingsRow> }) => {
        Object.assign(store.settings, data);
        return { ...store.settings };
      },
    },
    category: {
      findUnique: async () => ({ ...store.category }),
    },
    transaction: {
      findMany: async () =>
        store.expenses.map((e) => ({
          categoryId: e.categoryId,
          totalAmount: e.totalAmount,
          createdAt: e.createdAt,
        })),
      create: async ({ data }: { data: any }) => {
        const row = { id: nextId('txn'), ...data };
        store.transactions.push(row);
        return row;
      },
    },
    ledgerEntry: {
      create: async ({ data }: { data: any }) => {
        const row = { id: nextId('ledger'), ...data };
        store.ledgerEntries.push(row);
        return row;
      },
    },
    savingsUsage: {
      findMany: async () =>
        store.usages
          .filter((u) => u.categoryId === store.category.id)
          .map((u) => ({ categoryId: u.categoryId, amount: u.amount, createdAt: u.createdAt })),
      create: async ({ data }: { data: any }) => {
        const row = { id: nextId('usage'), createdAt: new Date(), ...data };
        store.usages.push(row);
        return row;
      },
    },
  };
}

/** Install the recording read-only + transactional fakes onto the prisma singleton. */
function installPrismaMock() {
  // Timezone lookup (resolveRequestTimezone) — read-only, outside the lock.
  (prisma as any).userGamification = {
    findUnique: async () => ({ timezone: 'Asia/Manila' }),
  };
  // Ownership lookup (findOwnedCategory) — read-only, outside the lock.
  (prisma as any).category = {
    findUnique: async () => ({ id: store.category.id, userId: store.category.userId }),
  };
  // The transaction wrapper serializes concurrent callers via the FOR UPDATE
  // lock taken inside the callback and released when the callback settles.
  (prisma as any).$transaction = async (fn: (tx: any) => Promise<unknown>) => {
    const release: { fn: (() => void) | null } = { fn: null };
    const tx = buildTx(release);
    try {
      return await fn(tx);
    } finally {
      if (release.fn) {
        const r = release.fn;
        release.fn = null;
        r();
      }
    }
  };
}

// ── Express req/res doubles ──────────────────────────────────────────────────

function mockReqRes(body: Record<string, unknown>, userId: string) {
  const req = {
    body,
    query: {},
    params: { categoryId: store.category.id },
    headers: { 'x-timezone': 'Asia/Manila' },
    user: { id: userId },
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

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TZ = 'Asia/Manila';

function makeCategory(): CategoryRow {
  return {
    id: 'cat-food',
    userId: USER_ID,
    name: 'Food',
    limitAmount: 1000,
    period: 'MONTHLY',
    monthlyStartDay: 1,
    weeklyStartDay: null,
    customPeriodDays: null,
    anchorDate: null,
    fundedDaySchedule: null, // defaults to all seven weekdays (Requirement 1.2)
    fundedDayOverrides: [],
  };
}

/** The pure CategoryInput matching how the controller maps the same row. */
function toCategoryInput(cat: CategoryRow): CategoryInput {
  return {
    id: cat.id,
    name: cat.name,
    limitAmount: cat.limitAmount,
    period: cat.period as CategoryInput['period'],
    monthlyStartDay: cat.monthlyStartDay,
    weeklyStartDay: cat.weeklyStartDay,
    customPeriodDays: cat.customPeriodDays,
    anchorDate: cat.anchorDate,
    schedule: [0, 1, 2, 3, 4, 5, 6],
    overrides: new Map<string, boolean>(),
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ── Test suite ───────────────────────────────────────────────────────────────

async function run() {
  console.log('Savings_API usage-endpoint concurrency integration tests (task 6.15)');
  installPrismaMock();

  const CORRECT_PIN = '482913';
  const WRONG_PIN = '000000';
  const pinHash = await bcrypt.hash(CORRECT_PIN, 10);

  // Enablement lower bound several months in the past so multiple MONTHLY
  // periods have closed and the category has a sizeable accrued balance.
  const enabledAt = new Date(Date.now() - 5 * 30 * MS_PER_DAY);

  // ══ A. Concurrent correct-PIN usages never overdraw (Req 12.21) ════════════
  await test('N concurrent correct-PIN usages never overdraw the category (12.21)', async () => {
    const category = makeCategory();
    const expenses: Store['expenses'] = [
      { categoryId: category.id, totalAmount: 50, createdAt: new Date(Date.now() - 40 * MS_PER_DAY) },
    ];
    resetStore({ pinHash, enabled: true, enabledAt }, category, expenses);

    // Compute the accrued balance the endpoint will independently recompute, so
    // we can size the concurrent spends to exceed it. MONTHLY boundaries are
    // stable across the few ms between this and each request's own `new Date()`.
    const now = new Date();
    const enablement: SavingsEnablement = { enabled: true, enabledAt };
    const catExpenses: ExpenseInput[] = expenses.map((e) => ({
      categoryId: e.categoryId,
      amount: e.totalAmount,
      createdAt: e.createdAt,
    }));
    const accrued = computeCategorySavings(toCategoryInput(category), catExpenses, [], enablement, now, TZ)
      .accruedSavings;
    assert.ok(accrued > 0, `fixture must accrue a positive balance, got ${accrued}`);

    // Each request asks for ~30% of the accrued balance; firing N=5 requests
    // (combined 150% of accrued) guarantees the combined demand overdraws.
    const N = 5;
    const per = round2(accrued * 0.3);
    assert.ok(per > 0, 'per-request amount must be positive');

    const runs = Array.from({ length: N }, () => {
      const { req, res, captured } = mockReqRes({ amount: per, pin: CORRECT_PIN, type: 'EXPENSE' }, USER_ID);
      return postUsage(req, res).then(() => captured);
    });
    const results = await Promise.all(runs);

    const successes = results.filter((r) => r.status === 201);
    const overdrawRejections = results.filter((r) => r.status === 400);

    // The row lock must let SOME but not ALL spends commit (combined > accrued).
    assert.ok(successes.length >= 1, 'at least one spend should commit');
    assert.ok(successes.length < N, `combined demand exceeds accrued; not all ${N} should commit`);

    // Core over-withdrawal invariant: committed usage never overdraws (Req 12.21).
    const committedSum = store.usages.reduce((acc, u) => acc + u.amount, 0);
    assert.strictEqual(store.usages.length, successes.length, 'a Savings_Usage row per committed spend');
    assert.ok(
      round2(committedSum) <= round2(accrued),
      `committed usage ${committedSum} must not overdraw accrued ${accrued}`,
    );
    const available = round2(accrued - committedSum);
    assert.ok(available >= 0, `available must never go negative, got ${available}`);

    // Every rejection is the over-withdrawal guard (not a PIN/lock error), and
    // one Transaction + LedgerEntry was written per committed usage only.
    assert.strictEqual(
      successes.length + overdrawRejections.length,
      N,
      'each request either commits or is rejected for over-withdrawal',
    );
    assert.strictEqual(store.transactions.length, successes.length, 'one Transaction per committed spend');
    assert.strictEqual(store.ledgerEntries.length, successes.length, 'one LedgerEntry per committed spend');
  });

  // ══ B. Concurrent wrong-PIN usages count attempts race-free (Req 12.12, 12.21) ═
  await test('N concurrent wrong-PIN usages count failedPinAttempts race-free (12.12, 12.21)', async () => {
    const category = makeCategory();
    const expenses: Store['expenses'] = [
      { categoryId: category.id, totalAmount: 50, createdAt: new Date(Date.now() - 40 * MS_PER_DAY) },
    ];
    // Fire fewer than the lock threshold so every attempt is counted (a lock
    // would short-circuit later attempts without incrementing — Req 12.14). This
    // isolates the race-free-counting guarantee: the counter must equal N.
    const N = PIN_LOCK_THRESHOLD - 1;
    assert.ok(N >= 2, 'need at least two concurrent attempts to observe a race');
    resetStore({ pinHash, enabled: true, enabledAt, failedPinAttempts: 0 }, category, expenses);

    const runs = Array.from({ length: N }, () => {
      const { req, res, captured } = mockReqRes({ amount: 10, pin: WRONG_PIN, type: 'EXPENSE' }, USER_ID);
      return postUsage(req, res).then(() => captured);
    });
    const results = await Promise.all(runs);

    // Every wrong-PIN attempt is rejected 401 (below the lock threshold).
    for (const r of results) {
      assert.strictEqual(r.status, 401, `wrong PIN must be rejected 401, got ${r.status}`);
    }

    // Race-free counting: with the FOR UPDATE serialization each attempt reads
    // the prior committed count, so the total is exactly N (no lost updates).
    assert.strictEqual(
      store.settings.failedPinAttempts,
      N,
      `failedPinAttempts must equal ${N} (no lost updates), got ${store.settings.failedPinAttempts}`,
    );

    // A wrong PIN writes no Savings_Usage / Transaction / LedgerEntry (Req 12.6).
    assert.strictEqual(store.usages.length, 0, 'wrong PIN must create no Savings_Usage rows');
    assert.strictEqual(store.transactions.length, 0, 'wrong PIN must create no Transaction rows');
    assert.strictEqual(store.ledgerEntries.length, 0, 'wrong PIN must create no LedgerEntry rows');
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
  console.error('Unexpected error running concurrency integration tests:', err);
  process.exit(1);
});
