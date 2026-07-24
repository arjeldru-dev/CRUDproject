/**
 * Integration tests for the Savings_PIN brute-force lockout + auto-unlock on the
 * PIN-gated savings-usage endpoint (savings-piggybank feature, task 6.14).
 *
 * Endpoint under test: POST /api/savings/categories/:categoryId/usage
 * (`postUsage` in `savingsController.ts`). These drive the REAL Express router
 * (`savingsRoutes`) — `requireAuth`, `savingsController`, and the pure
 * `savingsService` predicates it delegates to (`isPinLocked`) — over real HTTP,
 * so the router → middleware → controller → data-layer path is exercised end to
 * end, including the interactive `prisma.$transaction` and the
 * `SELECT … FOR UPDATE` (`$queryRaw`) settings-row lock.
 *
 * The only substitution is the Prisma data layer: a faithful in-memory double is
 * injected in place of `../config/db` (via the CommonJS require cache) so the
 * tests run without a live database and never touch shared/production data. The
 * double keeps the user's `SavingsSettings` row (`failedPinAttempts`,
 * `pinLockedUntil`, `pinHash`, `enabled`, `enabledAt`) as MUTABLE in-memory state
 * that is read (via `$queryRaw … FOR UPDATE`) and updated (via
 * `savingsSettings.update`) across requests, exactly as the controller expects,
 * so lockout counting and reset are the controller's genuine behavior rather
 * than canned responses. The double also records every created `Transaction` /
 * `LedgerEntry` / `SavingsUsage` so "creates no rows" can be asserted structurally.
 *
 * Rather than real fake timers (the controller reads wall-clock `new Date()`),
 * the passage of time is modeled by manipulating the stored `pinLockedUntil`
 * instant relative to `Date.now()`: a future value means "still locked", and a
 * past value means "the PIN_LOCK_COOLDOWN has elapsed". This is exactly the datum
 * `isPinLocked(pinLockedUntil, now)` consults, so it faithfully drives the
 * lock/unlock branches.
 *
 * The lockout THRESHOLD and COOLDOWN are imported from the single exported
 * constants in `savingsService` (`PIN_LOCK_THRESHOLD`, `PIN_LOCK_COOLDOWN_MS`)
 * and used to drive the loop counts and duration assertions, so the tests prove
 * the behavior is sourced from those constants (Requirement 12.16).
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/controllers/__tests__/savingsController.pinLockout.integration.test.ts
 * Exits non-zero if any assertion fails.
 *
 * Covers:
 *   - THRESHOLD consecutive wrong PINs lock spending; a correct PIN is then
 *     rejected with a lock error and creates NO rows ............ Req 12.14
 *   - Cooldown elapsing clears the lock and resets failedPinAttempts,
 *     so a subsequent correct PIN succeeds ..................... Req 12.15
 *   - Threshold + cooldown are sourced from the exported constants  Req 12.16
 *   - Read-only endpoints stay available while locked .......... Req 12.17
 */
import assert from 'node:assert';
import type { AddressInfo } from 'node:net';

// ── Test environment ─────────────────────────────────────────────────────────
process.env.JWT_SECRET = 'integration-test-secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://unused:unused@localhost:1/unused';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const OWNER_ID = 'owner-user-id';
const CAT_ID = 'cat-owned';
const CORRECT_PIN = '482913';
const WRONG_PIN = '000000';

// ── In-memory Prisma double (mutable settings state + write recorder) ─────────

interface SettingsRow {
  id: string;
  userId: string;
  enabled: boolean;
  enabledAt: Date | null;
  pinHash: string | null;
  failedPinAttempts: number;
  pinLockedUntil: Date | null;
}

// The category accrues savings across several closed MONTHLY periods (enabledAt
// far in the past, one small seed expense) so a correct-PIN spend is well within
// the available balance and never trips the over-withdrawal guard.
const settingsStore: SettingsRow = {
  id: 'settings-1',
  userId: OWNER_ID,
  enabled: true,
  enabledAt: new Date(Date.now() - 200 * MS_PER_DAY),
  pinHash: null, // set to a real bcrypt hash of CORRECT_PIN during setup
  failedPinAttempts: 0,
  pinLockedUntil: null,
};

const categoryRow = {
  id: CAT_ID,
  userId: OWNER_ID,
  name: 'Food',
  limitAmount: 1000,
  period: 'MONTHLY',
  monthlyStartDay: 1,
  weeklyStartDay: null as number | null,
  customPeriodDays: null as number | null,
  anchorDate: null as Date | null,
};

interface TxnRow {
  id: string;
  categoryId: string | null;
  creatorId: string;
  totalAmount: number;
  type: string;
  createdAt: Date;
}
interface LedgerRow {
  id: string;
  transactionId: string;
  userId: string;
  amountChange: number;
  type: string;
}
interface UsageRow {
  id: string;
  userId: string;
  categoryId: string;
  amount: number;
  transactionId: string;
  createdAt: Date;
}

const transactions: TxnRow[] = [
  {
    id: 'txn-seed',
    categoryId: CAT_ID,
    creatorId: OWNER_ID,
    totalAmount: 10,
    type: 'EXPENSE',
    createdAt: new Date(Date.now() - 120 * MS_PER_DAY),
  },
];
const ledgerEntries: LedgerRow[] = [];
const savingsUsages: UsageRow[] = [];
let txnSeq = 0;
let ledgerSeq = 0;
let usageSeq = 0;

function categoryWithFunded() {
  return {
    ...categoryRow,
    fundedDaySchedule: null as { fundedWeekdays: number[] } | null,
    fundedDayOverrides: [] as { date: Date; funded: boolean }[],
  };
}

/** A single client object shared by `prisma` and the `$transaction` `tx`. */
const fakePrisma: any = {
  // Interactive transaction: run the callback against this same client so all
  // reads/writes share the one mutable store. No rollback modeling is needed —
  // on every rejecting path the controller performs at most a settings update
  // (which must persist across requests, per the lockout design) and never a
  // create before it throws.
  async $transaction(fn: (tx: any) => Promise<any>) {
    return fn(fakePrisma);
  },

  // `SELECT … FOR UPDATE` on the settings row (Requirement 12.21): return the
  // current mutable snapshot with the camelCase aliases the controller reads.
  async $queryRaw() {
    return [
      {
        id: settingsStore.id,
        pinHash: settingsStore.pinHash,
        failedPinAttempts: settingsStore.failedPinAttempts,
        pinLockedUntil: settingsStore.pinLockedUntil,
        enabled: settingsStore.enabled,
        enabledAt: settingsStore.enabledAt,
      },
    ];
  },

  savingsSettings: {
    async findUnique() {
      // Read endpoints select subsets; returning the whole row is a superset.
      return { ...settingsStore };
    },
    async update(args: any) {
      Object.assign(settingsStore, args.data);
      return { ...settingsStore };
    },
  },

  category: {
    async findUnique(args: any) {
      if (args.where.id !== CAT_ID) return null;
      if (args.include) return categoryWithFunded();
      return { id: categoryRow.id, userId: categoryRow.userId };
    },
    async findMany(args: any) {
      return args?.where?.userId === OWNER_ID ? [categoryWithFunded()] : [];
    },
  },

  transaction: {
    async findMany(args: any) {
      const where = args?.where ?? {};
      return transactions
        .filter((t) => (where.type ? t.type === where.type : true))
        .filter((t) => (where.categoryId ? t.categoryId === where.categoryId : true))
        .filter((t) =>
          where.category?.userId ? t.categoryId === CAT_ID && categoryRow.userId === where.category.userId : true,
        )
        .map((t) => ({ categoryId: t.categoryId, totalAmount: t.totalAmount, createdAt: t.createdAt }));
    },
    async create(args: any) {
      const row: TxnRow = {
        id: `txn-${++txnSeq}`,
        categoryId: args.data.categoryId ?? null,
        creatorId: args.data.creatorId,
        totalAmount: args.data.totalAmount,
        type: args.data.type,
        createdAt: new Date(),
      };
      transactions.push(row);
      return { ...row };
    },
  },

  ledgerEntry: {
    async create(args: any) {
      const row: LedgerRow = {
        id: `led-${++ledgerSeq}`,
        transactionId: args.data.transactionId,
        userId: args.data.userId,
        amountChange: args.data.amountChange,
        type: args.data.type,
      };
      ledgerEntries.push(row);
      return { ...row };
    },
  },

  savingsUsage: {
    async findMany(args: any) {
      const where = args?.where ?? {};
      return savingsUsages
        .filter((u) => (where.userId ? u.userId === where.userId : true))
        .filter((u) => (where.categoryId ? u.categoryId === where.categoryId : true))
        .map((u) => ({ categoryId: u.categoryId, amount: u.amount, createdAt: u.createdAt }));
    },
    async create(args: any) {
      const row: UsageRow = {
        id: `use-${++usageSeq}`,
        userId: args.data.userId,
        categoryId: args.data.categoryId,
        amount: args.data.amount,
        transactionId: args.data.transactionId,
        createdAt: new Date(),
      };
      savingsUsages.push(row);
      return { ...row };
    },
  },

  fundedDaySchedule: {
    async findUnique() {
      return null; // no stored row → controller defaults to all seven weekdays
    },
  },
  fundedDayOverride: {
    async findMany() {
      return [];
    },
  },
  userGamification: {
    async findUnique() {
      return { timezone: 'Asia/Manila' };
    },
  },
};

// Inject the double in place of `../config/db` BEFORE the controller/router load.
const dbPath = require.resolve('../../config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { prisma: fakePrisma },
} as unknown as NodeModule;

// Now pull in the real router, jwt, bcrypt, and the exported lockout constants.
 
const express = require('express');
 
const jwt = require('jsonwebtoken');
 
const bcrypt = require('bcrypt');
 
const savingsRoutes = require('../../routes/savingsRoutes').default;
 
const { PIN_LOCK_THRESHOLD, PIN_LOCK_COOLDOWN_MS } = require('../../services/savingsService');

const ownerToken = jwt.sign({ id: OWNER_ID }, process.env.JWT_SECRET as string);

// ── Tiny HTTP test harness ────────────────────────────────────────────────────
let baseUrl = '';
let server: import('node:http').Server;

interface Res {
  status: number;
  body: any;
}

async function http(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const resp = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let body: any = null;
  const text = await resp.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: resp.status, body };
}

const USAGE_PATH = `/api/savings/categories/${CAT_ID}/usage`;
const spend = (pin: string, amount = 50) =>
  http('POST', USAGE_PATH, { token: ownerToken, body: { amount, pin } });

/** Reset only the lockout state (keeps pinHash / enablement / accrual intact). */
function resetLockState() {
  settingsStore.failedPinAttempts = 0;
  settingsStore.pinLockedUntil = null;
}

interface WriteCounts {
  transactions: number;
  ledgerEntries: number;
  savingsUsages: number;
}
function snapshotWrites(): WriteCounts {
  return {
    transactions: transactions.length,
    ledgerEntries: ledgerEntries.length,
    savingsUsages: savingsUsages.length,
  };
}
function assertNoRowsCreated(before: WriteCounts, context: string) {
  const after = snapshotWrites();
  assert.strictEqual(after.transactions, before.transactions, `${context}: a Transaction row was created`);
  assert.strictEqual(after.ledgerEntries, before.ledgerEntries, `${context}: a LedgerEntry row was created`);
  assert.strictEqual(after.savingsUsages, before.savingsUsages, `${context}: a SavingsUsage row was created`);
}

let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
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

async function run() {
  // Hash the correct PIN with the same bcrypt approach the controller verifies with.
  settingsStore.pinHash = await bcrypt.hash(CORRECT_PIN, 10);

  const app = express();
  app.use(express.json());
  app.use('/api/savings', savingsRoutes);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  console.log('Savings_API PIN lockout + auto-unlock integration (task 6.14)');
  console.log(`  (PIN_LOCK_THRESHOLD=${PIN_LOCK_THRESHOLD}, PIN_LOCK_COOLDOWN_MS=${PIN_LOCK_COOLDOWN_MS})`);

  // Sanity: the lockout constants are the single source the tests are driven by
  // (Requirement 12.16). We assert only that they are usable, not fixed values —
  // the behavior below is compared against whatever these constants are.
  await test('lockout constants are exported and sane (Req 12.16)', async () => {
    assert.ok(Number.isInteger(PIN_LOCK_THRESHOLD) && PIN_LOCK_THRESHOLD >= 1, 'threshold must be a positive integer');
    assert.ok(Number.isFinite(PIN_LOCK_COOLDOWN_MS) && PIN_LOCK_COOLDOWN_MS > 0, 'cooldown must be a positive duration');
  });

  // ── 12.14: THRESHOLD wrong PINs lock; a correct PIN is then rejected, no rows ─
  await test(
    'PIN_LOCK_THRESHOLD consecutive wrong PINs lock spending; a correct PIN is then rejected with a lock error and creates no rows (Req 12.14, 12.16)',
    async () => {
      resetLockState();

      // The first THRESHOLD-1 wrong attempts are rejected as bad PINs (401) and
      // do NOT lock; the counter climbs by exactly one each time.
      for (let attempt = 1; attempt < PIN_LOCK_THRESHOLD; attempt++) {
        const before = snapshotWrites();
        const r = await spend(WRONG_PIN);
        assert.strictEqual(r.status, 401, `wrong attempt #${attempt} expected 401, got ${r.status}`);
        assert.strictEqual(
          settingsStore.failedPinAttempts,
          attempt,
          `failedPinAttempts should be ${attempt} after wrong attempt #${attempt}`,
        );
        assert.strictEqual(settingsStore.pinLockedUntil, null, `must not be locked before the threshold (attempt #${attempt})`);
        assertNoRowsCreated(before, `wrong attempt #${attempt}`);
      }

      // The THRESHOLD-th wrong attempt trips the lock (423) and stamps
      // pinLockedUntil ≈ now + PIN_LOCK_COOLDOWN_MS (Requirement 12.14, 12.16).
      const beforeLockWrites = snapshotWrites();
      const lockStart = Date.now();
      const locking = await spend(WRONG_PIN);
      const lockEnd = Date.now();

      assert.strictEqual(locking.status, 423, `the threshold attempt should lock (423), got ${locking.status}`);
      assert.strictEqual(settingsStore.failedPinAttempts, PIN_LOCK_THRESHOLD, 'attempts should equal the threshold');
      assert.ok(settingsStore.pinLockedUntil instanceof Date, 'pinLockedUntil should be set at the threshold');
      assertNoRowsCreated(beforeLockWrites, 'threshold-tripping wrong attempt');

      // The lock duration is sourced from PIN_LOCK_COOLDOWN_MS (Requirement 12.16):
      // pinLockedUntil falls within [lockStart, lockEnd] + PIN_LOCK_COOLDOWN_MS.
      const lockedUntilMs = (settingsStore.pinLockedUntil as Date).getTime();
      assert.ok(
        lockedUntilMs >= lockStart + PIN_LOCK_COOLDOWN_MS && lockedUntilMs <= lockEnd + PIN_LOCK_COOLDOWN_MS,
        `lock duration must equal PIN_LOCK_COOLDOWN_MS; pinLockedUntil off by ${lockedUntilMs - (lockStart + PIN_LOCK_COOLDOWN_MS)}ms`,
      );

      // While locked, even a CORRECT PIN is rejected with a lock error and
      // creates no Transaction / LedgerEntry / SavingsUsage (Requirement 12.14).
      const beforeCorrect = snapshotWrites();
      const correctWhileLocked = await spend(CORRECT_PIN);
      assert.strictEqual(correctWhileLocked.status, 423, `correct PIN while locked expected 423, got ${correctWhileLocked.status}`);
      assert.ok(
        typeof correctWhileLocked.body?.error === 'string' && /lock/i.test(correctWhileLocked.body.error),
        'expected a lock error message',
      );
      assertNoRowsCreated(beforeCorrect, 'correct PIN submitted while locked');
      // The valid PIN did not "consume" an attempt or extend the lock.
      assert.strictEqual(settingsStore.failedPinAttempts, PIN_LOCK_THRESHOLD, 'a rejected-by-lock request must not change the counter');
    },
  );

  // ── 12.15: cooldown elapsing clears the lock; a correct PIN then succeeds ─────
  await test(
    'after PIN_LOCK_COOLDOWN elapses the lock clears, failedPinAttempts resets, and a correct PIN succeeds (Req 12.15)',
    async () => {
      // Establish a genuine locked state first.
      settingsStore.failedPinAttempts = PIN_LOCK_THRESHOLD;
      settingsStore.pinLockedUntil = new Date(Date.now() + PIN_LOCK_COOLDOWN_MS);

      // Confirm it is actually locked (control).
      const lockedProbe = await spend(CORRECT_PIN);
      assert.strictEqual(lockedProbe.status, 423, 'precondition: spending should be locked');

      // Model "the clock advanced past PIN_LOCK_COOLDOWN_MS" by moving
      // pinLockedUntil into the past — the exact datum isPinLocked() consults.
      settingsStore.pinLockedUntil = new Date(Date.now() - 1000);

      const before = snapshotWrites();
      const ok = await spend(CORRECT_PIN, 50);
      assert.strictEqual(ok.status, 201, `a correct PIN after cooldown should succeed (201), got ${ok.status}: ${JSON.stringify(ok.body)}`);

      // A Transaction and a SavingsUsage were created for the spend.
      const after = snapshotWrites();
      assert.strictEqual(after.transactions, before.transactions + 1, 'a Transaction row should be created on success');
      assert.strictEqual(after.savingsUsages, before.savingsUsages + 1, 'a SavingsUsage row should be created on success');
      assert.strictEqual(ok.body?.usage?.amount, 50, 'the usage amount should be echoed');

      // The expired lock cleared and the failure counter reset (Requirement 12.15).
      assert.strictEqual(settingsStore.pinLockedUntil, null, 'pinLockedUntil should be cleared after a successful unlock');
      assert.strictEqual(settingsStore.failedPinAttempts, 0, 'failedPinAttempts should reset to 0 after a successful unlock');
    },
  );

  // ── 12.17: read-only endpoints stay available while locked ────────────────────
  await test(
    'while PIN-locked, read-only endpoints (piggybank, timeseries, settings, funded-days) remain available (Req 12.17)',
    async () => {
      // Put the account into a real, active lock.
      settingsStore.failedPinAttempts = PIN_LOCK_THRESHOLD;
      settingsStore.pinLockedUntil = new Date(Date.now() + PIN_LOCK_COOLDOWN_MS);

      // Control: spending is genuinely locked right now.
      const spendProbe = await spend(CORRECT_PIN);
      assert.strictEqual(spendProbe.status, 423, 'precondition: spending is locked');

      const piggybank = await http('GET', '/api/savings/piggybank', { token: ownerToken });
      assert.strictEqual(piggybank.status, 200, `piggybank read should stay available while locked, got ${piggybank.status}`);

      const seriesTotal = await http('GET', '/api/savings/timeseries?view=total', { token: ownerToken });
      assert.strictEqual(seriesTotal.status, 200, `timeseries read should stay available while locked, got ${seriesTotal.status}`);
      assert.strictEqual(seriesTotal.body?.view, 'total', 'timeseries should return the total view');

      const seriesByCat = await http('GET', '/api/savings/timeseries?view=byCategory', { token: ownerToken });
      assert.strictEqual(seriesByCat.status, 200, `by-category timeseries read should stay available while locked, got ${seriesByCat.status}`);

      const settings = await http('GET', '/api/savings/settings', { token: ownerToken });
      assert.strictEqual(settings.status, 200, `settings read should stay available while locked, got ${settings.status}`);
      assert.strictEqual(settings.body?.enabled, true, 'settings should report enabled');
      assert.strictEqual(settings.body?.pinSet, true, 'settings should report a PIN is set');
      assert.ok(!('pinHash' in (settings.body ?? {})), 'settings must never leak the PIN hash');

      const fundedDays = await http('GET', `/api/savings/categories/${CAT_ID}/funded-days`, { token: ownerToken });
      assert.strictEqual(fundedDays.status, 200, `funded-days read should stay available while locked, got ${fundedDays.status}`);
      assert.ok(Array.isArray(fundedDays.body?.schedule?.fundedWeekdays), 'funded-days should return the schedule');

      // The lock was untouched by the reads — spending is still locked.
      assert.ok(settingsStore.pinLockedUntil instanceof Date, 'reads must not clear the lock');
      const stillLocked = await spend(CORRECT_PIN);
      assert.strictEqual(stillLocked.status, 423, 'spending should remain locked after read-only calls');
    },
  );

  // ── Teardown ──────────────────────────────────────────────────────────────────
  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error('\nFailures:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unexpected error running PIN lockout integration tests:', err);
  process.exit(1);
});
