/**
 * Unit tests for aiIconService.
 *
 * Matches the project's self-contained assertion-script convention (no jest):
 *   npx ts-node src/services/__tests__/aiIconService.test.ts
 * Runs without a live DB or a real LLM key — the global `fetch` is stubbed to
 * simulate the Gemini provider envelope.
 */
import assert from 'node:assert';

// Configure a provider + key BEFORE importing the service (read at call time,
// but set here for clarity and to keep the process hermetic).
process.env.LLM_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = 'test-key';
delete process.env.LLM_MODEL;

import {
  classifyIcon,
  coerceIconKey,
  __resetIconCacheForTests,
} from '../aiIconService';

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

/** Stub global.fetch with a Gemini-style success envelope carrying `text`. */
function mockGeminiText(text: string): { calls: number } {
  const state = { calls: 0 };
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

async function main() {
  console.log('aiIconService');

  // ── coerceIconKey (pure) ──────────────────────────────────────────────
  await test('coerceIconKey keeps a valid key', () => {
    assert.strictEqual(coerceIconKey('transport'), 'transport');
  });

  await test('coerceIconKey normalizes case/whitespace', () => {
    assert.strictEqual(coerceIconKey('  TRANSPORT '), 'transport');
  });

  await test('coerceIconKey maps off-list output to wallet (default)', () => {
    assert.strictEqual(coerceIconKey('spaceship'), 'wallet');
    assert.strictEqual(coerceIconKey(42), 'wallet');
    assert.strictEqual(coerceIconKey(null), 'wallet');
  });

  // ── classifyIcon: enum coercion via a live (mocked) call ──────────────
  await test('classifyIcon coerces an off-enum model answer to wallet', async () => {
    __resetIconCacheForTests();
    mockGeminiText('{"iconKey":"rocketship"}');
    const result = await classifyIcon('Mystery Box');
    assert.strictEqual(result, 'wallet');
  });

  await test('classifyIcon returns a valid classified key', async () => {
    __resetIconCacheForTests();
    mockGeminiText('{"iconKey":"transport"}');
    const result = await classifyIcon('Pamasahe');
    assert.strictEqual(result, 'transport');
  });

  // ── Fallback to null ──────────────────────────────────────────────────
  await test('classifyIcon returns null on provider failure with a single attempt (no retry)', async () => {
    __resetIconCacheForTests();
    const state = mockFetchStatus(500);
    const result = await classifyIcon('Kain Out');
    assert.strictEqual(result, null);
    // Write-path classify runs with maxAttempts:1 so it cannot stack two
    // timeouts onto a user-blocking category create/rename.
    assert.strictEqual(state.calls, 1, 'must not retry on the write path');
  });

  await test('classifyIcon returns null for an empty name without calling the LLM', async () => {
    __resetIconCacheForTests();
    const state = mockGeminiText('{"iconKey":"dining"}');
    const result = await classifyIcon('   ');
    assert.strictEqual(result, null);
    assert.strictEqual(state.calls, 0, 'must not hit the provider for empty input');
  });

  await test('classifyIcon returns null when the provider key is unset', async () => {
    __resetIconCacheForTests();
    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const state = mockGeminiText('{"iconKey":"dining"}');
    try {
      const result = await classifyIcon('Groceries');
      assert.strictEqual(result, null);
      assert.strictEqual(state.calls, 0, 'must short-circuit when unconfigured');
    } finally {
      process.env.GEMINI_API_KEY = savedKey;
    }
  });

  // ── Cache hit ─────────────────────────────────────────────────────────
  await test('classifyIcon serves a second identical name from cache (one call)', async () => {
    __resetIconCacheForTests();
    const state = mockGeminiText('{"iconKey":"savings"}');
    const first = await classifyIcon('Barkada Fund');
    const second = await classifyIcon('barkada fund'); // case-insensitive key
    assert.strictEqual(first, 'savings');
    assert.strictEqual(second, 'savings');
    assert.strictEqual(state.calls, 1, 'second lookup must hit the cache');
  });

  // ── Summary ───────────────────────────────────────────────────────────
  global.fetch = originalFetch;
  console.log(`\naiIconService: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

main();
