/**
 * Integration tests for the Savings_API config-persistence + authorization
 * wiring (savings-piggybank feature, task 5.5).
 *
 * These drive the REAL Express router (`savingsRoutes`) — `requireAuth`,
 * `savingsController`, the funded-day validators, ownership checks, and the
 * upsert/read-back logic — over real HTTP, so the router → middleware →
 * controller → data-layer path is exercised end to end.
 *
 * The only substitution is the Prisma data layer: a faithful in-memory double
 * is injected in place of `../config/db` (via the CommonJS require cache) so the
 * tests run without a live database and never touch shared/production data.
 * The double honors the `(categoryId, date)` uniqueness of overrides and the
 * "replace the whole set" schedule semantics, so persistence read-backs reflect
 * the controller's genuine behavior rather than canned responses.
 *
 * Self-contained assertion script (project convention, no jest):
 *   npx ts-node src/controllers/__tests__/savingsController.integration.test.ts
 * Exits non-zero if any assertion fails.
 *
 * Covers:
 *   - Schedule replace + read-back .................... Req 1.3, 1.6
 *   - Override upsert keeps one row per (category,date)  Req 2.4
 *   - Override create + read-back .................... Req 2.2
 *   - Non-owner read/write -> 403, no mutation ....... Req 1.7, 2.7
 *   - Unauthenticated -> 401 ......................... Req 5.5, 10.1, 10.2
 *   - Foreign / absent id -> 403 / 404, no leakage ... Req 10.3
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
const CAT_OWNED = 'cat-owned';
const CAT_FOREIGN = 'cat-foreign';
const MISSING_ID = 'cat-does-not-exist';

// ── In-memory Prisma double ──────────────────────────────────────────────────
// Only the methods the savings controller / requireAuth actually call are
// implemented. Behavior mirrors Prisma's semantics for those calls.

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
}
interface ScheduleRow {
  categoryId: string;
  fundedWeekdays: number[];
}
interface OverrideRow {
  categoryId: string;
  date: Date;
  funded: boolean;
}

function makeFakePrisma() {
  const categories: CategoryRow[] = [
    {
      id: CAT_OWNED,
      userId: OWNER_ID,
      name: 'Food',
      limitAmount: 1000,
      period: 'DAILY',
      monthlyStartDay: null,
      weeklyStartDay: null,
      customPeriodDays: null,
      anchorDate: null,
    },
    {
      id: CAT_FOREIGN,
      userId: OTHER_ID,
      name: 'Rent',
      limitAmount: 5000,
      period: 'MONTHLY',
      monthlyStartDay: 1,
      weeklyStartDay: null,
      customPeriodDays: null,
      anchorDate: null,
    },
  ];
  const schedules: ScheduleRow[] = [];
  const overrides: OverrideRow[] = [];
  const gamification: { userId: string; timezone: string | null }[] = [];

  const sameDate = (a: Date, b: Date) => a.getTime() === b.getTime();

  const prisma = {
    category: {
      async findUnique(args: any) {
        const row = categories.find((c) => c.id === args.where.id) ?? null;
        if (!row) return null;
        // Respect `select: { id, userId }`.
        return { id: row.id, userId: row.userId };
      },
      async findMany(args: any) {
        const userId = args?.where?.userId;
        return categories
          .filter((c) => c.userId === userId)
          .map((c) => ({
            ...c,
            fundedDaySchedule: schedules.find((s) => s.categoryId === c.id) ?? null,
            fundedDayOverrides: overrides
              .filter((o) => o.categoryId === c.id)
              .map((o) => ({ date: o.date, funded: o.funded })),
          }));
      },
    },
    fundedDaySchedule: {
      async findUnique(args: any) {
        const s = schedules.find((r) => r.categoryId === args.where.categoryId);
        return s ? { categoryId: s.categoryId, fundedWeekdays: [...s.fundedWeekdays] } : null;
      },
      async upsert(args: any) {
        const categoryId = args.where.categoryId;
        const existing = schedules.find((r) => r.categoryId === categoryId);
        if (existing) {
          // "Replace the entire set" (Req 1.3).
          existing.fundedWeekdays = [...args.update.fundedWeekdays];
          return { categoryId, fundedWeekdays: [...existing.fundedWeekdays] };
        }
        const created: ScheduleRow = {
          categoryId: args.create.categoryId,
          fundedWeekdays: [...args.create.fundedWeekdays],
        };
        schedules.push(created);
        return { categoryId, fundedWeekdays: [...created.fundedWeekdays] };
      },
    },
    fundedDayOverride: {
      async findMany(args: any) {
        let rows = overrides.filter((o) => o.categoryId === args.where.categoryId);
        if (args?.orderBy?.date === 'asc') {
          rows = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
        }
        return rows.map((o) => ({ date: o.date, funded: o.funded }));
      },
      async upsert(args: any) {
        const { categoryId, date } = args.where.categoryId_date;
        const existing = overrides.find(
          (o) => o.categoryId === categoryId && sameDate(o.date, date),
        );
        if (existing) {
          // Exactly one row per (categoryId, date) — replace in place (Req 2.4).
          existing.funded = args.update.funded;
          return { ...existing };
        }
        const created: OverrideRow = {
          categoryId: args.create.categoryId,
          date: args.create.date,
          funded: args.create.funded,
        };
        overrides.push(created);
        return { ...created };
      },
      async deleteMany(args: any) {
        const { categoryId, date } = args.where;
        let count = 0;
        for (let i = overrides.length - 1; i >= 0; i--) {
          if (overrides[i].categoryId === categoryId && sameDate(overrides[i].date, date)) {
            overrides.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
    },
    userGamification: {
      async findUnique(args: any) {
        return gamification.find((g) => g.userId === args.where.userId) ?? null;
      },
    },
    // Present for completeness; the funded-day config endpoints do not read it.
    transaction: {
      async findMany() {
        return [];
      },
    },
  };

  return { prisma, stores: { categories, schedules, overrides } };
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

// Now pull in the real router + jwt (require, so ordering is guaranteed).
 
const express = require('express');
 
const jwt = require('jsonwebtoken');
 
const savingsRoutes = require('../../routes/savingsRoutes').default;

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

/** Assert a response body carries no category config / existence details. */
function assertNoLeakage(body: any) {
  assert.ok(body && typeof body === 'object', 'expected a JSON error body');
  for (const key of ['schedule', 'overrides', 'name', 'limitAmount', 'userId', 'period']) {
    assert.ok(!(key in body), `error body leaked "${key}"`);
  }
  assert.ok(typeof body.error === 'string' && body.error.length > 0, 'expected an error message');
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

  console.log('Savings_API integration — config persistence + authorization');

  // ── Schedule replace + read-back (Req 1.3, 1.6) ─────────────────────────────
  await test('owner replaces schedule then reads it back (Req 1.3, 1.6)', async () => {
    const put = await http('PUT', `/api/savings/categories/${CAT_OWNED}/schedule`, {
      token: ownerToken,
      body: { fundedWeekdays: [5, 1, 3, 2, 4] }, // Mon–Fri, unsorted on input
    });
    assert.strictEqual(put.status, 200, `PUT status ${put.status}`);
    assert.deepStrictEqual(put.body.schedule.fundedWeekdays, [1, 2, 3, 4, 5]);

    const get = await http('GET', `/api/savings/categories/${CAT_OWNED}/funded-days`, {
      token: ownerToken,
    });
    assert.strictEqual(get.status, 200);
    assert.deepStrictEqual(get.body.schedule.fundedWeekdays, [1, 2, 3, 4, 5]);
  });

  await test('a second schedule PUT replaces the entire set, not merges (Req 1.3)', async () => {
    const put = await http('PUT', `/api/savings/categories/${CAT_OWNED}/schedule`, {
      token: ownerToken,
      body: { fundedWeekdays: [0, 6] }, // weekends only
    });
    assert.strictEqual(put.status, 200);
    const get = await http('GET', `/api/savings/categories/${CAT_OWNED}/funded-days`, {
      token: ownerToken,
    });
    assert.deepStrictEqual(get.body.schedule.fundedWeekdays, [0, 6]);
    // Exactly one schedule row is kept for the category.
    assert.strictEqual(stores.schedules.filter((s) => s.categoryId === CAT_OWNED).length, 1);
  });

  // ── Override create + read-back (Req 2.2) ───────────────────────────────────
  await test('owner creates an override then reads it back (Req 2.2)', async () => {
    const put = await http('PUT', `/api/savings/categories/${CAT_OWNED}/overrides`, {
      token: ownerToken,
      body: { date: '2026-12-25', funded: false },
    });
    assert.strictEqual(put.status, 200, `PUT status ${put.status}`);
    assert.deepStrictEqual(put.body, { date: '2026-12-25', funded: false });

    const get = await http('GET', `/api/savings/categories/${CAT_OWNED}/funded-days`, {
      token: ownerToken,
    });
    const match = get.body.overrides.find((o: any) => o.date === '2026-12-25');
    assert.ok(match, 'override 2026-12-25 not read back');
    assert.strictEqual(match.funded, false);
  });

  // ── Override upsert keeps one row per (category, date) (Req 2.4) ─────────────
  await test('re-submitting an override for the same date upserts one row (Req 2.4)', async () => {
    const date = '2026-07-04';
    const first = await http('PUT', `/api/savings/categories/${CAT_OWNED}/overrides`, {
      token: ownerToken,
      body: { date, funded: false },
    });
    assert.strictEqual(first.status, 200);
    const second = await http('PUT', `/api/savings/categories/${CAT_OWNED}/overrides`, {
      token: ownerToken,
      body: { date, funded: true }, // flip the funded state for the same date
    });
    assert.strictEqual(second.status, 200);
    assert.deepStrictEqual(second.body, { date, funded: true });

    // Exactly one persisted row for (category, date), with the latest state.
    const rows = stores.overrides.filter(
      (o) => o.categoryId === CAT_OWNED && o.date.getTime() === new Date(`${date}T00:00:00.000Z`).getTime(),
    );
    assert.strictEqual(rows.length, 1, `expected 1 override row, found ${rows.length}`);
    assert.strictEqual(rows[0].funded, true);

    // And the read-back reflects a single, updated override for that date.
    const get = await http('GET', `/api/savings/categories/${CAT_OWNED}/funded-days`, {
      token: ownerToken,
    });
    const matches = get.body.overrides.filter((o: any) => o.date === date);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].funded, true);
  });

  // ── Non-owner read/write -> 403 with no mutation (Req 1.7, 2.7) ─────────────
  await test('non-owner READ of funded-days -> 403 (Req 1.7)', async () => {
    const res = await http('GET', `/api/savings/categories/${CAT_FOREIGN}/funded-days`, {
      token: ownerToken,
    });
    assert.strictEqual(res.status, 403, `status ${res.status}`);
    assertNoLeakage(res.body);
  });

  await test('non-owner WRITE of schedule -> 403 and no mutation (Req 1.7)', async () => {
    const before = stores.schedules.filter((s) => s.categoryId === CAT_FOREIGN).length;
    const res = await http('PUT', `/api/savings/categories/${CAT_FOREIGN}/schedule`, {
      token: ownerToken,
      body: { fundedWeekdays: [1, 2, 3] },
    });
    assert.strictEqual(res.status, 403, `status ${res.status}`);
    const after = stores.schedules.filter((s) => s.categoryId === CAT_FOREIGN).length;
    assert.strictEqual(after, before, 'foreign schedule was mutated');
    assert.strictEqual(after, 0, 'foreign category should have no schedule row');
  });

  await test('non-owner WRITE of override -> 403 and no mutation (Req 2.7)', async () => {
    const before = stores.overrides.filter((o) => o.categoryId === CAT_FOREIGN).length;
    const res = await http('PUT', `/api/savings/categories/${CAT_FOREIGN}/overrides`, {
      token: ownerToken,
      body: { date: '2026-01-01', funded: false },
    });
    assert.strictEqual(res.status, 403, `status ${res.status}`);
    const after = stores.overrides.filter((o) => o.categoryId === CAT_FOREIGN).length;
    assert.strictEqual(after, before, 'foreign override store was mutated');
    assert.strictEqual(after, 0, 'foreign category should have no override rows');
  });

  // ── Unauthenticated -> 401 (Req 5.5, 10.1, 10.2) ────────────────────────────
  await test('unauthenticated piggybank read -> 401 (Req 5.5, 10.1, 10.2)', async () => {
    const res = await http('GET', '/api/savings/piggybank');
    assert.strictEqual(res.status, 401, `status ${res.status}`);
    assert.ok(res.body && typeof res.body.error === 'string', 'expected an auth error message');
  });

  await test('unauthenticated funded-days read -> 401, no data (Req 10.1, 10.2)', async () => {
    const res = await http('GET', `/api/savings/categories/${CAT_OWNED}/funded-days`);
    assert.strictEqual(res.status, 401, `status ${res.status}`);
    assert.ok(!('schedule' in (res.body ?? {})), 'unauthenticated read leaked schedule data');
  });

  await test('unauthenticated schedule write -> 401 and no mutation (Req 10.2)', async () => {
    const before = JSON.stringify(
      stores.schedules.find((s) => s.categoryId === CAT_OWNED)?.fundedWeekdays ?? null,
    );
    const res = await http('PUT', `/api/savings/categories/${CAT_OWNED}/schedule`, {
      body: { fundedWeekdays: [3] }, // no token
    });
    assert.strictEqual(res.status, 401, `status ${res.status}`);
    const after = JSON.stringify(
      stores.schedules.find((s) => s.categoryId === CAT_OWNED)?.fundedWeekdays ?? null,
    );
    assert.strictEqual(after, before, 'unauthenticated write mutated the schedule');
  });

  await test('malformed/garbage token -> 401 (Req 10.2)', async () => {
    const res = await http('GET', `/api/savings/categories/${CAT_OWNED}/funded-days`, {
      token: 'not-a-real-jwt',
    });
    assert.strictEqual(res.status, 401, `status ${res.status}`);
  });

  // ── Foreign / absent id -> 403 / 404 with no leakage (Req 10.3) ─────────────
  await test('foreign category id -> 403 without leaking details (Req 10.3)', async () => {
    const res = await http('GET', `/api/savings/categories/${CAT_FOREIGN}/funded-days`, {
      token: ownerToken,
    });
    assert.strictEqual(res.status, 403, `status ${res.status}`);
    assertNoLeakage(res.body);
  });

  await test('absent category id -> 404 without leaking details (Req 10.3)', async () => {
    const res = await http('GET', `/api/savings/categories/${MISSING_ID}/funded-days`, {
      token: ownerToken,
    });
    assert.strictEqual(res.status, 404, `status ${res.status}`);
    assertNoLeakage(res.body);
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
  console.error('Unexpected error running integration tests:', err);
  process.exit(1);
});
