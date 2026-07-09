/**
 * Unit tests for forecastingService.generateSpendingForecast.
 *
 * Matches the project's self-contained assertion-script convention (no jest):
 *   npx ts-node src/services/__tests__/forecastingService.test.ts
 * Exits non-zero if any assertion fails.
 */
import assert from 'node:assert';
import { generateSpendingForecast } from '../forecastingService';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
    console.error(`  ✗ ${name}`);
  }
}

console.log('forecastingService.generateSpendingForecast');

// ── Baseline states ──────────────────────────────────────────────────────
test('no spend → NEW, no projection', () => {
  const r = generateSpendingForecast({
    spent: 0, limitAmount: 1000, daysElapsed: 1, daysRemaining: 6, categoryName: 'Food', totalDays: 7,
  });
  assert.strictEqual(r.status, 'NEW');
  assert.strictEqual(r.projectedSpend, 0);
  assert.strictEqual(r.lowConfidence, false);
});

test('already over the limit → OVER_BUDGET', () => {
  const r = generateSpendingForecast({
    spent: 1200, limitAmount: 1000, daysElapsed: 5, daysRemaining: 25, categoryName: 'Food', totalDays: 30,
  });
  assert.strictEqual(r.status, 'OVER_BUDGET');
});

// ── SURPLUS wording (Finding 5) ────────────────────────────────────────────
test('negative spend → SURPLUS with accurate buffer wording (not "more than your limit")', () => {
  const r = generateSpendingForecast({
    spent: -1500, limitAmount: 3000, daysElapsed: 5, daysRemaining: 25, categoryName: 'Groceries', totalDays: 30,
  });
  assert.strictEqual(r.status, 'SURPLUS');
  assert.ok(r.insightText.includes('extra budget'), 'mentions extra budget');
  assert.ok(r.insightText.includes('on top of'), 'frames surplus as on top of the limit');
  assert.ok(!/more than your .* limit/.test(r.insightText), 'drops the misleading "more than your limit" phrasing');
});

// ── DAILY: reachable AT_RISK (Finding 1 + 2) ───────────────────────────────
test('DAILY projection equals spent (no days remaining)', () => {
  const r = generateSpendingForecast({
    spent: 100, limitAmount: 500, daysElapsed: 1, daysRemaining: 0, categoryName: 'Snacks', totalDays: 1,
  });
  assert.strictEqual(r.projectedSpend, 100);
  assert.strictEqual(r.status, 'ON_TRACK');
});

test('DAILY high spend now reaches AT_RISK (previously impossible)', () => {
  const r = generateSpendingForecast({
    spent: 460, limitAmount: 500, daysElapsed: 1, daysRemaining: 0, categoryName: 'Snacks', totalDays: 1,
  });
  assert.strictEqual(r.status, 'AT_RISK');
});

// ── WEEKLY: day-2 warning enabled (Finding 2) ──────────────────────────────
test('WEEKLY day 2 front-loaded spend now flags AT_RISK', () => {
  // 2/7 = 0.286 elapsed fraction ≥ 0.25 → enough signal.
  const r = generateSpendingForecast({
    spent: 3000, limitAmount: 7000, daysElapsed: 2, daysRemaining: 5, categoryName: 'Dining', totalDays: 7,
  });
  assert.strictEqual(r.status, 'AT_RISK');
  assert.strictEqual(r.lowConfidence, false);
});

// ── MONTHLY: early low-confidence vs later hard alert (Finding 3) ──────────
test('MONTHLY day 2 front-loaded spend stays ON_TRACK but flags lowConfidence (no false "keep it up")', () => {
  // 2/30 = 0.067 fraction and daysElapsed < 3 → not enough signal yet.
  const r = generateSpendingForecast({
    spent: 4000, limitAmount: 10000, daysElapsed: 2, daysRemaining: 28, categoryName: 'Shopping', totalDays: 30,
  });
  assert.strictEqual(r.status, 'ON_TRACK');
  assert.strictEqual(r.lowConfidence, true);
  assert.ok(!/Keep it up/.test(r.insightText), 'does not falsely reassure while projection trends over');
  assert.ok(r.projectedSpend > 10000, 'projection genuinely trends over the limit');
});

test('MONTHLY day 5 with same pace escalates to AT_RISK', () => {
  const r = generateSpendingForecast({
    spent: 4000, limitAmount: 10000, daysElapsed: 5, daysRemaining: 25, categoryName: 'Shopping', totalDays: 30,
  });
  assert.strictEqual(r.status, 'AT_RISK');
  assert.strictEqual(r.lowConfidence, false);
});

test('MONTHLY steady low spend stays ON_TRACK with confident reassurance', () => {
  const r = generateSpendingForecast({
    spent: 1000, limitAmount: 10000, daysElapsed: 5, daysRemaining: 25, categoryName: 'Shopping', totalDays: 30,
  });
  assert.strictEqual(r.status, 'ON_TRACK');
  assert.strictEqual(r.lowConfidence, false);
  assert.ok(/Keep it up/.test(r.insightText));
});

// ── Graded confidence ───────────────────────────────────────────────────────
test('confidence is NONE when nothing has been spent', () => {
  const r = generateSpendingForecast({
    spent: 0, limitAmount: 1000, daysElapsed: 1, daysRemaining: 6, categoryName: 'Food', totalDays: 7,
  });
  assert.strictEqual(r.confidence, 'NONE');
});

test('confidence is LOW very early in a long period', () => {
  const r = generateSpendingForecast({
    spent: 200, limitAmount: 10000, daysElapsed: 1, daysRemaining: 29, categoryName: 'Food', totalDays: 30,
  });
  assert.strictEqual(r.confidence, 'LOW');
});

test('confidence is MEDIUM past the debounce but before the halfway mark', () => {
  const r = generateSpendingForecast({
    spent: 1000, limitAmount: 10000, daysElapsed: 5, daysRemaining: 25, categoryName: 'Food', totalDays: 30,
  });
  assert.strictEqual(r.confidence, 'MEDIUM');
});

test('confidence is HIGH once at least half the period has elapsed', () => {
  const r = generateSpendingForecast({
    spent: 5000, limitAmount: 10000, daysElapsed: 20, daysRemaining: 10, categoryName: 'Food', totalDays: 30,
  });
  assert.strictEqual(r.confidence, 'HIGH');
});

test('SURPLUS reports HIGH confidence', () => {
  const r = generateSpendingForecast({
    spent: -500, limitAmount: 3000, daysElapsed: 5, daysRemaining: 25, categoryName: 'Groceries', totalDays: 30,
  });
  assert.strictEqual(r.confidence, 'HIGH');
});

// ── Actionable pacing figures ────────────────────────────────────────────────
test('recommendedDailySpend paces the remaining budget over the days left', () => {
  const r = generateSpendingForecast({
    spent: 1000, limitAmount: 10000, daysElapsed: 5, daysRemaining: 25, categoryName: 'Food', totalDays: 30,
  });
  // (10000 - 1000) / 25 = 360
  assert.strictEqual(r.recommendedDailySpend, 360);
});

test('recommendedDailySpend is null when no days remain', () => {
  const r = generateSpendingForecast({
    spent: 100, limitAmount: 500, daysElapsed: 1, daysRemaining: 0, categoryName: 'Snacks', totalDays: 1,
  });
  assert.strictEqual(r.recommendedDailySpend, null);
});

test('recommendedDailySpend floors at 0 when already over the pace, never negative', () => {
  const r = generateSpendingForecast({
    spent: 900, limitAmount: 1000, daysElapsed: 5, daysRemaining: 5, categoryName: 'Food', totalDays: 10,
  });
  assert.ok(r.recommendedDailySpend !== null && r.recommendedDailySpend >= 0);
});

test('projectedOverage reports the projected excess over the limit', () => {
  const r = generateSpendingForecast({
    spent: 4000, limitAmount: 10000, daysElapsed: 5, daysRemaining: 25, categoryName: 'Shopping', totalDays: 30,
  });
  // dailyAvg 800 → projected 24000 → overage 14000
  assert.strictEqual(r.projectedOverage, 14000);
});

test('projectedOverage is 0 while the projection stays within the limit', () => {
  const r = generateSpendingForecast({
    spent: 1000, limitAmount: 10000, daysElapsed: 5, daysRemaining: 25, categoryName: 'Shopping', totalDays: 30,
  });
  assert.strictEqual(r.projectedOverage, 0);
});

// ── Defensive input handling (robustness) ────────────────────────────────────
test('never divides by zero: daysElapsed 0 is clamped to 1', () => {
  const r = generateSpendingForecast({
    spent: 100, limitAmount: 500, daysElapsed: 0, daysRemaining: 6, categoryName: 'Food', totalDays: 7,
  });
  assert.ok(Number.isFinite(r.projectedSpend), 'projection is finite, not Infinity');
  // dailyAvg 100 (elapsed clamped to 1) → projected 100 + 100*6 = 700
  assert.strictEqual(r.projectedSpend, 700);
});

test('non-finite numeric inputs never leak NaN/Infinity into the result', () => {
  const r = generateSpendingForecast({
    spent: Number.NaN,
    limitAmount: Number.POSITIVE_INFINITY,
    daysElapsed: Number.NaN,
    daysRemaining: -5,
    categoryName: 'Food',
    totalDays: Number.NaN,
  });
  assert.ok(Number.isFinite(r.projectedSpend));
  assert.ok(Number.isFinite(r.pctUsed));
  assert.ok(Number.isFinite(r.projectedPct));
  assert.ok(Number.isFinite(r.projectedOverage));
  // spent coerced to 0 → NEW
  assert.strictEqual(r.status, 'NEW');
});

test('negative daysRemaining is clamped so the projection equals spent', () => {
  const r = generateSpendingForecast({
    spent: 250, limitAmount: 1000, daysElapsed: 3, daysRemaining: -4, categoryName: 'Food', totalDays: 3,
  });
  assert.strictEqual(r.projectedSpend, 250);
});

test('zero limit never yields OVER_BUDGET or division artifacts', () => {
  const r = generateSpendingForecast({
    spent: 500, limitAmount: 0, daysElapsed: 3, daysRemaining: 4, categoryName: 'Food', totalDays: 7,
  });
  assert.notStrictEqual(r.status, 'OVER_BUDGET');
  assert.strictEqual(r.pctUsed, 0);
  assert.strictEqual(r.projectedOverage, 0);
  assert.strictEqual(r.recommendedDailySpend, null);
});

test('projection is rounded to 2 decimals', () => {
  const r = generateSpendingForecast({
    spent: 100, limitAmount: 1000, daysElapsed: 3, daysRemaining: 4, categoryName: 'Food', totalDays: 7,
  });
  // dailyAvg 33.333… → projected 100 + 33.333*4 = 233.33 (2dp)
  assert.strictEqual(r.projectedSpend, round2(r.projectedSpend));
  assert.strictEqual(r.projectedSpend, 233.33);
});

test('missing category name degrades gracefully', () => {
  const r = generateSpendingForecast({
    spent: 100, limitAmount: 1000, daysElapsed: 3, daysRemaining: 4, categoryName: '' as unknown as string, totalDays: 7,
  });
  assert.ok(r.insightText.length > 0);
  assert.ok(!/undefined|NaN/.test(r.insightText));
});

// helper mirrored from the service for the rounding assertion above
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
