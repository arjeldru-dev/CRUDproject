/**
 * Unit tests for aiInsightService.
 *
 * Matches the project's self-contained assertion-script convention (no jest):
 *   npx ts-node src/services/__tests__/aiInsightService.test.ts
 * Runs without a live DB or a real LLM key — the global `fetch` is stubbed to
 * simulate the Gemini provider envelope.
 */
import assert from 'node:assert';

process.env.LLM_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = 'test-key';
delete process.env.LLM_MODEL;

import {
  generateInsights,
  sanitizeInsight,
  truncateAtWord,
  isNotable,
  __resetInsightCacheForTests,
  type InsightRequestRow,
} from '../aiInsightService';

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

/** Stub global.fetch with a Gemini-style batch insight envelope. */
function mockInsights(insights: Array<{ categoryId: string; insightText: string }>): { calls: number } {
  const state = { calls: 0 };
  const text = JSON.stringify({ insights });
  global.fetch = (async () => {
    state.calls++;
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
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

function atRiskRow(over: Partial<InsightRequestRow> = {}): InsightRequestRow {
  return {
    categoryId: 'c1',
    categoryName: 'Dining',
    status: 'AT_RISK',
    lowConfidence: false,
    pctUsed: 70,
    projectedPct: 115,
    daysRemaining: 10,
    recommendedDailySpend: 50,
    periodLabel: 'this month',
    ...over,
  };
}

async function main() {
  console.log('aiInsightService');

  // ── truncateAtWord (pure) ─────────────────────────────────────────────
  await test('truncateAtWord leaves short text unchanged', () => {
    assert.strictEqual(truncateAtWord('short text', 200), 'short text');
  });

  await test('truncateAtWord cuts on a word boundary and adds an ellipsis', () => {
    const long = 'word '.repeat(60).trim(); // 299 chars
    const out = truncateAtWord(long, 200);
    assert.ok(out.length <= 200, `expected <=200, got ${out.length}`);
    assert.ok(out.endsWith('…'), 'ends with ellipsis');
    assert.ok(!out.slice(0, -1).endsWith(' '), 'no trailing space before ellipsis');
  });

  // ── sanitizeInsight (pure) ────────────────────────────────────────────
  await test('sanitizeInsight rejects empty / whitespace', () => {
    assert.strictEqual(sanitizeInsight(''), null);
    assert.strictEqual(sanitizeInsight('   '), null);
    assert.strictEqual(sanitizeInsight(123), null);
  });

  await test('sanitizeInsight rejects hallucinated peso amounts', () => {
    assert.strictEqual(sanitizeInsight('You are ₱500 over budget.'), null);
    assert.strictEqual(sanitizeInsight('Spend under PHP 200 daily.'), null);
  });

  await test('sanitizeInsight rejects URLs and code', () => {
    assert.strictEqual(sanitizeInsight('See https://example.com for tips.'), null);
    assert.strictEqual(sanitizeInsight('Run `rm -rf` now.'), null);
  });

  await test('sanitizeInsight accepts and truncates a clean long insight', () => {
    const long = 'Trim a few eat-outs this week to stay on track. '.repeat(6);
    const out = sanitizeInsight(long);
    assert.ok(out && out.length <= 200, 'clean text passes and is capped');
  });

  // ── isNotable ─────────────────────────────────────────────────────────
  await test('isNotable flags AT_RISK / OVER_BUDGET / lowConfidence only', () => {
    assert.strictEqual(isNotable({ status: 'AT_RISK', lowConfidence: false }), true);
    assert.strictEqual(isNotable({ status: 'OVER_BUDGET', lowConfidence: false }), true);
    assert.strictEqual(isNotable({ status: 'ON_TRACK', lowConfidence: true }), true);
    assert.strictEqual(isNotable({ status: 'ON_TRACK', lowConfidence: false }), false);
  });

  // ── generateInsights: happy path ──────────────────────────────────────
  await test('generateInsights returns ai text for a valid response', async () => {
    __resetInsightCacheForTests();
    mockInsights([{ categoryId: 'c1', insightText: 'You are on pace to slightly exceed your Dining limit.' }]);
    const { insights } = await generateInsights([atRiskRow()]);
    assert.strictEqual(insights.length, 1);
    assert.strictEqual(insights[0].source, 'ai');
    assert.ok(insights[0].insightText.length > 0);
  });

  // ── Fallback on failure ───────────────────────────────────────────────
  await test('generateInsights degrades to fallback on provider failure', async () => {
    __resetInsightCacheForTests();
    mockFetchStatus(500);
    const { insights } = await generateInsights([atRiskRow()]);
    assert.strictEqual(insights[0].source, 'fallback');
    assert.strictEqual(insights[0].insightText, '');
  });

  // ── Hallucinated-amount rejection ─────────────────────────────────────
  await test('generateInsights rejects a hallucinated ₱ amount → fallback', async () => {
    __resetInsightCacheForTests();
    mockInsights([{ categoryId: 'c1', insightText: 'You are ₱1,200 over your limit already.' }]);
    const { insights } = await generateInsights([atRiskRow()]);
    assert.strictEqual(insights[0].source, 'fallback');
  });

  // ── Truncation through the service ────────────────────────────────────
  await test('generateInsights truncates a 250-char AI insight to <=200', async () => {
    __resetInsightCacheForTests();
    const longText = 'Try cooking at home a couple more nights this week to ease the pace. '.repeat(5);
    assert.ok(longText.length > 200);
    mockInsights([{ categoryId: 'c1', insightText: longText }]);
    const { insights } = await generateInsights([atRiskRow()]);
    assert.strictEqual(insights[0].source, 'ai');
    assert.ok(insights[0].insightText.length <= 200, `got ${insights[0].insightText.length}`);
  });

  // ── Cache hit ─────────────────────────────────────────────────────────
  await test('generateInsights serves an identical signature from cache (one call)', async () => {
    __resetInsightCacheForTests();
    const state = mockInsights([{ categoryId: 'c1', insightText: 'Keeping a steady pace keeps Dining on budget.' }]);
    await generateInsights([atRiskRow({ pctUsed: 71 })]);
    // Same signature bucket (70): pctUsed 71 and 74 both round to 70.
    const { insights } = await generateInsights([atRiskRow({ pctUsed: 74 })]);
    assert.strictEqual(insights[0].source, 'ai');
    assert.strictEqual(state.calls, 1, 'second identical-signature request hits the cache');
  });

  // ── Non-notable rows are skipped ──────────────────────────────────────
  await test('generateInsights ignores non-notable rows', async () => {
    __resetInsightCacheForTests();
    const state = mockInsights([]);
    const { insights } = await generateInsights([
      atRiskRow({ categoryId: 'ok', status: 'ON_TRACK', lowConfidence: false }),
    ]);
    assert.strictEqual(insights.length, 0);
    assert.strictEqual(state.calls, 0, 'no LLM call when nothing is notable');
  });

  // ── Summary ───────────────────────────────────────────────────────────
  global.fetch = originalFetch;
  console.log(`\naiInsightService: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

main();
