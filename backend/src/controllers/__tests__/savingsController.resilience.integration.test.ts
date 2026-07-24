/**
 * Resilience & read-only integration tests for the Savings_API
 * (controller `savingsController.ts` + router `savingsRoutes.ts`, mounted at
 * `/api/savings`). Task 5.6 of the savings-piggybank spec.
 *
 * Coverage (requirements in parentheses):
 *   A. Savings read performs NO writes                              (7.1, 12.3, 12.4)
 *   B. Invalid category excluded, others returned, no 500           (10.6)
 *   C. Failing single-period skipped with `incomplete`              (9.5)
 *   D. Savings write / withdrawal → 404 / 405                       (12.1, 12.2, 12.5)
 *   E. Malformed read inputs → 400                                  (7.6)
 *   F. rangeStart > rangeEnd → 400                                  (6.8)
 *   G. Backfill within 5 seconds                                    (9.6)
 *
 * Conventions (matching the rest of the backend test suite):
 *   - Self-contained `ts-node` assertion script (no jest/vitest runner):
 *       npx ts-node src/controllers/__tests__/savingsController.resilience.integration.test.ts
 *     Exits non-zero if any assertion fails.
 *   - Controller cases run DB-free by monkeypatching the exported `prisma`
 *     singleton with recording in-memory fakes (a "mocked Prisma client", as the
 *     design's Testing Strategy sanctions). Read methods return canned data;
 *     ANY write method call is recorded and throws, so the read-only guarantee
 *     is enforced structurally.
 *   - Route cases (405/404) run against a real Express app that mounts the
 *     actual `savingsRoutes`, exercised over an ephemeral loopback HTTP server
 *     with a genuine signed JWT (no supertest dependency needed).
 *   - Requirements 10.6 (exclude) and 9.5 (single-period skip) are also asserted
 *     directly against `computePiggybank` / `computeCategorySavings` — the exact
 *     pure functions the controller delegates to — because those degrade-not-fail
 *     paths are internal to the compute layer the endpoint calls.
 */
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';

// Pull in the global `Express.Request.user` augmentation so the controllers
// type-check when compiled standalone by ts-node.
import '../../middleware/requireAuth';
import { prisma } from '../../config/db';
import { getPiggybank, getTimeSeries } from '../savingsController';
import savingsRoutes from '../../routes/savingsRoutes';
import {
  computePiggybank,
  computeCategorySavings,
  CategoryInput,
  ExpenseInput,
} from '../../services/savingsService';

// ── Tiny assertion harness ───────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).stack ?? (err as Error).message}`);
  }
}

// ── Recording Prisma mock ────────────────────────────────────────────────────

const READ_METHODS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const WRITE_METHODS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'executeRaw',
  'executeRawUnsafe',
]);

interface Recorder {
  calls: string[];
  writes: string[];
}

let recorder: Recorder = { calls: [], writes: [] };

/** Build a recording proxy for one Prisma model delegate. */
function modelProxy(name: string, readers: Record<string, (...args: any[]) => any>) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        recorder.calls.push(`${name}.${prop}`);

        if (READ_METHODS.has(prop)) {
          const reader = readers[prop];
          return async (...args: any[]) =>
            typeof reader === 'function' ? reader(...args) : (reader ?? null);
        }

        if (WRITE_METHODS.has(prop)) {
          // Any write during a savings read is a violation (Req 7.1, 12.3, 12.4).
          return async (..._args: any[]) => {
            recorder.writes.push(`${name}.${prop}`);
            throw new Error(`Unexpected savings-read write: ${name}.${prop}`);
          };
        }

        // Unknown member access (e.g. Symbol-ish) — return undefined.
        return undefined;
      },
    },
  );
}

interface MockData {
  timezone?: string | null;
  categories?: any[];
  transactions?: any[];
  usages?: any[];
  /**
   * The `SavingsSettings` row returned by `savingsSettings.findUnique`. Defaults
   * to an enabled, no-lower-bound row so the read path computes accrual as these
   * resilience cases expect. Pass `null` to exercise the disabled short-circuit.
   */
  settings?: { enabled: boolean; enabledAt: Date | null } | null;
}

/** Install recording read-only fakes for the delegates the read path uses. */
function installPrismaMock(data: MockData) {
  recorder = { calls: [], writes: [] };
  (prisma as any).userGamification = modelProxy('userGamification', {
    findUnique: () => (data.timezone === undefined ? null : { timezone: data.timezone }),
  });
  (prisma as any).category = modelProxy('category', {
    findMany: () => data.categories ?? [],
  });
  (prisma as any).transaction = modelProxy('transaction', {
    findMany: () => data.transactions ?? [],
  });
  (prisma as any).savingsSettings = modelProxy('savingsSettings', {
    // `undefined` (unspecified) → default enabled; explicit `null` → disabled.
    findUnique: () => (data.settings === undefined ? { enabled: true, enabledAt: null } : data.settings),
  });
  (prisma as any).savingsUsage = modelProxy('savingsUsage', {
    findMany: () => data.usages ?? [],
  });
}

// ── Express req/res doubles for controller-level cases ───────────────────────

function mockReqRes(opts: {
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  params?: Record<string, unknown>;
}) {
  const req = {
    body: {},
    query: opts.query ?? {},
    params: opts.params ?? {},
    headers: opts.headers ?? {},
    user: { id: 'test-user-id' },
  } as unknown as import('express').Request;

  const captured: { status: number; body: unknown } = { status: 0, body: undefined };
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

// ── Fixture builders ─────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function catInput(overrides: Partial<CategoryInput> & Pick<CategoryInput, 'id' | 'name'>): CategoryInput {
  return {
    limitAmount: 1000,
    period: 'MONTHLY',
    monthlyStartDay: 1,
    weeklyStartDay: null,
    customPeriodDays: null,
    anchorDate: null,
    schedule: [0, 1, 2, 3, 4, 5, 6],
    overrides: new Map<string, boolean>(),
    ...overrides,
  };
}

/** A Prisma-shaped category row (as `loadUserSavingsData` expects). */
function catRow(row: {
  id: string;
  name: string;
  limitAmount?: number;
  period?: string;
  monthlyStartDay?: number | null;
  weeklyStartDay?: number | null;
  customPeriodDays?: number | null;
  anchorDate?: Date | null;
}) {
  return {
    id: row.id,
    name: row.name,
    limitAmount: row.limitAmount ?? 1000,
    period: row.period ?? 'MONTHLY',
    monthlyStartDay: row.monthlyStartDay ?? 1,
    weeklyStartDay: row.weeklyStartDay ?? null,
    customPeriodDays: row.customPeriodDays ?? null,
    anchorDate: row.anchorDate ?? null,
    fundedDaySchedule: null,
    fundedDayOverrides: [] as { date: Date; funded: boolean }[],
  };
}

function txnRow(categoryId: string, amount: number, daysAgo: number) {
  return {
    categoryId,
    totalAmount: amount,
    createdAt: new Date(Date.now() - daysAgo * MS_PER_DAY),
  };
}

// ── Route test harness (real Express + ephemeral HTTP server) ────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_development_secret';
const AUTH_TOKEN = jwt.sign({ id: 'test-user-id' }, JWT_SECRET);

function startServer(): Promise<{ server: http.Server; port: number }> {
  const app = express();
  app.use(express.json());
  app.use('/api/savings', savingsRoutes);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

function request(
  port: number,
  method: string,
  path: string,
  token?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

// ── Test suite ───────────────────────────────────────────────────────────────

async function run() {
  console.log('Savings_API resilience & read-only integration tests (task 5.6)');

  // ══ A. Savings read performs NO writes (Req 7.1, 12.3, 12.4) ═══════════════
  await test('GET /piggybank computes from reads only — no writes attempted (7.1, 12.3, 12.4)', async () => {
    installPrismaMock({
      timezone: 'Asia/Manila',
      categories: [catRow({ id: 'c1', name: 'Food' }), catRow({ id: 'c2', name: 'Transport' })],
      transactions: [txnRow('c1', 120, 40), txnRow('c2', 50, 45)],
    });
    const { req, res, captured } = mockReqRes({ headers: { 'x-timezone': 'Asia/Manila' } });
    await getPiggybank(req, res);

    assert.strictEqual(captured.status, 200, `expected 200, got ${captured.status}`);
    assert.strictEqual(recorder.writes.length, 0, `writes attempted: ${recorder.writes.join(', ')}`);
    // Only read methods on the delegates were ever invoked.
    for (const call of recorder.calls) {
      const method = call.split('.')[1];
      assert.ok(
        READ_METHODS.has(method),
        `non-read delegate method invoked during read: ${call}`,
      );
    }
    // Transaction records were read but never mutated (Req 12.4).
    assert.ok(recorder.calls.includes('transaction.findMany'), 'expected expenses to be read');
    assert.ok(
      !recorder.calls.some((c) => /^transaction\.(create|update|upsert|delete)/.test(c)),
      'a Transaction write was attempted during a savings read',
    );
  });

  await test('GET /timeseries computes from reads only — no writes attempted (7.1, 12.3, 12.4)', async () => {
    installPrismaMock({
      timezone: 'Asia/Manila',
      categories: [catRow({ id: 'c1', name: 'Food' })],
      transactions: [txnRow('c1', 100, 40), txnRow('c1', 60, 75)],
    });
    const { req, res, captured } = mockReqRes({});
    await getTimeSeries(req, res);

    assert.strictEqual(captured.status, 200, `expected 200, got ${captured.status}`);
    assert.strictEqual(recorder.writes.length, 0, `writes attempted: ${recorder.writes.join(', ')}`);
    assert.ok(Array.isArray((captured.body as any).points), 'expected a points array');
  });

  // ══ B. Invalid category excluded, others returned, no 500 (Req 10.6) ═══════
  await test('computePiggybank excludes a category whose data throws, returns the rest (10.6)', () => {
    const now = new Date();
    const tz = 'Asia/Manila';
    const good1 = catInput({ id: 'g1', name: 'Alpha' });
    const good2 = catInput({ id: 'g2', name: 'Beta' });
    const bad = catInput({ id: 'bad', name: 'Corrupt' });

    const expenses = new Map<string, ExpenseInput[]>();
    expenses.set('g1', [{ categoryId: 'g1', amount: 100, createdAt: new Date(now.getTime() - 40 * MS_PER_DAY) }]);
    expenses.set('g2', [{ categoryId: 'g2', amount: 80, createdAt: new Date(now.getTime() - 50 * MS_PER_DAY) }]);
    // Corrupt per-category data: a non-array value makes compute throw for THIS
    // category only, so computePiggybank must exclude it and keep aggregating.
    expenses.set('bad', 42 as unknown as ExpenseInput[]);

    let result: ReturnType<typeof computePiggybank>;
    assert.doesNotThrow(() => {
      result = computePiggybank([good1, bad, good2], expenses, new Map(), { enabled: true, enabledAt: null }, now, tz);
    }, 'aggregation must not throw when one category is corrupt (no 500)');

    result = computePiggybank([good1, bad, good2], expenses, new Map(), { enabled: true, enabledAt: null }, now, tz);
    const names = result.categories.map((c) => c.categoryName);
    assert.ok(names.includes('Alpha') && names.includes('Beta'), 'valid categories must be returned');
    assert.ok(!names.includes('Corrupt'), 'the corrupt category must be excluded');
    assert.strictEqual(result.incomplete, true, 'aggregate must be flagged incomplete');
  });

  await test('GET /piggybank returns 200 (not 500) and other categories when one is degenerate (10.6)', async () => {
    // A CUSTOM category whose anchorDate is in the far future is degenerate: no
    // closed period can be enumerated, so it degrades to incomplete rather than
    // failing the whole request. Valid categories must still be returned.
    const futureAnchor = new Date(Date.UTC(2999, 0, 1));
    installPrismaMock({
      timezone: 'Asia/Manila',
      categories: [
        catRow({ id: 'c1', name: 'Food' }),
        catRow({ id: 'c2', name: 'Transport' }),
        catRow({ id: 'weird', name: 'Weird', period: 'CUSTOM', customPeriodDays: 7, anchorDate: futureAnchor }),
      ],
      transactions: [txnRow('c1', 120, 40), txnRow('c2', 50, 45), txnRow('weird', 10, 30)],
    });
    const { req, res, captured } = mockReqRes({});
    await getPiggybank(req, res);

    assert.strictEqual(captured.status, 200, `expected 200, got ${captured.status}`);
    const body = captured.body as { categories: Array<{ categoryName: string }>; incomplete: boolean };
    const names = body.categories.map((c) => c.categoryName);
    assert.ok(names.includes('Food') && names.includes('Transport'), 'valid categories returned');
    assert.strictEqual(body.incomplete, true, 'response should flag incomplete');
  });

  // ══ C. Failing single-period skipped with `incomplete` (Req 9.5) ═══════════
  await test('computeCategorySavings skips un-computable periods and sets incomplete (9.5)', () => {
    const now = new Date();
    const tz = 'Asia/Manila';
    // Far-future CUSTOM anchor: the backward period walk cannot step past the
    // anchor, so periods are skipped and `incomplete` is set — without throwing.
    const cat = catInput({
      id: 'x',
      name: 'FutureAnchor',
      period: 'CUSTOM',
      customPeriodDays: 7,
      anchorDate: new Date(Date.UTC(2999, 0, 1)),
    });
    const expenses: ExpenseInput[] = [
      { categoryId: 'x', amount: 25, createdAt: new Date(now.getTime() - 30 * MS_PER_DAY) },
    ];

    let result: ReturnType<typeof computeCategorySavings>;
    assert.doesNotThrow(() => {
      result = computeCategorySavings(cat, expenses, [], { enabled: true, enabledAt: null }, now, tz);
    }, 'a failing period must be skipped, not thrown');
    result = computeCategorySavings(cat, expenses, [], { enabled: true, enabledAt: null }, now, tz);
    assert.strictEqual(result.incomplete, true, 'incomplete must be set when a period is skipped');
    assert.ok(Number.isFinite(result.savingsBalance), 'balance must remain a finite number');
  });

  await test('a skipped-period category keeps other categories\u2019 savings, aggregate incomplete (9.5)', () => {
    const now = new Date();
    const tz = 'Asia/Manila';
    const healthy = catInput({ id: 'h', name: 'Healthy', period: 'MONTHLY', limitAmount: 1000 });
    const skipping = catInput({
      id: 's',
      name: 'Skipping',
      period: 'CUSTOM',
      customPeriodDays: 7,
      anchorDate: new Date(Date.UTC(2999, 0, 1)),
    });
    const expenses = new Map<string, ExpenseInput[]>();
    expenses.set('h', [{ categoryId: 'h', amount: 100, createdAt: new Date(now.getTime() - 45 * MS_PER_DAY) }]);
    expenses.set('s', [{ categoryId: 's', amount: 20, createdAt: new Date(now.getTime() - 30 * MS_PER_DAY) }]);

    const result = computePiggybank([healthy, skipping], expenses, new Map(), { enabled: true, enabledAt: null }, now, tz);
    const healthyRow = result.categories.find((c) => c.categoryName === 'Healthy');
    assert.ok(healthyRow, 'healthy category must still be present');
    assert.ok(healthyRow!.savingsBalance > 0, 'healthy category retains its computed savings');
    assert.strictEqual(result.incomplete, true, 'aggregate must be flagged incomplete');
  });

  // ══ D. Savings write / withdrawal → 404 / 405 (Req 12.1, 12.2, 12.5) ═══════
  const { server, port } = await startServer();
  try {
    await test('POST /api/savings/piggybank → 405 (savings values are read-only) (12.2)', async () => {
      const r = await request(port, 'POST', '/api/savings/piggybank', AUTH_TOKEN);
      assert.strictEqual(r.status, 405, `expected 405, got ${r.status}`);
    });
    await test('PUT /api/savings/piggybank → 405 (12.2)', async () => {
      const r = await request(port, 'PUT', '/api/savings/piggybank', AUTH_TOKEN);
      assert.strictEqual(r.status, 405, `expected 405, got ${r.status}`);
    });
    await test('DELETE /api/savings/timeseries → 405 (12.2)', async () => {
      const r = await request(port, 'DELETE', '/api/savings/timeseries', AUTH_TOKEN);
      assert.strictEqual(r.status, 405, `expected 405, got ${r.status}`);
    });
    await test('POST /api/savings/withdraw → 405 (withdrawals not supported) (12.5)', async () => {
      const r = await request(port, 'POST', '/api/savings/withdraw', AUTH_TOKEN);
      assert.strictEqual(r.status, 405, `expected 405, got ${r.status}`);
    });
    await test('GET /api/savings/withdrawals → 405 (withdrawals not supported) (12.1, 12.5)', async () => {
      const r = await request(port, 'GET', '/api/savings/withdrawals', AUTH_TOKEN);
      assert.strictEqual(r.status, 405, `expected 405, got ${r.status}`);
    });
    await test('POST to an unknown savings write path → 404 (12.2)', async () => {
      const r = await request(port, 'POST', '/api/savings/balance/adjust', AUTH_TOKEN);
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}`);
    });
    await test('unauthenticated savings write → 401 (auth enforced before anything) (12.2)', async () => {
      const r = await request(port, 'POST', '/api/savings/piggybank');
      assert.strictEqual(r.status, 401, `expected 401, got ${r.status}`);
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // ══ E. Malformed read inputs → 400 (Req 7.6) ═══════════════════════════════
  await test('GET /timeseries with a non-date rangeStart → 400 (7.6)', async () => {
    installPrismaMock({ timezone: 'UTC', categories: [], transactions: [] });
    const { req, res, captured } = mockReqRes({ query: { rangeStart: 'not-a-date' } });
    await getTimeSeries(req, res);
    assert.strictEqual(captured.status, 400, `expected 400, got ${captured.status}`);
    assert.strictEqual(recorder.writes.length, 0, 'malformed input must not write');
  });

  await test('GET /timeseries with a non-integer limit → 400 (7.6)', async () => {
    installPrismaMock({ timezone: 'UTC', categories: [], transactions: [] });
    const { req, res, captured } = mockReqRes({ query: { limit: '1.5' } });
    await getTimeSeries(req, res);
    assert.strictEqual(captured.status, 400, `expected 400, got ${captured.status}`);
  });

  await test('GET /timeseries with a negative limit → 400 (7.6)', async () => {
    installPrismaMock({ timezone: 'UTC', categories: [], transactions: [] });
    const { req, res, captured } = mockReqRes({ query: { limit: '-3' } });
    await getTimeSeries(req, res);
    assert.strictEqual(captured.status, 400, `expected 400, got ${captured.status}`);
  });

  await test('GET /timeseries with a non-date rangeEnd → 400 (7.6)', async () => {
    installPrismaMock({ timezone: 'UTC', categories: [], transactions: [] });
    const { req, res, captured } = mockReqRes({ query: { rangeEnd: 'garbage' } });
    await getTimeSeries(req, res);
    assert.strictEqual(captured.status, 400, `expected 400, got ${captured.status}`);
  });

  // ══ F. rangeStart > rangeEnd → 400 (Req 6.8) ═══════════════════════════════
  await test('GET /timeseries with rangeStart later than rangeEnd → 400, no points (6.8)', async () => {
    installPrismaMock({ timezone: 'UTC', categories: [], transactions: [] });
    const { req, res, captured } = mockReqRes({
      query: { rangeStart: '2026-06-30T00:00:00.000Z', rangeEnd: '2026-01-01T00:00:00.000Z' },
    });
    await getTimeSeries(req, res);
    assert.strictEqual(captured.status, 400, `expected 400, got ${captured.status}`);
    const msg = (captured.body as { error?: string })?.error;
    assert.ok(typeof msg === 'string' && msg.length > 0, 'expected an invalid-range error message');
    assert.strictEqual(recorder.writes.length, 0, 'an invalid range must not write');
  });

  // ══ G. Backfill within 5 seconds (Req 9.6) ═════════════════════════════════
  await test('backfilling a long DAILY history computes within 5 seconds (9.6)', () => {
    const now = new Date();
    const tz = 'Asia/Manila';
    // ~3 years of DAILY periods → ~1095 closed periods to enumerate & accrue.
    const earliest = new Date(now.getTime() - 3 * 365 * MS_PER_DAY);
    const cat = catInput({ id: 'perf', name: 'Perf', period: 'DAILY', limitAmount: 500 });

    // A spread of expenses across the history.
    const expenses: ExpenseInput[] = [];
    for (let i = 0; i < 500; i++) {
      expenses.push({
        categoryId: 'perf',
        amount: 10 + (i % 5),
        createdAt: new Date(earliest.getTime() + i * 2 * MS_PER_DAY),
      });
    }

    const started = Date.now();
    const result = computeCategorySavings(cat, expenses, [], { enabled: true, enabledAt: null }, now, tz);
    const elapsed = Date.now() - started;

    assert.ok(result.periods.length > 300, `expected a substantial backfill, got ${result.periods.length} periods`);
    assert.ok(elapsed < 5000, `backfill took ${elapsed}ms, expected < 5000ms`);
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
  console.error('Unexpected error running resilience integration tests:', err);
  process.exit(1);
});
