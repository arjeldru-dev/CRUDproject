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

export type ForecastStatus = 'NEW' | 'SURPLUS' | 'ON_TRACK' | 'AT_RISK' | 'OVER_BUDGET';

/**
 * Graded trust in the projection, driven by how much of the period has elapsed:
 *   NONE   — nothing spent yet, no projection to trust.
 *   LOW    — too little of the period behind us; the run-rate is volatile.
 *   MEDIUM — past the debounce threshold; the projection is usable.
 *   HIGH   — at least half the period elapsed; the projection is stable.
 */
export type ForecastConfidence = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface ForecastResult {
  projectedSpend: number;
  status: ForecastStatus;
  insightText: string;
  alertText: string;
  /** True when the projection already trends toward overspend but too little of
   *  the period has elapsed to trust it. The category stays ON_TRACK (no hard
   *  alarm) but the copy/UI stay cautious rather than falsely reassuring.
   *  Retained for backward compatibility; prefer `confidence` for new UI. */
  lowConfidence: boolean;
  /** Graded confidence in the projection (see ForecastConfidence). */
  confidence: ForecastConfidence;
  /** Percentage of the limit already spent (0+ integer, clamped at 0). */
  pctUsed: number;
  /** Percentage of the limit the projection lands at (0+ integer). */
  projectedPct: number;
  /** How much the projection exceeds the limit, or 0 if within budget. */
  projectedOverage: number;
  /** Amount the user can spend per remaining day and still finish on budget.
   *  null when there is no limit or no days remain (nothing to pace). */
  recommendedDailySpend: number | null;
}

// A projection is only trustworthy once we have enough of the period behind us.
// We accept EITHER 3 elapsed days (protects long periods from early large
// transactions such as rent) OR a quarter of the period elapsed (lets short
// periods — daily/weekly/short custom cycles — warn proportionally instead of
// never). This replaces a fixed `daysElapsed >= 3` gate that made AT_RISK
// unreachable for daily budgets and blocked ~29% of every weekly cycle.
const MIN_SIGNAL_DAYS = 3;
const MIN_SIGNAL_FRACTION = 0.25;
// Half the period elapsed is treated as a stable, high-confidence read.
const HIGH_CONFIDENCE_FRACTION = 0.5;
const RISK_PROJECTION_RATIO = 0.85;
const RISK_MIN_PCT = 30;

/** Finite-number guard: rejects NaN, ±Infinity, and non-number inputs. */
const isFiniteNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Coerce any input to a finite number, falling back to `fallback` otherwise. */
const toFinite = (n: unknown, fallback = 0): number => (isFiniteNum(n) ? n : fallback);

/** Round to 2 decimal places without binary-float drift (e.g. 1.005 → 1.01). */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const pesos = (n: number): string =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);

/**
 * Heuristic spending forecast for a single budget category over its active period.
 *
 * The point estimate is a linear run-rate: today's average daily spend projected
 * across the days left in the period. Because a raw run-rate is volatile early in
 * a period (one large transaction can dominate), the *grading* is debounced by a
 * confidence gate and the copy adapts to how much of the period has elapsed.
 *
 * The function is pure and defensive: any non-finite, negative, or zero input is
 * normalized to a safe value, so it never returns NaN/Infinity or divides by zero.
 */
export const generateSpendingForecast = (params: ForecastParams): ForecastResult => {
  const categoryName = typeof params.categoryName === 'string' && params.categoryName.trim()
    ? params.categoryName
    : 'this category';

  // ── Normalize inputs ──────────────────────────────────────────────────
  const spent = round2(toFinite(params.spent, 0));
  const limitAmount = Math.max(0, toFinite(params.limitAmount, 0));
  // At least one day must have elapsed; fractional/negative inputs are clamped.
  const daysElapsed = Math.max(1, Math.floor(toFinite(params.daysElapsed, 1)));
  const daysRemaining = Math.max(0, Math.floor(toFinite(params.daysRemaining, 0)));
  const totalDays = Math.max(
    1,
    Math.floor(toFinite(params.totalDays, daysElapsed + daysRemaining) || daysElapsed + daysRemaining),
  );

  // ── Defaults ──────────────────────────────────────────────────────────
  let projectedSpend = 0;
  let status: ForecastStatus = 'NEW';
  let insightText = '';
  let alertText = '';
  let lowConfidence = false;
  let confidence: ForecastConfidence = 'NONE';
  let projectedOverage = 0;
  let recommendedDailySpend: number | null = null;

  const pctUsed = limitAmount > 0 ? Math.max(0, Math.round((spent / limitAmount) * 100)) : 0;

  if (spent === 0) {
    insightText = 'Make transactions to unlock your forecast!';
    return {
      projectedSpend, status, insightText, alertText, lowConfidence,
      confidence, pctUsed: 0, projectedPct: 0, projectedOverage, recommendedDailySpend,
    };
  }

  if (spent < 0) {
    // Net negative spend: refunds, settlement reversals, or a budget top-up have
    // put more back than was spent, leaving room beyond the nominal limit.
    status = 'SURPLUS';
    confidence = 'HIGH';
    const surplus = Math.abs(spent);
    alertText = `Extra ${pesos(surplus)} available!`;
    insightText = `You have ${pesos(surplus)} in extra budget for ${categoryName.toLowerCase()} on top of your ${pesos(limitAmount)} limit. Great job building a buffer!`;
    return {
      projectedSpend: 0, status, insightText, alertText, lowConfidence,
      confidence, pctUsed: 0, projectedPct: 0, projectedOverage, recommendedDailySpend,
    };
  }

  // ── Linear run-rate projection ────────────────────────────────────────
  // For a fully elapsed single-day window (daily / 1-day custom) daysRemaining
  // is 0, so projectedSpend === spent. The projection can never fall below what
  // has already been spent.
  const dailyAverage = spent / daysElapsed;
  projectedSpend = round2(Math.max(spent, spent + dailyAverage * daysRemaining));

  const projectedPct = limitAmount > 0 ? Math.max(0, Math.round((projectedSpend / limitAmount) * 100)) : 0;
  projectedOverage = limitAmount > 0 ? round2(Math.max(0, projectedSpend - limitAmount)) : 0;

  // Amount the user can still spend per remaining day and finish on budget.
  const remainingBudget = limitAmount - spent;
  if (limitAmount > 0 && daysRemaining > 0) {
    recommendedDailySpend = round2(Math.max(0, remainingBudget) / daysRemaining);
  }

  // ── Confidence grading ────────────────────────────────────────────────
  const elapsedFraction = totalDays > 0 ? daysElapsed / totalDays : 1;
  if (daysElapsed >= MIN_SIGNAL_DAYS && elapsedFraction >= HIGH_CONFIDENCE_FRACTION) {
    confidence = 'HIGH';
  } else if (daysElapsed >= MIN_SIGNAL_DAYS || elapsedFraction >= MIN_SIGNAL_FRACTION) {
    confidence = 'MEDIUM';
  } else {
    confidence = 'LOW';
  }
  const hasEnoughSignal = confidence === 'MEDIUM' || confidence === 'HIGH';

  const projectionTrendsOver =
    limitAmount > 0 && projectedSpend >= limitAmount * RISK_PROJECTION_RATIO && pctUsed >= RISK_MIN_PCT;

  // ── Status ────────────────────────────────────────────────────────────
  if (spent > limitAmount && limitAmount > 0) {
    status = 'OVER_BUDGET';
  } else if (projectionTrendsOver && hasEnoughSignal) {
    status = 'AT_RISK';
  } else {
    status = 'ON_TRACK';
    // Concerning projection but too early to trust it — stay ON_TRACK without
    // the falsely reassuring "keep it up" copy that would contradict the number.
    lowConfidence = projectionTrendsOver;
  }

  // ── Copy ──────────────────────────────────────────────────────────────
  const paceTip =
    recommendedDailySpend !== null && recommendedDailySpend > 0
      ? ` Keep it under ${pesos(recommendedDailySpend)}/day for the remaining ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} to stay on budget.`
      : '';

  if (status === 'OVER_BUDGET') {
    const overage = round2(spent - limitAmount);
    alertText = `Over limit by ${pesos(overage)}!`;
    insightText = `You are ${pesos(overage)} over your ${pesos(limitAmount)} limit for ${categoryName.toLowerCase()}.`;
  } else if (status === 'AT_RISK') {
    alertText = `${pctUsed}% budget used, ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left.`;
    insightText = categoryTip(categoryName) + paceTip;
  } else if (lowConfidence) {
    alertText = `${pctUsed}% budget used, still early.`;
    insightText = `Spending is high early on for ${categoryName}. The forecast will sharpen as the period progresses.`;
  } else {
    alertText = `${pctUsed}% budget used.`;
    insightText = `You're on track for ${categoryName}! Keep it up.` + paceTip;
  }

  return {
    projectedSpend, status, insightText, alertText, lowConfidence,
    confidence, pctUsed, projectedPct, projectedOverage, recommendedDailySpend,
  };
};

/** Category-aware nudge for the AT_RISK state. */
function categoryTip(categoryName: string): string {
  const n = categoryName.toLowerCase();
  if (n.includes('dining') || n.includes('food') || n.includes('eat')) {
    return 'Switch to home cooking to stay under limit.';
  }
  if (n.includes('transport') || n.includes('commute') || n.includes('gas')) {
    return 'Consider carpooling or public transport to save.';
  }
  if (n.includes('shopping') || n.includes('clothes') || n.includes('apparel')) {
    return 'Hold off on non-essential purchases for now.';
  }
  if (n.includes('entertainment') || n.includes('fun') || n.includes('leisure')) {
    return 'Look for free activities or stay in to stay under limit.';
  }
  return 'Pace your spending to avoid exceeding the limit.';
}
