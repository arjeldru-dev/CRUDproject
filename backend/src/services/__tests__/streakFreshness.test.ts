/**
 * Regression tests for streak freshness.
 *
 * Bug: the Barkada's Streak widget (and the dashboard streak) showed friends as
 * "on streak" with a number equal to their longest streak even when they had no
 * active streak. Root cause: `UserGamification.currentStreak` is a snapshot that
 * only `updateStreak` rewrites (after a transaction); with no daily job it
 * freezes when a user stops logging, and the read paths surfaced it verbatim.
 * `effectiveCurrentStreak` expires a snapshot whose last qualifying day is older
 * than yesterday.
 *
 * Self-contained assertion script (project convention, no jest/vitest):
 *   npx ts-node src/services/__tests__/streakFreshness.test.ts
 * Exits non-zero if any assertion fails.
 */
import assert from 'node:assert';
import { effectiveCurrentStreak } from '../streakFreshness';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
    console.error(`  \u2717 ${name}`);
  }
}

// Fixed clock so the "today/yesterday" boundary is deterministic.
// 2025-02-10T12:00:00Z -> local date 2025-02-10 in UTC.
const NOW = new Date('2025-02-10T12:00:00Z');
const day = (iso: string) => new Date(iso + 'T00:00:00Z');

console.log('streakFreshness');

test('counts a streak whose last day is today', () => {
  assert.strictEqual(effectiveCurrentStreak(12, day('2025-02-10'), 'UTC', NOW), 12);
});

test('counts a streak whose last day is yesterday (still alive today)', () => {
  assert.strictEqual(effectiveCurrentStreak(12, day('2025-02-09'), 'UTC', NOW), 12);
});

test('REGRESSION: expires a streak whose last day is 2 days ago (was showing the frozen value)', () => {
  assert.strictEqual(effectiveCurrentStreak(12, day('2025-02-08'), 'UTC', NOW), 0);
});

test('REGRESSION: abandoned personal-best streak reads as 0, not the longest value', () => {
  // User hit 30, then stopped logging weeks ago: currentStreak froze at 30 == longestStreak.
  assert.strictEqual(effectiveCurrentStreak(30, day('2025-01-01'), 'UTC', NOW), 0);
});

test('a zero stored streak stays zero', () => {
  assert.strictEqual(effectiveCurrentStreak(0, day('2025-02-10'), 'UTC', NOW), 0);
});

test('a null lastStreakDate yields zero', () => {
  assert.strictEqual(effectiveCurrentStreak(5, null, 'UTC', NOW), 0);
});

test('a negative/invalid stored streak yields zero', () => {
  assert.strictEqual(effectiveCurrentStreak(-3, day('2025-02-10'), 'UTC', NOW), 0);
});

test('uses the user timezone to decide "today"', () => {
  // 2025-02-10T12:00Z is 2025-02-10 20:00 in Manila (UTC+8) -> local date 2025-02-10.
  assert.strictEqual(effectiveCurrentStreak(3, day('2025-02-10'), 'Asia/Manila', NOW), 3);
});

test('defaults to UTC when timezone is missing', () => {
  assert.strictEqual(effectiveCurrentStreak(7, day('2025-02-09'), undefined, NOW), 7);
});

if (failures.length > 0) {
  console.error(`\n${failures.length} test(s) failed:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\n${passed} test(s) passed.`);
