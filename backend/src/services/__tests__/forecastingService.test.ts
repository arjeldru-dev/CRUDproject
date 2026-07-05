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

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
