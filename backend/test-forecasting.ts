import { generateSpendingForecast } from './src/services/forecastingService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('🧪 Running forecasting rules unit tests...');

// Case 1: Low spent percentage (10%) on day 1 with high projection
// monthlyLimit = 1000, spent = 100, daysElapsed = 1, daysRemaining = 29
// dailyAverage = 100, projectedSpend = 3000 (over limit)
// but pct = 10% < 30%, and daysElapsed = 1 < 3 -> status should be ON_TRACK
const result1 = generateSpendingForecast({
  spent: 100,
  monthlyLimit: 1000,
  daysElapsed: 1,
  daysRemaining: 29,
  categoryName: 'Food',
});
assert(result1.status === 'ON_TRACK', `Expected ON_TRACK for low spend/early days, got ${result1.status}`);
assert(result1.projectedSpend === 3000, `Expected projectedSpend = 3000, got ${result1.projectedSpend}`);

// Case 2: Moderate spent percentage (30%) on day 10 with high projection
// monthlyLimit = 1000, spent = 300, daysElapsed = 10, daysRemaining = 20
// dailyAverage = 30, projectedSpend = 900 (under limit - 90%)
// Since projectedSpend = 900 >= 850 (85% of limit), pct = 30% >= 30%, daysElapsed = 10 >= 3 -> status should be AT_RISK
const result2 = generateSpendingForecast({
  spent: 300,
  monthlyLimit: 1000,
  daysElapsed: 10,
  daysRemaining: 20,
  categoryName: 'Food',
});
assert(result2.status === 'AT_RISK', `Expected AT_RISK for >=30% spend and >=3 days elapsed, got ${result2.status}`);
assert(result2.projectedSpend === 900, `Expected projectedSpend = 900, got ${result2.projectedSpend}`);

// Case 2b: Spent percentage (26%) on day 10 with projected spend below 85%
// monthlyLimit = 1000, spent = 260, daysElapsed = 10, daysRemaining = 20
// dailyAverage = 26, projectedSpend = 780 (78% of limit) -> status should be ON_TRACK
const result2b = generateSpendingForecast({
  spent: 260,
  monthlyLimit: 1000,
  daysElapsed: 10,
  daysRemaining: 20,
  categoryName: 'Food',
});
assert(result2b.status === 'ON_TRACK', `Expected ON_TRACK for <85% projected spend, got ${result2b.status}`);
assert(result2b.projectedSpend === 780, `Expected projectedSpend = 780, got ${result2b.projectedSpend}`);

// Case 3: High spent percentage (60%) on day 2 with high projection
// monthlyLimit = 1000, spent = 600, daysElapsed = 2, daysRemaining = 28
// dailyAverage = 300, projectedSpend = 9000 (over limit)
// pct = 60% >= 30%, but daysElapsed = 2 < 3 -> status should be ON_TRACK (safeguard for days elapsed)
const result3 = generateSpendingForecast({
  spent: 600,
  monthlyLimit: 1000,
  daysElapsed: 2,
  daysRemaining: 28,
  categoryName: 'Food',
});
assert(result3.status === 'ON_TRACK', `Expected ON_TRACK since daysElapsed < 3, got ${result3.status}`);

// Case 4: Over budget
// monthlyLimit = 1000, spent = 1100, daysElapsed = 1, daysRemaining = 29
// status should be OVER_BUDGET regardless of days elapsed
const result4 = generateSpendingForecast({
  spent: 1100,
  monthlyLimit: 1000,
  daysElapsed: 1,
  daysRemaining: 29,
  categoryName: 'Food',
});
assert(result4.status === 'OVER_BUDGET', `Expected OVER_BUDGET, got ${result4.status}`);

console.log('🎉 All forecasting rules unit tests passed successfully!');
process.exit(0);
