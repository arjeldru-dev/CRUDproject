export interface ForecastParams {
  spent: number;
  limitAmount: number;
  daysElapsed: number;
  daysRemaining: number;
  categoryName: string;
  periodLabel?: string;
  /** Length of the active period in days. Used to scale the risk debounce to
   *  the period type (daily/weekly/monthly/custom) instead of a fixed day count. */
  totalDays?: number;
}

export interface ForecastResult {
  projectedSpend: number;
  status: string;
  insightText: string;
  alertText: string;
  /** True when the projection already trends toward overspend but too little of
   *  the period has elapsed to trust it. The category stays ON_TRACK (no hard
   *  alarm) but the copy/UI stay cautious rather than falsely reassuring. */
  lowConfidence: boolean;
}

// A projection is only trustworthy once we have enough of the period behind us.
// We accept EITHER 3 elapsed days (protects long periods from early large
// transactions such as rent) OR a quarter of the period elapsed (lets short
// periods — daily/weekly/short custom cycles — warn proportionally instead of
// never). This replaces a fixed `daysElapsed >= 3` gate that made AT_RISK
// unreachable for daily budgets and blocked ~29% of every weekly cycle.
const MIN_SIGNAL_DAYS = 3;
const MIN_SIGNAL_FRACTION = 0.25;
const RISK_PROJECTION_RATIO = 0.85;
const RISK_MIN_PCT = 30;

export const generateSpendingForecast = ({
  spent,
  limitAmount,
  daysElapsed,
  daysRemaining,
  categoryName,
  totalDays,
}: ForecastParams): ForecastResult => {
  let projectedSpend = 0;
  let status = 'NEW';
  let insightText = '';
  let alertText = '';
  let lowConfidence = false;

  const fmt = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);

  if (spent === 0) {
    insightText = "Make transactions to unlock your forecast!";
  } else if (spent < 0) {
    // Net negative spend: refunds, settlement reversals, or a budget top-up have
    // put more back than was spent, leaving room beyond the nominal limit.
    status = 'SURPLUS';
    const surplus = Math.abs(spent);
    alertText = `Extra ${fmt(surplus)} available!`;
    insightText = `You have ${fmt(surplus)} in extra budget for ${categoryName.toLowerCase()} on top of your ${fmt(limitAmount)} limit. Great job building a buffer!`;
  } else {
    // Linear run-rate projection. For a fully elapsed single-day window
    // (daily / 1-day custom) daysRemaining is 0, so projectedSpend === spent.
    const dailyAverage = spent / daysElapsed;
    projectedSpend = spent + (dailyAverage * daysRemaining);
    const pct = limitAmount > 0 ? Math.round((spent / limitAmount) * 100) : 0;

    const elapsedFraction = totalDays && totalDays > 0 ? daysElapsed / totalDays : 1;
    const hasEnoughSignal = daysElapsed >= MIN_SIGNAL_DAYS || elapsedFraction >= MIN_SIGNAL_FRACTION;
    const projectionTrendsOver =
      limitAmount > 0 && projectedSpend >= limitAmount * RISK_PROJECTION_RATIO && pct >= RISK_MIN_PCT;

    if (spent > limitAmount && limitAmount > 0) {
      status = 'OVER_BUDGET';
    } else if (projectionTrendsOver && hasEnoughSignal) {
      status = 'AT_RISK';
    } else {
      status = 'ON_TRACK';
      // Concerning projection but too early to trust it — stay ON_TRACK without
      // the falsely reassuring "keep it up" copy that used to contradict the number.
      lowConfidence = projectionTrendsOver;
    }

    if (status === 'OVER_BUDGET') {
      const overage = spent - limitAmount;
      alertText = `Over limit by ${fmt(overage)}!`;
      insightText = `You are ${fmt(overage)} over your ${fmt(limitAmount)} limit for ${categoryName.toLowerCase()}.`;
    } else if (status === 'AT_RISK') {
      alertText = `${pct}% budget used, ${daysRemaining} days left.`;
      const n = categoryName.toLowerCase();
      if (n.includes('dining') || n.includes('food') || n.includes('eat')) {
        insightText = "Switch to home cooking to stay under limit.";
      } else if (n.includes('transport') || n.includes('commute') || n.includes('gas')) {
        insightText = "Consider carpooling or public transport to save.";
      } else if (n.includes('shopping') || n.includes('clothes') || n.includes('apparel')) {
        insightText = "Hold off on non-essential purchases for now.";
      } else if (n.includes('entertainment') || n.includes('fun') || n.includes('leisure')) {
        insightText = "Look for free activities or stay in to stay under limit.";
      } else {
        insightText = "Pace your spending to avoid exceeding the limit.";
      }
    } else if (lowConfidence) {
      alertText = `${pct}% budget used, still early.`;
      insightText = `Spending is high early on for ${categoryName}. The forecast will sharpen as the period progresses.`;
    } else {
      alertText = `${pct}% budget used.`;
      insightText = `You're on track for ${categoryName}! Keep it up.`;
    }
  }

  return { projectedSpend, status, insightText, alertText, lowConfidence };
};
