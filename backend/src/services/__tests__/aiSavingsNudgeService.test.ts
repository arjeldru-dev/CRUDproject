/**
 * Unit tests for aiSavingsNudgeService.
 *
 * Matches the project's self-contained assertion-script convention (no jest):
 *   npx ts-node src/services/__tests__/aiSavingsNudgeService.test.ts
 * Runs without a live DB or a real LLM key — the global `fetch` is stubbed to
 * simulate the Gemini provider envelope.
 */
import assert from 'node:assert';

process.env.LLM_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = 'test-key';
delete process.env.LLM_MODEL;

import {
  generateSavingsNudge,
  evaluateNudgeReason,
  buildHeuristicNudge,
  sanitizeNudge,
  hasHallucinatedAmount,
  truncateAtWord,
  __resetNudgeCacheForTests,
  type SavingsNudgeInput,
} from '../aiSavingsNudgeService';

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

/** Stub global.fetch with a Gemini-style {"nudgeText":...} envelope. */
function mockNudge(nudgeText: string): { calls: number } {
  const state = { calls: 0 };
  const text = JSON.stringify({ nudgeText });
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

function baseInput(over: Partial<SavingsNudgeInput> = {}): SavingsNudgeInput {
  return {
    enabled: true,
    totalSavingsBalance: 1240,
    totalAccruedSavings: 1240,
    aggregateShortfall: 0,
    topCategories: [{ categoryName: 'Groceries', accruedSavings: 800 }],
    trend: { previousAccrued: 900, latestAccrued: 1240 },
    ...over,
  };
}

async function main() {
  console.log('aiSavingsNudgeService');

  // ── evaluateNudgeReason (pure gate) ───────────────────────────────────
  await test('reason: MILESTONE when crossing a new ₱1,000 band', () => {
    assert.strictEqual(evaluateNudgeReason(baseInput()), 'MILESTONE');
  });

  await test('reason: SHORTFALL when aggregateShortfall > 0 (no crossing)', () => {
    const r = evaluateNudgeReason(
      baseInput({ aggregateShortfall: 300, trend: { previousAccrued: 1100, latestAccrued: 1150 } }),
    );
    assert.strictEqual(r, 'SHORTFALL');
  });

  await test('reason: GROWTH when accrual rose but no crossing/shortfall', () => {
    const r = evaluateNudgeReason(
      baseInput({ totalAccruedSavings: 1150, trend: { previousAccrued: 1100, latestAccrued: 1150 } }),
    );
    assert.strictEqual(r, 'GROWTH');
  });

  await test('reason: STALLED when enabled with accrual but no growth', () => {
    const r = evaluateNudgeReason(
      baseInput({ totalAccruedSavings: 1100, trend: { previousAccrued: 1100, latestAccrued: 1100 } }),
    );
    assert.strictEqual(r, 'STALLED');
  });

  await test('reason: NONE when nothing notable and no trend', () => {
    const r = evaluateNudgeReason({
      enabled: true,
      totalSavingsBalance: 0,
      totalAccruedSavings: 0,
      aggregateShortfall: 0,
      topCategories: [],
    });
    assert.strictEqual(r, 'NONE');
  });

  await test('reason: NONE when savings disabled', () => {
    assert.strictEqual(evaluateNudgeReason(baseInput({ enabled: false })), 'NONE');
  });

  // ── hasHallucinatedAmount (pure) ──────────────────────────────────────
  await test('hasHallucinatedAmount flags a ₱ figure not in the allowed set', () => {
    assert.strictEqual(hasHallucinatedAmount('You saved ₱9,999 total!', new Set([1240, 1000])), true);
    assert.strictEqual(hasHallucinatedAmount('You reached ₱1,240 saved!', new Set([1240, 1000])), false);
  });

  await test('sanitizeNudge rejects URLs, code, and empty', () => {
    assert.strictEqual(sanitizeNudge('', 'GROWTH', baseInput()), null);
    assert.strictEqual(sanitizeNudge('see https://x.com', 'GROWTH', baseInput()), null);
    assert.strictEqual(sanitizeNudge('run `ls`', 'GROWTH', baseInput()), null);
  });

  await test('truncateAtWord caps at the boundary with an ellipsis', () => {
    const long = 'word '.repeat(60).trim();
    const out = truncateAtWord(long, 160);
    assert.ok(out.length <= 160 && out.endsWith('…'));
  });

  // ── generateSavingsNudge ──────────────────────────────────────────────
  await test('NONE never calls the LLM and renders no text', async () => {
    __resetNudgeCacheForTests();
    const state = mockNudge('should not be used');
    const res = await generateSavingsNudge('u1', {
      enabled: true,
      totalSavingsBalance: 0,
      totalAccruedSavings: 0,
      aggregateShortfall: 0,
      topCategories: [],
    });
    assert.strictEqual(res.reason, 'NONE');
    assert.strictEqual(res.nudgeText, '');
    assert.strictEqual(state.calls, 0, 'no LLM call for NONE');
  });

  await test('disabled savings → NONE, no LLM call, empty text', async () => {
    __resetNudgeCacheForTests();
    const state = mockNudge('nope');
    const res = await generateSavingsNudge('u1', baseInput({ enabled: false }));
    assert.strictEqual(res.reason, 'NONE');
    assert.strictEqual(res.nudgeText, '');
    assert.strictEqual(state.calls, 0);
  });

  await test('milestone happy path returns AI text', async () => {
    __resetNudgeCacheForTests();
    mockNudge('You just crossed a savings milestone — your best stretch yet!');
    const res = await generateSavingsNudge('u1', baseInput());
    assert.strictEqual(res.reason, 'MILESTONE');
    assert.strictEqual(res.source, 'ai');
    assert.ok(res.nudgeText.length > 0);
  });

  await test('an amount present in the input is allowed', async () => {
    __resetNudgeCacheForTests();
    mockNudge('You reached ₱1,240 saved — amazing!');
    const res = await generateSavingsNudge('u1', baseInput());
    assert.strictEqual(res.source, 'ai');
  });

  await test('hallucinated ₱ amount → fallback heuristic', async () => {
    __resetNudgeCacheForTests();
    mockNudge('You saved ₱9,999 already!');
    const res = await generateSavingsNudge('u1', baseInput());
    assert.strictEqual(res.source, 'fallback');
    assert.strictEqual(res.nudgeText, buildHeuristicNudge('MILESTONE'));
  });

  await test('provider failure → fallback heuristic', async () => {
    __resetNudgeCacheForTests();
    mockFetchStatus(500);
    const res = await generateSavingsNudge('u1', baseInput({ aggregateShortfall: 200 }));
    assert.strictEqual(res.reason, 'MILESTONE'); // crossing still wins the gate
    assert.strictEqual(res.source, 'fallback');
  });

  await test('overlong AI text is truncated to <= 160', async () => {
    __resetNudgeCacheForTests();
    mockNudge('Keep saving a little every period and your piggybank keeps growing steadily over time. '.repeat(3));
    const res = await generateSavingsNudge('u1', baseInput());
    assert.strictEqual(res.source, 'ai');
    assert.ok(res.nudgeText.length <= 160, `got ${res.nudgeText.length}`);
  });

  await test('identical state within the ₱500 bucket is served from cache', async () => {
    __resetNudgeCacheForTests();
    const state = mockNudge('Nice milestone — keep it up!');
    await generateSavingsNudge('u1', baseInput({ totalAccruedSavings: 1240 }));
    // 1240 and 1200 both bucket to 1000; same reason + user → cache hit.
    const res = await generateSavingsNudge(
      'u1',
      baseInput({ totalAccruedSavings: 1200, trend: { previousAccrued: 900, latestAccrued: 1200 } }),
    );
    assert.strictEqual(res.source, 'ai');
    assert.strictEqual(state.calls, 1, 'second same-bucket request hits the cache');
  });

  global.fetch = originalFetch;
  console.log(`\naiSavingsNudgeService: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

main();
