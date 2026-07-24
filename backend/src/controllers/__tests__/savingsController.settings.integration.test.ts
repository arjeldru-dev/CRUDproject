/**
 * Integration tests for the Savings_API settings toggle + authorization wiring
 * (savings-piggybank feature, task 6.11).
 *
 * These drive the REAL Express router (`savingsRoutes`) — `requireAuth`,
 * `savingsController.getSettings` / `putSettings`, and the account-wide
 * `SavingsSettings` persistence — over real HTTP, so the router → middleware →
 * controller → data-layer path is exercised end to end.
 *
 * The only substitution is the Prisma data layer: a faithful in-memory double is
 * injected in place of `../config/db` (via the CommonJS require cache) so the
 * tests run without a live database and never touch shared/production data. The
 * double persists one `SavingsSettings` row per `userId` (exactly matching the
 * controller's `findUnique` / `upsert` calls keyed by `userId`) and honors the
 * "enable stamps enabledAt = now; disable retains enabledAt" semantics, so
 * read-backs reflect the controller's genuine behavior rather than canned data.
 * It can also be armed to fail the next `upsert` to simulate a persistence
 * failure without mutating the store (Requirement 9.7).
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/controllers/__tests__/savingsController.settings.integration.test.ts
 * Exits non-zero if any assertion fails.
 *
 * Covers:
 *   - Enable while disabled → enabled=true + enabledAt=now, returns both . Req 9.2
 *   - Enable while enabled is idempotent — enabledAt unchanged ......... Req 9.3
 *   - Disable then re-enable stamps a NEW enabledAt ................... Req 9.6
 *   - Simulated persistence failure leaves BOTH fields unchanged ...... Req 9.7
 *   - Owner-only by construction: acting as another user never reads or
 *     writes a user's Savings_Enabled state (no cross-user mutation) .. Req 9.8
 *   - Unauthenticated read/write → 401, no data, no change ....... Req 10.1, 10.2
 */
import assert from 'node:assert';
import type { AddressInfo } from 'node:net';

// ── Test environment ─────────────────────────────────────────────────────────
// A fixed JWT secret so we can mint tokens that `requireAuth` will accept.
process.env.JWT_SECRET = 'integration-test-secret';
// A harmless DATABASE_URL: the in-memory double replaces the real client, so
// this is never used, but we set it defensively in case anything reads it.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused:unused@localhost:1/unused';

const OWNER_ID = 'owner-user-id';
const OTHER_ID = 'other-user-id';

// ── In-memory Prisma double ──────────────────────────────────────────────────
// Only `savingsSettings.findUnique` / `upsert` and `userGamification.findUnique`
// are implemented — the exact calls the settings endpoints make. Behavior
// mirrors Prisma's semantics for those calls, keyed by `userId`.

interface SettingsRow {
  userId: string;
  enabled: boolean;
  enabledAt: Date | null;
  pinHash: string | null;
  failedPinAttempts: number;
  pinLockedUntil: Date | null;
}

function makeFakePrisma() {
  const settings: SettingsRow[] = [];
  const gamification: { userId: string; timezone: string | null }[] = [];

  // Arm this to make the NEXT `savingsSettings.upsert` throw BEFORE mutating the
  // store, simulating a persistence failure (Requirement 9.7).
  const control = { failNextUpsert: false };

  const findRow = (userId: string) => settings.find((s) => s.userId === userId) ?? null;

  const prisma = {
    savingsSettings: {
      async findUnique(args: any) {
        const row = findRow(args.where.userId);
        return row ? { ...row } : null;
      },
      async upsert(args: any) {
        if (control.failNextUpsert) {
          control.failNextUpsert = false;
          // Throw BEFORE any store mutation: a failed write persists nothing.
          throw new Error('simulated persistence failure');
        }
        const userId = args.where.userId;
        const existing = findRow(userId);
        if (existing) {
          // Apply only the fields present in `update` (Prisma partial update).
          Object.assign(existing, args.update);
          return { ...existing };
        }
        const created: SettingsRow = {
          userId,
          enabled: false,
          enabledAt: null,
          pinHash: null,
          failedPinAttempts: 0,
          pinLockedUntil: null,
          ...args.create,
        };
        settings.push(created);
        return { ...created };
      },
    },
    userGamification: {
      async findUnique(args: any) {
        return gamification.find((g) => g.userId === args.where.userId) ?? null;
      },
    },
  };

  return { prisma, stores: { settings }, control };
}

const { prisma: fakePrisma, stores, control } = makeFakePrisma();

// Inject the double in place of `../config/db` BEFORE the controller/router are
// loaded, so every `import { prisma } from '../config/db'` resolves to it.
const dbPath = require.resolve('../../config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { prisma: fakePrisma },
} as unknown as NodeModule;

// Now pull in the real router + jwt (require, so ordering is guaranteed).
 
const express = require('express');
 
const jwt = require('jsonwebtoken');
 
const savingsRoutes = require('../../routes/savingsRoutes').default;

const ownerToken = jwt.sign({ id: OWNER_ID }, process.env.JWT_SECRET as string);
const otherToken = jwt.sign({ id: OTHER_ID }, process.env.JWT_SECRET as string);

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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
    console.error(`    ${(err as Error).message}`);
  }
}

async function run() {
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

  console.log('Savings_API integration — settings toggle + authorization (task 6.11)');

  // ── Enable while disabled → enabled=true + enabledAt=now, returns both (9.2) ─
  await test('enabling while disabled sets enabled=true + enabledAt=now, returns both (Req 9.2)', async () => {
    const before = Date.now();
    const put = await http('PUT', '/api/savings/settings', {
      token: ownerToken,
      body: { enabled: true },
    });
    const after = Date.now();

    assert.strictEqual(put.status, 200, `PUT status ${put.status}`);
    assert.strictEqual(put.body.enabled, true, 'response must report enabled=true');
    assert.ok(typeof put.body.enabledAt === 'string', 'response must return an enabledAt instant');
    const stampedMs = new Date(put.body.enabledAt).getTime();
    assert.ok(
      stampedMs >= before && stampedMs <= after,
      `enabledAt (${put.body.enabledAt}) must be "now" (within [${before}, ${after}])`,
    );

    // Persisted state matches the response (read-back via GET).
    const get = await http('GET', '/api/savings/settings', { token: ownerToken });
    assert.strictEqual(get.status, 200);
    assert.strictEqual(get.body.enabled, true, 'GET must report enabled=true');
    assert.strictEqual(
      new Date(get.body.enabledAt).getTime(),
      stampedMs,
      'GET enabledAt must match the just-stamped instant',
    );
  });

  // ── Enable while enabled is idempotent — enabledAt unchanged (9.3) ──────────
  await test('enabling while already enabled is idempotent — enabledAt unchanged (Req 9.3)', async () => {
    // Precondition: enabled from the previous test with a known enabledAt.
    const first = await http('GET', '/api/savings/settings', { token: ownerToken });
    assert.strictEqual(first.body.enabled, true, 'precondition: savings enabled');
    const originalEnabledAt = first.body.enabledAt;
    assert.ok(typeof originalEnabledAt === 'string', 'precondition: an enabledAt is set');

    // A measurable delay so a (wrongful) re-stamp would be detectable.
    await sleep(15);

    const put = await http('PUT', '/api/savings/settings', {
      token: ownerToken,
      body: { enabled: true },
    });
    assert.strictEqual(put.status, 200, `PUT status ${put.status}`);
    assert.strictEqual(put.body.enabled, true, 'still enabled');
    assert.strictEqual(
      put.body.enabledAt,
      originalEnabledAt,
      'enabledAt must be unchanged when enabling while already enabled',
    );

    // And the persisted row is likewise unchanged.
    const get = await http('GET', '/api/savings/settings', { token: ownerToken });
    assert.strictEqual(get.body.enabledAt, originalEnabledAt, 'persisted enabledAt must be unchanged');
  });

  // ── Disable then re-enable stamps a NEW enabledAt (9.6) ─────────────────────
  await test('disabling then re-enabling stamps a new enabledAt (Req 9.6)', async () => {
    const before = await http('GET', '/api/savings/settings', { token: ownerToken });
    const priorEnabledAt = before.body.enabledAt;
    assert.ok(typeof priorEnabledAt === 'string', 'precondition: an enabledAt exists');

    // Disable: enabled=false; enabledAt is retained (not cleared).
    const disable = await http('PUT', '/api/savings/settings', {
      token: ownerToken,
      body: { enabled: false },
    });
    assert.strictEqual(disable.status, 200, `disable status ${disable.status}`);
    assert.strictEqual(disable.body.enabled, false, 'response must report enabled=false');
    assert.strictEqual(
      disable.body.enabledAt,
      priorEnabledAt,
      'disabling retains the prior enabledAt (not cleared)',
    );

    // A measurable delay so the re-enable instant is strictly later.
    await sleep(15);

    // Re-enable while disabled: enabledAt must be overwritten with the new instant.
    const reBefore = Date.now();
    const reEnable = await http('PUT', '/api/savings/settings', {
      token: ownerToken,
      body: { enabled: true },
    });
    const reAfter = Date.now();

    assert.strictEqual(reEnable.status, 200, `re-enable status ${reEnable.status}`);
    assert.strictEqual(reEnable.body.enabled, true, 'response must report enabled=true');
    const newEnabledAt = reEnable.body.enabledAt;
    assert.ok(typeof newEnabledAt === 'string', 'a new enabledAt must be returned');
    assert.notStrictEqual(newEnabledAt, priorEnabledAt, 'enabledAt must be a NEW instant on re-enable');
    const newMs = new Date(newEnabledAt).getTime();
    assert.ok(
      newMs > new Date(priorEnabledAt).getTime(),
      'the re-enable enabledAt must be strictly later than the prior one',
    );
    assert.ok(
      newMs >= reBefore && newMs <= reAfter,
      `the new enabledAt (${newEnabledAt}) must be the re-enable "now"`,
    );
  });

  // ── Simulated persistence failure leaves BOTH fields unchanged (9.7) ────────
  await test('a persistence failure leaves enabled + enabledAt unchanged, returns 500 (Req 9.7)', async () => {
    // Snapshot the persisted state before the failing write.
    const beforeRow = stores.settings.find((s) => s.userId === OWNER_ID);
    assert.ok(beforeRow, 'precondition: owner settings row exists');
    const beforeEnabled = beforeRow!.enabled;
    const beforeEnabledAt = beforeRow!.enabledAt ? beforeRow!.enabledAt.getTime() : null;

    // Arm the double to fail the next upsert BEFORE it mutates the store.
    control.failNextUpsert = true;

    // Attempt to DISABLE (a state change) — persistence fails.
    const put = await http('PUT', '/api/savings/settings', {
      token: ownerToken,
      body: { enabled: false },
    });
    assert.strictEqual(put.status, 500, `expected 500 on persistence failure, got ${put.status}`);
    assert.ok(put.body && typeof put.body.error === 'string', 'expected an error message');

    // Both fields must be unchanged in the store.
    const afterRow = stores.settings.find((s) => s.userId === OWNER_ID);
    assert.ok(afterRow, 'owner settings row must still exist');
    assert.strictEqual(afterRow!.enabled, beforeEnabled, 'enabled must be unchanged after a failed write');
    const afterEnabledAt = afterRow!.enabledAt ? afterRow!.enabledAt.getTime() : null;
    assert.strictEqual(afterEnabledAt, beforeEnabledAt, 'enabledAt must be unchanged after a failed write');

    // The failure flag is consumed exactly once; the endpoint works again after.
    assert.strictEqual(control.failNextUpsert, false, 'the fail flag must be consumed by the failed upsert');
  });

  // ── Owner-only by construction: no cross-user read/write (9.8) ──────────────
  // The SavingsSettings row is keyed by the authenticated `userId`, so a request
  // can only ever address the caller's OWN settings — there is no route by which
  // a non-owner can target another user's Savings_Enabled state. These cases
  // prove that guarantee: acting as OTHER_ID neither reveals nor mutates
  // OWNER_ID's enabled state / enabledAt (Requirement 9.8).
  await test('another user reads only their own settings, never the owner\u2019s state (Req 9.8)', async () => {
    // Ensure the owner is in a known ENABLED state with an enabledAt.
    const enableOwner = await http('PUT', '/api/savings/settings', {
      token: ownerToken,
      body: { enabled: true },
    });
    assert.strictEqual(enableOwner.body.enabled, true, 'precondition: owner enabled');
    const ownerEnabledAt = enableOwner.body.enabledAt;

    // A different authenticated user reads settings: they see THEIR OWN default
    // (disabled, no enabledAt), never the owner's enabled state.
    const otherGet = await http('GET', '/api/savings/settings', { token: otherToken });
    assert.strictEqual(otherGet.status, 200, `status ${otherGet.status}`);
    assert.strictEqual(otherGet.body.enabled, false, 'a non-owner must not see the owner\u2019s enabled state');
    assert.strictEqual(otherGet.body.enabledAt, null, 'a non-owner must not see the owner\u2019s enabledAt');

    // The owner's persisted state is untouched by the other user's read.
    const ownerRow = stores.settings.find((s) => s.userId === OWNER_ID);
    assert.ok(ownerRow && ownerRow.enabled === true, 'owner state remains enabled');
    assert.strictEqual(
      ownerRow!.enabledAt ? new Date(ownerRow!.enabledAt).toISOString() : null,
      ownerEnabledAt,
      'owner enabledAt remains unchanged after a non-owner read',
    );
  });

  await test('another user\u2019s write mutates only their own row, not the owner\u2019s (Req 9.8)', async () => {
    const ownerBefore = stores.settings.find((s) => s.userId === OWNER_ID);
    assert.ok(ownerBefore, 'precondition: owner row exists');
    const ownerEnabledBefore = ownerBefore!.enabled;
    const ownerEnabledAtBefore = ownerBefore!.enabledAt ? ownerBefore!.enabledAt.getTime() : null;

    // The other user enables their OWN savings.
    const otherPut = await http('PUT', '/api/savings/settings', {
      token: otherToken,
      body: { enabled: true },
    });
    assert.strictEqual(otherPut.status, 200, `status ${otherPut.status}`);
    assert.strictEqual(otherPut.body.enabled, true, 'other user\u2019s own settings become enabled');

    // The owner's row is completely unaffected by the other user's write.
    const ownerAfter = stores.settings.find((s) => s.userId === OWNER_ID);
    assert.strictEqual(ownerAfter!.enabled, ownerEnabledBefore, 'owner enabled must be unchanged');
    const ownerEnabledAtAfter = ownerAfter!.enabledAt ? ownerAfter!.enabledAt.getTime() : null;
    assert.strictEqual(ownerEnabledAtAfter, ownerEnabledAtBefore, 'owner enabledAt must be unchanged');

    // Two distinct rows exist — the users' settings are fully isolated.
    assert.strictEqual(
      stores.settings.filter((s) => s.userId === OWNER_ID).length,
      1,
      'exactly one owner row',
    );
    assert.strictEqual(
      stores.settings.filter((s) => s.userId === OTHER_ID).length,
      1,
      'exactly one other-user row',
    );
  });

  // ── Unauthenticated read/write → 401, no data, no change (10.1, 10.2) ───────
  await test('unauthenticated settings READ → 401, no data (Req 10.1, 10.2)', async () => {
    const res = await http('GET', '/api/savings/settings');
    assert.strictEqual(res.status, 401, `status ${res.status}`);
    assert.ok(res.body && typeof res.body.error === 'string', 'expected an auth error message');
    assert.ok(!('enabled' in (res.body ?? {})), 'unauthenticated read leaked settings data');
    assert.ok(!('enabledAt' in (res.body ?? {})), 'unauthenticated read leaked enabledAt');
  });

  await test('unauthenticated settings WRITE → 401 and no change (Req 10.2)', async () => {
    const ownerBefore = stores.settings.find((s) => s.userId === OWNER_ID);
    const snapshot = JSON.stringify({
      enabled: ownerBefore?.enabled ?? null,
      enabledAt: ownerBefore?.enabledAt ? ownerBefore.enabledAt.getTime() : null,
    });

    const res = await http('PUT', '/api/savings/settings', { body: { enabled: false } });
    assert.strictEqual(res.status, 401, `status ${res.status}`);

    const ownerAfter = stores.settings.find((s) => s.userId === OWNER_ID);
    const after = JSON.stringify({
      enabled: ownerAfter?.enabled ?? null,
      enabledAt: ownerAfter?.enabledAt ? ownerAfter.enabledAt.getTime() : null,
    });
    assert.strictEqual(after, snapshot, 'unauthenticated write must not change any settings');
  });

  await test('malformed/garbage token on settings → 401 (Req 10.2)', async () => {
    const res = await http('GET', '/api/savings/settings', { token: 'not-a-real-jwt' });
    assert.strictEqual(res.status, 401, `status ${res.status}`);
  });

  // ── Teardown ────────────────────────────────────────────────────────────────
  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error('\nFailures:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unexpected error running settings integration tests:', err);
  process.exit(1);
});
