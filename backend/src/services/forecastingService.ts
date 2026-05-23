export interface ForecastParams {
  spent: number;
  monthlyLimit: number;
  daysElapsed: number;
  daysRemaining: number;
  categoryName: string;
}

export interface ForecastResult {
  projectedSpend: number;
  status: string;
  insightText: string;
  alertText: string;
}

export const generateSpendingForecast = ({
  spent,
  monthlyLimit,
  daysElapsed,
  daysRemaining,
  categoryName,
}: ForecastParams): ForecastResult => {
  let projectedSpend = 0;
  let status = 'NEW';
  let insightText = '';
  let alertText = '';

  const fmt = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);

  if (spent === 0) {
    insightText = "Make transactions to unlock your forecast!";
  } else if (spent < 0) {
    status = 'SURPLUS';
    const surplus = Math.abs(spent);
    alertText = `Extra ${fmt(surplus)} available!`;
    insightText = `You have ${fmt(surplus)} more than your ${fmt(monthlyLimit)} limit for ${categoryName.toLowerCase()}. Great job building a buffer!`;
  } else {
    const dailyAverage = spent / daysElapsed;
    projectedSpend = spent + (dailyAverage * daysRemaining);
    const pct = monthlyLimit > 0 ? Math.round((spent / monthlyLimit) * 100) : 0;

    // We only flag a category AT_RISK if at least 3 days have elapsed and 30% of the budget is used.
    // This prevents premature/volatile alerts during the first 1-2 days of a new month,
    // as early large transactions (e.g. paying rent) would skew forecasting projections.
    if (spent > monthlyLimit && monthlyLimit > 0) {
      status = 'OVER_BUDGET';
    } else if (projectedSpend >= monthlyLimit * 0.85 && monthlyLimit > 0 && pct >= 30 && daysElapsed >= 3) {
      status = 'AT_RISK';
    } else {
      status = 'ON_TRACK';
    }

    if (status === 'OVER_BUDGET') {
      const overage = spent - monthlyLimit;
      alertText = `Over limit by ${fmt(overage)}!`;
      insightText = `You are ${fmt(overage)} over your ${fmt(monthlyLimit)} limit for ${categoryName.toLowerCase()}.`;
    } else if (status === 'AT_RISK') {
      alertText = `${pct}% budget used, ${daysRemaining} days left.`;
      const n = categoryName.toLowerCase();
      if (n.includes('dining') || n.includes('food') || n.includes('eat')) {
        insightText = "Switch to home cooking to stay under limit.";
      } else if (n.includes('transport') || n.includes('commute') || n.includes('gas')) {
        insightText = "Consider carpooling or public transport to save.";
      } else if (n.includes('shopping') || n.includes('clothes') || n.includes('apparel')) {
        insightText = "Hold off on non-essential purchases this week.";
      } else if (n.includes('entertainment') || n.includes('fun') || n.includes('leisure')) {
        insightText = "Look for free activities or stay in to stay under limit.";
      } else {
        insightText = "Pace your spending to avoid exceeding the limit.";
      }
    } else {
      alertText = `${pct}% budget used.`;
      insightText = `You're on track for ${categoryName}! Keep it up.`;
    }
  }

  return { projectedSpend, status, insightText, alertText };
};
