/**
 * Unit tests for aiBudgetSummaryService.
 *
 * Self-contained assertion script (no jest):
 *   npx ts-node src/services/__tests__/aiBudgetSummaryService.test.ts
 * The global `fetch` is stubbed to simulate the Gemini provider envelope.
 */
import assert from 'node:assert';

process.env.LLM_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = 'test-key';
delete process.env.LLM_MODEL;

import {
  generateBudgetSummary,
  buildDeterministicSummary,
  sanitizeSummary,
  truncateParagraph,
  __resetBudgetSummaryCacheForTests,
  type BudgetSummaryRow,
} from '../aiBudgetSummaryService';

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
  }
}

const originalFetch = global.fetch;

function mockSummary(summaryText: string): { calls: number } {
  const state = { calls: 0 };
  const text = JSON.stringify({ summaryText });
  global.fetch = (async () => {
    state.calls++;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return state;
}

function mockFetchStatus(status: number): { calls: number } {
  const state = { calls: 0 };
  global.fetch = (async () => {
    state.calls++;
    return new Response('error', { status });
  }) as typeof fetch;
  return state;
}

function row(over: Partial<BudgetSummaryRow> = {}): BudgetSummaryRow {
  return {
    categoryName: 'Dining',
    status: 'ON_TRACK',
    lowConfidence: false,
    pctUsed: 40,
    projectedPct: 80,
    daysRemaining: 10,
    periodLabel: 'this month',
    ...over,
  };
}

const threeMixed: BudgetSummaryRow[] = [
  row({ categoryName: 'Dining', status: 'OVER_BUDGET', pctUsed: 110 }),
  row({ categoryName: 'Transport', status: 'AT_RISK', pctUsed: 70 }),
  row({ categoryName: 'Groceries', status: 'ON_TRACK', pctUsed: 30 }),
];

async function main() {
  console.log('aiBudgetSummaryService');

  // ── buildDeterministicSummary (pure) ──────────────────────────────────
  await test('deterministic summary references the total and each state', () => {
    const p = buildDeterministicSummary(threeMixed);
    assert.ok(p.includes('3 budgets'), 'mentions total');
    assert.ok(/1 over the limit/.test(p), 'mentions over');
    assert.ok(/1 trending high/.test(p), 'mentions at-risk');
    assert.ok(/1 on track/.test(p), 'mentions on-track');
  });

  await test('deterministic summary is empty for no categories', () => {
    assert.strictEqual(buildDeterministicSummary([]), '');
  });

  await test('truncateParagraph caps length', () => {
    const long = 'This is a sentence. '.repeat(50);
    const out = truncateParagraph(long, 500);
    assert.ok(out.length <= 500, `got ${out.length}`);
  });

  // ── sanitizeSummary (pure) ────────────────────────────────────────────
  await test('sanitizeSummary rejects any ₱/PHP figure (request carries none)', () => {
    assert.strictEqual(sanitizeSummary('You are ₱500 over.'), null);
    assert.strictEqual(sanitizeSummary('Spend under PHP 200.'), null);
  });

  await test('sanitizeSummary rejects URLs/code and empty', () => {
    assert.strictEqual(sanitizeSummary(''), null);
    assert.strictEqual(sanitizeSummary('see https://x.com'), null);
    assert.strictEqual(sanitizeSummary('run `ls`'), null);
  });

  await test('sanitizeSummary accepts and truncates a clean long paragraph', () => {
    const long = 'You are managing your budgets well overall. '.repeat(20);
    const out = sanitizeSummary(long);
    assert.ok(out && out.length <= 500);
  });

  // ── generateBudgetSummary ─────────────────────────────────────────────
  await test('happy path returns AI paragraph', async () => {
    __resetBudgetSummaryCacheForTests();
    mockSummary('You are managing 3 budgets. Dining is over, Transport is trending high, Groceries is fine.');
    const res = await generateBudgetSummary('u1', threeMixed);
    assert.strictEqual(res.source, 'ai');
    assert.ok(res.summaryText.length > 0);
  });

  await test('empty categories → empty fallback, no LLM call', async () => {
    __resetBudgetSummaryCacheForTests();
    const state = mockSummary('nope');
    const res = await generateBudgetSummary('u1', []);
    assert.strictEqual(res.summaryText, '');
    assert.strictEqual(res.source, 'fallback');
    assert.strictEqual(state.calls, 0);
  });

  await test('provider failure → deterministic fallback', async () => {
    __resetBudgetSummaryCacheForTests();
    mockFetchStatus(500);
    const res = await generateBudgetSummary('u1', threeMixed);
    assert.strictEqual(res.source, 'fallback');
    assert.strictEqual(res.summaryText, buildDeterministicSummary(threeMixed));
  });

  await test('hallucinated ₱ amount → deterministic fallback', async () => {
    __resetBudgetSummaryCacheForTests();
    mockSummary('You have spent ₱4,300 across your budgets this month.');
    const res = await generateBudgetSummary('u1', threeMixed);
    assert.strictEqual(res.source, 'fallback');
  });

  await test('identical picture is served from cache (one call)', async () => {
    __resetBudgetSummaryCacheForTests();
    const state = mockSummary('A cohesive budget summary paragraph.');
    await generateBudgetSummary('u1', threeMixed);
    // Same statuses + pct buckets → same signature → cache hit.
    const res = await generateBudgetSummary('u1', threeMixed.map((r) => ({ ...r, pctUsed: r.pctUsed + 2 })));
    assert.strictEqual(res.source, 'ai');
    assert.strictEqual(state.calls, 1, 'second identical-signature request hits the cache');
  });

  await test('many categories still make one bounded call', async () => {
    __resetBudgetSummaryCacheForTests();
    const many: BudgetSummaryRow[] = Array.from({ length: 20 }, (_, i) =>
      row({ categoryName: `Cat${i}`, status: i < 2 ? 'OVER_BUDGET' : 'ON_TRACK', pctUsed: i < 2 ? 120 : 20 }),
    );
    const state = mockSummary('You have 20 budgets, mostly on track with a couple running over.');
    const res = await generateBudgetSummary('u1', many);
    assert.strictEqual(res.source, 'ai');
    assert.strictEqual(state.calls, 1);
  });

  global.fetch = originalFetch;
  console.log(`\naiBudgetSummaryService: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

main();
