/**
 * Integration tests for the set / change Savings_PIN endpoint
 * (`PUT /api/savings/settings/pin` → `putPin` in `savingsController.ts`,
 * wired in `savingsRoutes.ts`). Task 6.12 of the savings-piggybank spec.
 *
 * These drive the REAL Express router (`savingsRoutes`) — `requireAuth`, the
 * `savingsController.putPin` handler, the pure `validatePinFormat` validator,
 * and the genuine `bcrypt.hash` call — over real HTTP, so the
 * router → middleware → controller → data-layer path is exercised end to end.
 *
 * The only substitution is the Prisma data layer: a faithful in-memory double
 * is injected in place of `../config/db` (via the CommonJS require cache) so the
 * tests run without a live database and never touch shared/production data. The
 * double stores each user's `SavingsSettings` row keyed by `userId` and honors
 * the controller's upsert semantics, so what the test inspects is the value the
 * controller genuinely persisted (not a canned response). `bcrypt` is the real
 * library, so the "non-plaintext hash" and "bcrypt.compare succeeds" assertions
 * validate real one-way hashing.
 *
 * Self-contained assertion script (project convention, no jest/vitest runner):
 *   npx ts-node src/controllers/__tests__/savingsController.pin.integration.test.ts
 * Exits non-zero if any assertion fails.
 *
 * Covers Requirement 12:
 *   - Valid PUT stores a non-plaintext salted hash; bcrypt.compare(raw) succeeds;
 *     response returns no PIN value ............................. Req 12.1, 12.3
 *   - Invalid-format PIN -> 400, stored PIN unchanged ........... Req 12.2
 *   - Non-owner cannot change the owner's stored PIN ........... Req 12.4
 *       Owner-only is enforced structurally: the `SavingsSettings` row is keyed
 *       by the authenticated `userId`, so (a) an unauthenticated requester is
 *       rejected by `requireAuth` before any write (401, owner PIN untouched),
 *       and (b) a *different* authenticated user's write can only ever touch
 *       their own row — the owner's stored PIN is left unchanged. Both facets
 *       are asserted; neither path can reach or mutate another user's PIN.
 */
import assert from 'node:assert';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcrypt';

// ── Test environment ─────────────────────────────────────────────────────────
// A fixed JWT secret so we can mint tokens that `requireAuth` will accept.
process.env.JWT_SECRET = 'integration-test-secret';
// A harmless DATABASE_URL: the in-memory double replaces the real client, so
// this is never used, but we set it defensively in case anything reads it.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://unused:unused@localhost:1/unused';

const OWNER_ID = 'owner-user-id';
const OTHER_ID = 'other-user-id';

// ── In-memory Prisma double ──────────────────────────────────────────────────
// Only the delegate `putPin` actually calls (`savingsSettings.upsert`) is
// implemented with full fidelity; `findUnique` is provided for completeness.
// Each user's settings row is stored keyed by `userId`, mirroring Prisma's
// upsert semantics (create when absent, patch when present).

interface SettingsRow {
  userId: string;
  pinHash: string | null;
  failedPinAttempts: number;
  pinLockedUntil: Date | null;
  enabled: boolean;
  enabledAt: Date | null;
}

function makeFakePrisma() {
  const settings = new Map<string, SettingsRow>();

  const prisma = {
    savingsSettings: {
      async findUnique(args: any) {
        const row = settings.get(args.where.userId);
        return row ? { ...row } : null;
      },
      async upsert(args: any) {
        const userId = args.where.userId;
        const existing = settings.get(userId);
        if (existing) {
          Object.assign(existing, args.update);
          return { ...existing };
        }
        const created: SettingsRow = {
          userId,
          pinHash: null,
          failedPinAttempts: 0,
          pinLockedUntil: null,
          enabled: false,
          enabledAt: null,
          ...args.create,
        };
        settings.set(userId, created);
        return { ...created };
      },
    },
  };

  return { prisma, stores: { settings } };
}

const { prisma: fakePrisma, stores } = makeFakePrisma();

// Inject the double in place of `../config/db` BEFORE the controller/router are
// loaded, so every `import { prisma } from '../config/db'` resolves to it.
const dbPath = require.resolve('../../config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { prisma: fakePrisma },
} as unknown as NodeModule;

// Now pull in the real router + jwt (require, so load ordering is guaranteed).
 
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

const PIN_PATH = '/api/savings/settings/pin';

/** Assert a PIN response body never carries the PIN value or its hash (Req 12.1, 12.3). */
function assertNoPinLeakage(body: any) {
  assert.ok(body && typeof body === 'object', 'expected a JSON body');
  for (const key of ['pin', 'pinHash', 'hash', 'salt']) {
    assert.ok(!(key in body), `response leaked "${key}"`);
  }
  // Guard against any nested value that echoes a raw 6-digit PIN.
  const serialized = JSON.stringify(body);
  assert.ok(!/\b\d{6}\b/.test(serialized), `response appears to echo a raw PIN: ${serialized}`);
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

  console.log('Savings_API integration — set / change Savings_PIN (task 6.12)');

  // ══ Valid set: non-plaintext hash + bcrypt.compare succeeds + no PIN echoed ══
  //    (Req 12.1, 12.3)
  await test('valid PUT stores a non-plaintext salted hash and returns no PIN value (12.1, 12.3)', async () => {
    const rawPin = '482913';
    const res = await http('PUT', PIN_PATH, { token: ownerToken, body: { pin: rawPin } });

    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}`);
    assert.deepStrictEqual(res.body, { pinSet: true }, 'expected a { pinSet: true } confirmation');
    assertNoPinLeakage(res.body);

    // The genuinely persisted row: the stored value must NOT be the plaintext PIN.
    const stored = stores.settings.get(OWNER_ID);
    assert.ok(stored, 'a SavingsSettings row must have been created for the owner');
    assert.ok(typeof stored!.pinHash === 'string' && stored!.pinHash.length > 0, 'a pinHash must be stored');
    assert.notStrictEqual(stored!.pinHash, rawPin, 'the stored value must not be the plaintext PIN');
    assert.ok(!stored!.pinHash!.includes(rawPin), 'the stored hash must not contain the plaintext PIN');

    // A later bcrypt.compare against the RAW pin must succeed (one-way, salted).
    const matches = await bcrypt.compare(rawPin, stored!.pinHash as string);
    assert.strictEqual(matches, true, 'bcrypt.compare(rawPin, storedHash) must succeed');
    // A wrong PIN must NOT verify against the stored hash.
    const wrong = await bcrypt.compare('000000', stored!.pinHash as string);
    assert.strictEqual(wrong, false, 'an incorrect PIN must not verify against the stored hash');

    // Setting a PIN resets the brute-force lockout state.
    assert.strictEqual(stored!.failedPinAttempts, 0, 'failedPinAttempts must be reset to 0');
    assert.strictEqual(stored!.pinLockedUntil, null, 'pinLockedUntil must be cleared');
  });

  await test('changing to a new valid PIN replaces the hash; new PIN verifies, old does not (12.1, 12.3)', async () => {
    const oldPin = '482913'; // set by the previous test
    const newPin = '135790';
    const before = stores.settings.get(OWNER_ID)?.pinHash ?? null;
    assert.ok(before, 'precondition: owner already has a stored PIN hash');

    const res = await http('PUT', PIN_PATH, { token: ownerToken, body: { pin: newPin } });
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}`);
    assertNoPinLeakage(res.body);

    const after = stores.settings.get(OWNER_ID)!.pinHash as string;
    assert.notStrictEqual(after, before, 'the stored hash must change when the PIN changes');
    assert.strictEqual(await bcrypt.compare(newPin, after), true, 'the new PIN must verify');
    assert.strictEqual(await bcrypt.compare(oldPin, after), false, 'the old PIN must no longer verify');
  });

  // ══ Invalid-format PIN -> 400 with the stored PIN unchanged (Req 12.2) ═══════
  const invalidPins: Array<{ label: string; pin: unknown }> = [
    { label: 'too short (5 digits)', pin: '12345' },
    { label: 'too long (7 digits)', pin: '1234567' },
    { label: 'contains a non-digit', pin: '12a456' },
    { label: 'contains whitespace', pin: '12 456' },
    { label: 'empty string', pin: '' },
    { label: 'numeric (not a string)', pin: 123456 },
    { label: 'missing pin field', pin: undefined },
  ];

  for (const { label, pin } of invalidPins) {
    await test(`invalid-format PIN (${label}) -> 400, stored PIN unchanged (12.2)`, async () => {
      const before = stores.settings.get(OWNER_ID)!.pinHash as string;
      const body = pin === undefined ? {} : { pin };
      const res = await http('PUT', PIN_PATH, { token: ownerToken, body });

      assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`);
      assert.ok(
        res.body && typeof res.body.error === 'string' && res.body.error.length > 0,
        'expected a validation error message',
      );
      assertNoPinLeakage(res.body);

      // The previously stored PIN must be untouched (validation runs before any write).
      const after = stores.settings.get(OWNER_ID)!.pinHash as string;
      assert.strictEqual(after, before, 'an invalid-format PIN must leave the stored PIN unchanged');
    });
  }

  // ══ Non-owner cannot change the owner's stored PIN (Req 12.4) ════════════════
  // Owner-only is enforced by keying the SavingsSettings row on the authenticated
  // userId — there is no path by which one user targets another's PIN.
  await test('unauthenticated PUT -> 401, owner PIN unchanged, no row created for it (12.4)', async () => {
    const before = stores.settings.get(OWNER_ID)!.pinHash as string;
    const sizeBefore = stores.settings.size;

    const res = await http('PUT', PIN_PATH, { body: { pin: '246810' } }); // no token
    assert.strictEqual(res.status, 401, `expected 401, got ${res.status}`);
    assert.ok(!('pinSet' in (res.body ?? {})), 'an unauthenticated request must not confirm a PIN set');

    const after = stores.settings.get(OWNER_ID)!.pinHash as string;
    assert.strictEqual(after, before, 'an unauthenticated request must not change the stored PIN');
    assert.strictEqual(stores.settings.size, sizeBefore, 'no settings row may be created for an unauthenticated requester');
  });

  await test("a different authenticated user's PIN write cannot alter the owner's stored PIN (12.4)", async () => {
    const ownerBefore = stores.settings.get(OWNER_ID)!.pinHash as string;

    // A second, distinct user sets THEIR OWN PIN. By construction this can only
    // ever touch OTHER_ID's row, never the owner's.
    const res = await http('PUT', PIN_PATH, { token: otherToken, body: { pin: '778899' } });
    assert.strictEqual(res.status, 200, `the other user's own PIN set should succeed (got ${res.status})`);
    assertNoPinLeakage(res.body);

    // The owner's stored PIN is completely unaffected (owner-only by construction).
    const ownerAfter = stores.settings.get(OWNER_ID)!.pinHash as string;
    assert.strictEqual(ownerAfter, ownerBefore, "the owner's stored PIN must be unchanged by another user's write");
    assert.strictEqual(await bcrypt.compare('135790', ownerAfter), true, "the owner's PIN still verifies");

    // The two users hold independent PIN hashes.
    const otherStored = stores.settings.get(OTHER_ID)!.pinHash as string;
    assert.notStrictEqual(otherStored, ownerAfter, 'each user must hold an independent PIN hash');
    assert.strictEqual(await bcrypt.compare('778899', otherStored), true, "the other user's own PIN verifies");
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
  console.error('Unexpected error running PIN integration tests:', err);
  process.exit(1);
});
