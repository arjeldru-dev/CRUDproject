/**
 * DB-free integration test for the category-rename → feed-propagation path.
 *
 * Verifies that `updateCategory` (categoryController.ts), when the name actually
 * changes, updates the category AND rewrites the frozen name snapshots on the
 * user's matching feed posts — within a single `prisma.$transaction` — via
 * `feedService.renameCategoryInPosts`. Follows the project convention: a
 * self-contained ts-node assertion script driving the controller against a
 * recording in-memory Prisma double (no live database).
 *
 *   npx ts-node src/controllers/__tests__/categoryController.rename.integration.test.ts
 */
import assert from 'node:assert';
// Pulls in the global `Express.Request.user` augmentation for standalone compile.
import '../../middleware/requireAuth';
import type { Request, Response } from 'express';
import { prisma } from '../../config/db';
import * as aiIconService from '../../services/aiIconService';
import { updateCategory } from '../categoryController';

// Stub the AI icon classifier so the rename path never makes an LLM/network
// call (name changes trigger a re-classify); this isolates the controller.
(aiIconService as unknown as { classifyIcon: (name: string) => Promise<string | null> }).classifyIcon =
  async () => null;

// ── Tiny assertion harness (matches sibling integration tests) ───────────────
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

const OWNER_ID = 'owner-user-id';
const CAT_ID = 'cat-under-edit';

interface FeedRow {
  id: string;
  userId: string;
  type: string;
  content: string;
}

function seedPosts(): FeedRow[] {
  return [
    {
      id: 'p1',
      userId: OWNER_ID,
      type: 'EXPENSE_ADDED',
      content: JSON.stringify({
        description: 'added a Groceries split — ₱500 with Juan',
        amount: 500,
        categoryName: 'Groceries',
        friendName: 'Juan',
      }),
    },
    {
      id: 'p2',
      userId: OWNER_ID,
      type: 'BUDGET_MILESTONE',
      content: JSON.stringify({
        description: 'reached 80% of their Groceries budget',
        categoryName: 'Groceries',
        percentage: 80,
      }),
    },
    {
      id: 'p3',
      userId: OWNER_ID,
      type: 'EXPENSE_ADDED',
      content: JSON.stringify({
        description: 'added a Dining split — ₱200',
        amount: 200,
        categoryName: 'Dining',
      }),
    },
    {
      id: 'p4',
      userId: OWNER_ID,
      type: 'BADGE_EARNED', // not in the propagation type filter
      content: JSON.stringify({ description: 'earned the Nest Egg badge 🔥', badgeName: 'Nest Egg' }),
    },
  ];
}

/** Recording in-memory Prisma double covering only the rename path. */
function installPrismaDouble(existing: Record<string, unknown>, posts: FeedRow[]) {
  const feedUpdates: Array<{ id: string; content: string }> = [];
  let findManyWhere:
    | { userId?: string; type?: { in?: string[] }; content?: { contains?: string } }
    | null = null;

  const tx = {
    category: {
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        assert.strictEqual(where.id, CAT_ID, 'category.update targets the edited row');
        return { ...existing, ...data };
      },
    },
    feedPost: {
      findMany: async ({
        where,
      }: {
        where: { userId?: string; type?: { in?: string[] }; content?: { contains?: string } };
      }) => {
        findManyWhere = where;
        const types = where?.type?.in ?? [];
        const needle = where?.content?.contains; // models the case-sensitive Postgres prefilter
        return posts
          .filter(
            (p) =>
              p.userId === where.userId &&
              types.includes(p.type) &&
              (needle === undefined || p.content.includes(needle)),
          )
          .map((p) => ({ id: p.id, content: p.content }));
      },
      update: async ({ where, data }: { where: { id: string }; data: { content: string } }) => {
        feedUpdates.push({ id: where.id, content: data.content });
        return { id: where.id };
      },
    },
  };

  const double = {
    category: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === existing.id ? existing : null,
      findFirst: async () => null, // assertNameAvailable → name is free
    },
    $transaction: async <T>(fn: (client: typeof tx) => Promise<T>): Promise<T> => fn(tx),
  };

  Object.assign(prisma as unknown as Record<string, unknown>, double);
  return { feedUpdates, getFindManyWhere: () => findManyWhere };
}

function mockReqRes(params: Record<string, string>, body: Record<string, unknown>) {
  const req = { params, body, query: {}, user: { id: OWNER_ID } } as unknown as Request;
  const captured: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    status(code: number) { captured.status = code; return this; },
    json(payload: unknown) { captured.body = payload; return this; },
  } as unknown as Response;
  return { req, res, captured };
}

function baseCategory(name: string) {
  return {
    id: CAT_ID,
    userId: OWNER_ID,
    name,
    period: 'MONTHLY',
    monthlyStartDay: 1,
    weeklyStartDay: null,
    customPeriodDays: null,
    anchorDate: null,
  };
}

async function run() {
  console.log('updateCategory → feed rename propagation (no DB)');

  await test('renames the category and propagates to matching posts only, in one transaction', async () => {
    const posts = seedPosts();
    const { feedUpdates, getFindManyWhere } = installPrismaDouble(baseCategory('Groceries'), posts);
    const { req, res, captured } = mockReqRes({ id: CAT_ID }, { name: 'Palengke' });

    await updateCategory(req, res);

    assert.strictEqual(captured.status, 200, 'returns 200');
    assert.strictEqual((captured.body as { category: { name: string } }).category.name, 'Palengke');

    // Only the two Groceries posts (p1 expense, p2 milestone) are rewritten; the
    // Dining post (p3) and the badge post (p4, filtered out by type) are untouched.
    assert.deepStrictEqual(feedUpdates.map((u) => u.id).sort(), ['p1', 'p2']);

    const p1 = JSON.parse(feedUpdates.find((u) => u.id === 'p1')!.content);
    assert.strictEqual(p1.categoryName, 'Palengke');
    assert.strictEqual(p1.description, 'added a Palengke split — ₱500 with Juan');
    assert.strictEqual(p1.friendName, 'Juan', 'unrelated fields preserved');

    const p2 = JSON.parse(feedUpdates.find((u) => u.id === 'p2')!.content);
    assert.strictEqual(p2.description, 'reached 80% of their Palengke budget');

    // Propagation is scoped to the owner's posts only (no cross-user leakage).
    assert.strictEqual(getFindManyWhere()?.userId, OWNER_ID);
  });

  await test('no-op rename (same name) touches no feed posts', async () => {
    const { feedUpdates } = installPrismaDouble(baseCategory('Groceries'), seedPosts());
    const { req, res, captured } = mockReqRes({ id: CAT_ID }, { name: 'Groceries' });

    await updateCategory(req, res);

    assert.strictEqual(captured.status, 200);
    assert.deepStrictEqual(feedUpdates, [], 'no feed writes when the name is unchanged');
  });

  await test('rename with no matching posts still succeeds and writes nothing to the feed', async () => {
    const { feedUpdates } = installPrismaDouble(baseCategory('Utilities'), seedPosts());
    const { req, res, captured } = mockReqRes({ id: CAT_ID }, { name: 'Bills' });

    await updateCategory(req, res);

    assert.strictEqual(captured.status, 200);
    assert.deepStrictEqual(feedUpdates, [], 'no posts reference "Utilities", so none are rewritten');
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error('\nFailures:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

run();
