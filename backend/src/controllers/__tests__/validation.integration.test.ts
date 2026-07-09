/**
 * DB-free integration test for the controller → validation-service → HTTP-400
 * wiring. Every case here is rejected by the validators *before* any Prisma call
 * runs, so no database connection is needed or made.
 *
 *   npx ts-node src/controllers/__tests__/validation.integration.test.ts
 */
import assert from 'node:assert';
import type { Request, Response } from 'express';
// Pulls in the global `Express.Request.user` augmentation (declared there) so
// the controllers type-check when compiled standalone by ts-node.
import '../../middleware/requireAuth';
import { Prisma } from '@prisma/client';
import { createCategory, updateCategory, isUniqueNameViolation } from '../categoryController';
import {
  createExpenseTransaction,
  createSettlement,
  createTopUp,
} from '../transactionController';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => Promise<void>) {
  return fn().then(
    () => { passed++; console.log(`  ✓ ${name}`); },
    (err) => { failures.push(`${name}: ${(err as Error).message}`); console.error(`  ✗ ${name}`); },
  );
}

/** Minimal Express req/res doubles that capture the status code + JSON body. */
function mockReqRes(body: Record<string, unknown>, query: Record<string, unknown> = {}) {
  const req = { body, query, params: {}, user: { id: 'test-user-id' } } as unknown as Request;
  const captured: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    status(code: number) { captured.status = code; return this; },
    json(payload: unknown) { captured.body = payload; return this; },
  } as unknown as Response;
  return { req, res, captured };
}

async function expect400(
  handler: (req: Request, res: Response) => Promise<unknown>,
  body: Record<string, unknown>,
) {
  const { req, res, captured } = mockReqRes(body);
  await handler(req, res);
  assert.strictEqual(captured.status, 400, `expected 400, got ${captured.status}`);
  const msg = (captured.body as { error?: string })?.error;
  assert.ok(typeof msg === 'string' && msg.length > 0, 'expected a non-empty error message');
}

async function run() {
  console.log('controller validation → HTTP 400 wiring (no DB)');

  // ── createCategory ────────────────────────────────────────────────────
  await test('createCategory: NaN limit → 400 (previously bypassed → Prisma 500)', () =>
    expect400(createCategory, { name: 'Food', limitAmount: Number.NaN }));

  await test('createCategory: over-Decimal(10,2) limit → 400 (previously → 500 overflow)', () =>
    expect400(createCategory, { name: 'Food', limitAmount: 999_999_999 }));

  await test('createCategory: whitespace-only name → 400', () =>
    expect400(createCategory, { name: '   ', limitAmount: 100 }));

  await test('createCategory: non-string name → 400', () =>
    expect400(createCategory, { name: 42, limitAmount: 100 }));

  await test('updateCategory: empty-string name → 400', () =>
    expect400(updateCategory, { name: '', limitAmount: 100 }));

  // ── createExpenseTransaction ──────────────────────────────────────────
  await test('createExpense: NaN amount → 400 (previously bypassed → 500)', () =>
    expect400(createExpenseTransaction, {
      amount: Number.NaN, categoryId: 'c1', payerId: 'self',
      splits: [{ profileId: 'self', amount: Number.NaN }],
    }));

  await test('createExpense: over-limit amount → 400 (previously → 500 overflow)', () =>
    expect400(createExpenseTransaction, {
      amount: 100_000_000, categoryId: 'c1', payerId: 'self',
      splits: [{ profileId: 'self', amount: 100_000_000 }],
    }));

  await test('createExpense: negative split amount → 400', () =>
    expect400(createExpenseTransaction, {
      amount: 100, categoryId: 'c1', payerId: 'self',
      splits: [{ profileId: 'self', amount: -10 }, { profileId: 'f1', amount: 110 }],
    }));

  await test('createExpense: splits do not sum to total → 400', () =>
    expect400(createExpenseTransaction, {
      amount: 100, categoryId: 'c1', payerId: 'self',
      splits: [{ profileId: 'self', amount: 40 }, { profileId: 'f1', amount: 40 }],
    }));

  // ── createSettlement ──────────────────────────────────────────────────
  await test('createSettlement: Infinity amount → 400', () =>
    expect400(createSettlement, {
      amount: Number.POSITIVE_INFINITY, friendProfileId: 'f1', payerId: 'self', categoryId: 'c1',
    }));

  // ── createTopUp ───────────────────────────────────────────────────────
  await test('createTopUp: >2 decimal amount → 400', () =>
    expect400(createTopUp, { amount: 10.001, categoryId: 'c1' }));

  // ── isUniqueNameViolation (P2002 → 409 mapping) ───────────────────────
  // Verified against the live DB that a duplicate (user_id, name) insert raises
  // P2002; these assert the predicate the 409 handler branches on.
  await test('isUniqueNameViolation: true for a P2002 known-request error', async () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`user_id`, `name`)',
      { code: 'P2002', clientVersion: 'test', meta: { target: ['user_id', 'name'] } },
    );
    assert.strictEqual(isUniqueNameViolation(err), true);
  });

  await test('isUniqueNameViolation: false for a non-P2002 known-request error', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025', clientVersion: 'test',
    });
    assert.strictEqual(isUniqueNameViolation(err), false);
  });

  await test('isUniqueNameViolation: false for a plain Error / non-Prisma value', async () => {
    assert.strictEqual(isUniqueNameViolation(new Error('boom')), false);
    assert.strictEqual(isUniqueNameViolation({ code: 'P2002' }), false);
    assert.strictEqual(isUniqueNameViolation(null), false);
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error('\nFailures:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

run();
