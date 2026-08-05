/**
 * Savings compute service — pure, dependency-free accrual math for the
 * savings/piggybank feature.
 *
 * This module is a **read-only, lazily-computed** projection: it receives plain
 * in-memory data (categories, expenses) — never a Prisma client — and computes
 * per-period savings by re-running the existing `getPeriodWindow` engine to
 * enumerate CLOSED budget periods and the `isDateFunded` resolver to decide
 * which calendar days contributed budget. Because every step is a pure function
 * of its inputs, the computation is deterministic and idempotent (Requirement 7).
 *
 * Task 3.1 implements the closed-period enumeration and `computeCategorySavings`;
 * task 3.6 adds `computePiggybank`; task 3.9 adds `buildTimeSeries`.
 */

/** Upper bound for a cumulative savings balance point (Requirement 6.1). */
const MAX_CUMULATIVE_BALANCE = 999_999_999.99;

/** Default window size when no explicit range is requested (Requirement 6.4). */
const DEFAULT_TIMESERIES_LIMIT = 12;

import {
  BudgetPeriod,
  PeriodOpts,
  PeriodWindow,
  getPeriodWindow,
} from './budgetPeriodService';
import { getLocalDateParts, getUtcDateOfLocalTime } from './gamificationService';
import { isDateFunded, FundedWeekdays } from './fundedDayService';
import { ValidationError } from '../errors';

/** Round to 2 decimals without binary-float drift (e.g. 1.005 → 1.01). */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Shared compute types ────────────────────────────────────────────────────

export interface CategoryInput {
  id: string;
  name: string;
  limitAmount: number;
  period: BudgetPeriod;
  monthlyStartDay: number | null;
  weeklyStartDay: number | null;
  customPeriodDays: number | null;
  anchorDate: Date | null;
  schedule: FundedWeekdays; // effective (defaulted) schedule
  overrides: Map<string, boolean>; // key: 'YYYY-MM-DD'
}

export interface ExpenseInput {
  categoryId: string;
  amount: number; // from Transaction.totalAmount, type = EXPENSE
  createdAt: Date;
}

/**
 * A persisted savings usage. Every usage — regardless of `kind` — is applied as
 * an offset to accrual (`appliedUsage`, Requirement 12.8), lowering the available
 * balance immediately.
 *
 * `kind` (release-to-budget) discriminates two shapes:
 *   - `RELEASE` — the amount was moved into the category's budget for the period
 *     that contains `createdAt`. It is ALSO added into that period's budget when
 *     the period closes (`releasedIntoPeriod`), so an unspent release nets back
 *     to savings at period close (the auto-return).
 *   - `SPEND` (legacy, and the default when `kind` is omitted) — a direct savings
 *     spend that was a real expense; it is a pure offset only and NEVER feeds any
 *     period's budget, so historical savings figures are unchanged by this field.
 */
export interface SavingsUsageInput {
  categoryId: string;
  amount: number; // Savings_Usage.amount, > 0, 2dp
  createdAt: Date; // instant of the usage; a RELEASE is bucketed into the period containing it
  kind?: 'RELEASE' | 'SPEND'; // omitted → treated as legacy SPEND (pure offset)
}

/**
 * Account-wide enable state (Requirement 9). `enabledAt` is the accrual lower
 * bound: only closed periods whose resolved `periodEnd` is at or after this
 * instant contribute; earlier periods contribute exactly `0.00`
 * (Requirements 4.10, 9.4). A `null` `enabledAt` applies no lower bound.
 */
export interface SavingsEnablement {
  enabled: boolean;
  enabledAt: Date | null;
}

export interface PeriodResult {
  periodStart: Date;
  periodEnd: Date;
  fundedBudget: number; // rounded to 2dp, <= limitAmount
  releasedIntoPeriod: number; // Σ RELEASE usage.amount whose createdAt ∈ [start,end), 2dp
  fundedSpend: number;
  periodSavings: number; // max(0, fundedBudget + releasedIntoPeriod - fundedSpend)
  periodShortfall: number; // max(0, fundedSpend - fundedBudget - releasedIntoPeriod)
}

export interface CategorySavings {
  categoryId: string;
  categoryName: string;
  accruedSavings: number; // Category_Accrued_Savings = Σ periodSavings, 2dp
  appliedUsage: number; // Applied_Category_Usage = Σ usage.amount, 2dp
  savingsBalance: number; // available = max(0, accrued − appliedUsage), 2dp
  shortfall: number; // sum of periodShortfall, 2dp
  periods: PeriodResult[]; // contributing (enabled-gated) periods only
  incomplete: boolean; // a period could not be computed (Requirement 9.5)
}

export interface TimeSeriesPoint {
  periodEnd: string; // ISO instant
  cumulativeBalance: number; // running Total_Accrued_Savings as of periodEnd, 2dp
  currentBalance?: number; // NEW — running (accrued − applied usage) as of periodEnd, 2dp
}

/**
 * One cumulative-accrued series for a single category, returned by the
 * `view = 'byCategory'` time-series shape (Requirement 6.11, 6.12). Each point
 * carries that category's cumulative `Category_Accrued_Savings` as of the
 * point's `periodEnd`.
 */
export interface CategorySeries {
  categoryId: string;
  categoryName: string;
  points: TimeSeriesPoint[]; // cumulative accrued for this category
}

// Bound the backward walk so a pathological period configuration can never spin
// forever. Even a DAILY category backfilled over ~270 years stays well under this.
const MAX_PERIOD_ITERATIONS = 100_000;

/** Map a CategoryInput's period fields onto the PeriodOpts shape getPeriodWindow expects. */
function toPeriodOpts(category: CategoryInput): PeriodOpts {
  return {
    monthlyStartDay: category.monthlyStartDay,
    weeklyStartDay: category.weeklyStartDay,
    customPeriodDays: category.customPeriodDays,
    anchorDate: category.anchorDate,
  };
}

/** Advance a UTC instant to the start (local midnight) of the following local calendar day. */
function nextLocalMidnight(instant: Date, tz: string): Date {
  const { year, month, day } = getLocalDateParts(instant, tz);
  // Normalize month/day overflow via a UTC date, then re-anchor to local midnight.
  const dt = new Date(Date.UTC(year, month - 1, day + 1));
  return getUtcDateOfLocalTime(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), 0, 0, 0, tz);
}

/**
 * Enumerate the CONTRIBUTING closed period windows for one category
 * (Requirements 4.1, 4.7, 4.10, 9.4).
 *
 * Starting from the current OPEN window's `periodStart`, repeatedly ask
 * `getPeriodWindow` for the window containing the instant one millisecond before
 * the cursor — which yields the immediately preceding window — walking backwards
 * until the walk's lower bound is reached. Every window produced this way ends at
 * or before `now` and is therefore closed; the current open window
 * (`periodEnd > now`) is never included.
 *
 * **Enable gating** (Requirements 4.10, 9.4): the backward walk is bounded by
 * `max(earliest-transaction bound, Savings_Enabled_At)`, and only windows whose
 * resolved `periodEnd` instant is at or after `enabledAt` are returned. A window
 * whose `periodEnd` precedes `enabledAt` is non-contributing and is excluded, so
 * it contributes exactly `0.00`. When `enabledAt` is `null`, no lower bound is
 * applied and every closed period back to the earliest transaction contributes.
 *
 * Returns the windows in ascending `periodStart` order together with an
 * `incomplete` flag set when the walk had to stop early (a window could not be
 * produced or failed to make progress — Requirement 9.5).
 */
function enumerateClosedPeriods(
  category: CategoryInput,
  earliest: Date,
  now: Date,
  tz: string,
  enabledAt: Date | null,
): { windows: PeriodWindow[]; incomplete: boolean } {
  const opts = toPeriodOpts(category);
  let incomplete = false;

  let current: PeriodWindow;
  try {
    current = getPeriodWindow(category.period, opts, now, tz);
  } catch {
    // Cannot resolve even the current window → no closed periods can be derived.
    return { windows: [], incomplete: true };
  }

  // Bound the backward walk by max(earliest-transaction bound, Savings_Enabled_At)
  // so periods that closed before enablement are never even enumerated.
  const usingEnabledBound =
    enabledAt !== null && enabledAt.getTime() > earliest.getTime();
  const walkLowerBound = usingEnabledBound ? (enabledAt as Date) : earliest;

  // The walk sets `cursor` to each window's `periodStart`, and the window it
  // produces on the next step ENDS at the current `cursor`. When the enable
  // instant is the binding bound, a period whose `periodEnd` lands EXACTLY on
  // `enabledAt` (a boundary coincidence) must still contribute — Requirement 9.4
  // is inclusive ("at or after"). A strict `>` stops the walk at `cursor ===
  // enabledAt` and drops that period, so when `enabledAt` binds we allow the walk
  // to take that one extra step (`cursor === walkLowerBound`) and let the
  // inclusive `periodEnd >= enabledAt` filter below trim anything that ends
  // before the enable instant. The earliest-transaction bound keeps the strict
  // `>` so the un-gated path is unchanged.
  const walkLowerBoundMs = walkLowerBound.getTime();
  const shouldWalk = (cursorMs: number): boolean =>
    usingEnabledBound ? cursorMs >= walkLowerBoundMs : cursorMs > walkLowerBoundMs;

  const windows: PeriodWindow[] = [];
  let cursor = current.periodStart;
  let iterations = 0;

  while (shouldWalk(cursor.getTime())) {
    if (iterations >= MAX_PERIOD_ITERATIONS) {
      incomplete = true;
      break;
    }
    iterations++;

    let window: PeriodWindow;
    try {
      // The instant one ms before the cursor lies in the previous window.
      window = getPeriodWindow(category.period, opts, new Date(cursor.getTime() - 1), tz);
    } catch {
      incomplete = true;
      break;
    }

    // Guard against a configuration that fails to step backwards, which would
    // otherwise loop forever.
    if (window.periodStart.getTime() >= cursor.getTime()) {
      incomplete = true;
      break;
    }

    windows.push(window);
    cursor = window.periodStart;
  }

  // Emit oldest → newest so downstream ordering (and the cumulative series) is stable.
  windows.reverse();

  // Enable gating (Requirements 4.10, 9.4): include a period only when its
  // resolved `periodEnd` is at or after `enabledAt`. Earlier periods contribute
  // exactly 0.00 by being excluded from the contributing set.
  const contributing =
    enabledAt !== null
      ? windows.filter((w) => w.periodEnd.getTime() >= enabledAt.getTime())
      : windows;

  return { windows: contributing, incomplete };
}

/**
 * Compute the per-period savings for a single window (Requirements 4.2–4.6, 4.8, 8.1–8.3).
 *
 * - `fundedDays` = number of funded local calendar days in `[periodStart, periodEnd)`.
 * - `fundedBudget = round2(limitAmount × fundedDays ÷ totalDays)`, capped at `limitAmount`.
 * - `fundedSpend` = sum of expense amounts whose `createdAt` (in `tz`) falls on a funded
 *   day inside the window.
 * - `releasedIntoPeriod` = sum of RELEASE usage amounts whose `createdAt` falls within
 *   `[periodStart, periodEnd)` — released money is added to this period's budget
 *   (release-to-budget). Legacy `SPEND` usages never contribute here.
 * - `periodSavings = max(0, fundedBudget + releasedIntoPeriod − fundedSpend)`;
 *   `periodShortfall = max(0, fundedSpend − fundedBudget − releasedIntoPeriod)`.
 * - When `totalDays === 0` or `limitAmount <= 0`, `fundedBudget` is 0, but any
 *   `releasedIntoPeriod` still flows through so an unspent release can return.
 */
function computePeriodResult(
  category: CategoryInput,
  window: PeriodWindow,
  expenses: ExpenseInput[],
  releases: SavingsUsageInput[],
  tz: string,
): PeriodResult {
  const periodStart = window.periodStart;
  const periodEnd = window.periodEnd;
  const limitAmount = category.limitAmount;

  // Count total and funded local calendar days by walking the window day-by-day.
  let totalDays = 0;
  let fundedDays = 0;
  let dayCursor = periodStart;
  let guard = 0;
  while (dayCursor.getTime() < periodEnd.getTime()) {
    if (guard >= MAX_PERIOD_ITERATIONS) break;
    guard++;
    totalDays++;
    if (isDateFunded(dayCursor, tz, category.schedule, category.overrides)) {
      fundedDays++;
    }
    const next = nextLocalMidnight(dayCursor, tz);
    // Defensive: if we somehow fail to advance, stop to avoid an infinite loop.
    if (next.getTime() <= dayCursor.getTime()) break;
    dayCursor = next;
  }

  // Funded spend: expenses inside the window whose day is funded (order-independent sum).
  let fundedSpend = 0;
  for (const e of expenses) {
    const t = e.createdAt.getTime();
    if (t >= periodStart.getTime() && t < periodEnd.getTime()) {
      if (isDateFunded(e.createdAt, tz, category.schedule, category.overrides)) {
        fundedSpend += e.amount;
      }
    }
  }
  fundedSpend = round2(fundedSpend);

  // Released-into-period: sum RELEASE usages whose instant falls inside the window
  // (order-independent). Money released here raised this period's budget, so it is
  // added to accrual once the period closes — the auto-return term.
  let releasedIntoPeriod = 0;
  for (const r of releases) {
    const t = r.createdAt.getTime();
    if (t >= periodStart.getTime() && t < periodEnd.getTime()) {
      releasedIntoPeriod += r.amount;
    }
  }
  releasedIntoPeriod = round2(releasedIntoPeriod);

  let fundedBudget = 0;
  let periodSavings = 0;
  let periodShortfall = 0;

  if (totalDays > 0 && limitAmount > 0) {
    fundedBudget = round2((limitAmount * fundedDays) / totalDays);
    // Cap at the category limit (Requirement 4.6). Releases raise the effective
    // budget on top of the cap and are intentionally not capped by limitAmount.
    if (fundedBudget > limitAmount) fundedBudget = round2(limitAmount);
    // Released money is fungible with the funded budget: it raises this period's
    // spendable budget and only the truly unspent remainder becomes savings.
    periodSavings = round2(Math.max(0, fundedBudget + releasedIntoPeriod - fundedSpend));
    periodShortfall = round2(Math.max(0, fundedSpend - fundedBudget - releasedIntoPeriod));
  }
  // else: totalDays === 0 or limitAmount <= 0 → savings and shortfall stay 0
  // (Requirement 4.8). A release cannot reach a non-budgeting period in practice
  // (releasing requires prior accrual under a positive limit); `releasedIntoPeriod`
  // is still reported for that window but does not manufacture savings here.

  return {
    periodStart,
    periodEnd,
    fundedBudget,
    releasedIntoPeriod,
    fundedSpend,
    periodSavings,
    periodShortfall,
  };
}

/**
 * Enumerate closed periods for one category and accrue savings (Requirements 4, 8, 9).
 *
 * A category with no expenses yields no closed periods and a balance of 0 without
 * error (Requirement 9.4). Each period is computed inside a guarded block so a
 * single un-computable period is skipped, previously computed periods are retained,
 * and `incomplete` is set true (Requirement 9.5).
 *
 * Contributing periods are gated by `enablement.enabledAt` (Requirements 4.10,
 * 9.4): a closed period contributes only when its `periodEnd` is at or after the
 * enablement instant.
 *
 * Accrued-vs-available split (Requirements 5.1, 5.2, 12.8, 12.9): `accruedSavings`
 * is `Σ periodSavings` (Category_Accrued_Savings). `appliedUsage` is the sum of
 * this category's persisted Savings_Usage amounts (Applied_Category_Usage). The
 * available `savingsBalance` is `max(0, round2(accrued − appliedUsage))`, clamped
 * so it is never negative (Category_Savings_Balance). Because `appliedUsage` is a
 * plain sum, the result is independent of the order usage records are supplied
 * (Requirement 12.19).
 */
export function computeCategorySavings(
  category: CategoryInput,
  expenses: ExpenseInput[],
  usages: SavingsUsageInput[],
  enablement: SavingsEnablement,
  now: Date,
  tz: string,
): CategorySavings {
  const relevant = expenses.filter((e) => e.categoryId === category.id);

  // Applied_Category_Usage: sum of this category's Savings_Usage amounts (2dp),
  // order-independent, regardless of kind — both RELEASE and legacy SPEND lower
  // the available balance immediately (Requirements 12.8, 12.9, 12.19).
  const categoryUsages = usages.filter((u) => u.categoryId === category.id);
  const appliedUsage = round2(categoryUsages.reduce((sum, u) => sum + u.amount, 0));

  // Only RELEASE usages feed a period's budget (release-to-budget); legacy SPEND
  // usages stay pure offsets so historical figures are unchanged (spec Rule 6).
  const releases = categoryUsages.filter((u) => u.kind === 'RELEASE');

  // No transactions → zero accrual, no periods, no error (Requirement 9.4). The
  // available balance is still floored at 0 after applying any usage.
  if (relevant.length === 0) {
    return {
      categoryId: category.id,
      categoryName: category.name,
      accruedSavings: 0,
      appliedUsage,
      savingsBalance: round2(Math.max(0, 0 - appliedUsage)),
      shortfall: 0,
      periods: [],
      incomplete: false,
    };
  }

  const earliest = relevant.reduce(
    (min, e) => (e.createdAt.getTime() < min.getTime() ? e.createdAt : min),
    relevant[0].createdAt,
  );

  const { windows, incomplete: enumerationIncomplete } = enumerateClosedPeriods(
    category,
    earliest,
    now,
    tz,
    enablement.enabledAt,
  );

  let incomplete = enumerationIncomplete;
  const periods: PeriodResult[] = [];

  for (const window of windows) {
    try {
      periods.push(computePeriodResult(category, window, relevant, releases, tz));
    } catch {
      // Skip only the affected period, retain the rest, flag incomplete (Requirement 9.5).
      incomplete = true;
    }
  }

  const accruedSavings = round2(periods.reduce((sum, p) => sum + p.periodSavings, 0));
  const shortfall = round2(periods.reduce((sum, p) => sum + p.periodShortfall, 0));
  // Available = accrued − applied usage, floored at 0 (Category_Savings_Balance,
  // Requirements 5.2, 12.9 — never negative).
  const savingsBalance = round2(Math.max(0, accruedSavings - appliedUsage));

  return {
    categoryId: category.id,
    categoryName: category.name,
    accruedSavings,
    appliedUsage,
    savingsBalance,
    shortfall,
    periods,
    incomplete,
  };
}

/**
 * Aggregate savings across a user's categories for the piggybank card
 * (Requirements 4.9, 5.1, 5.2, 5.3, 5.6, 5.7, 5.8, 8.4, 8.5, 10.6, 1.5).
 *
 * Each category's savings are computed with `computeCategorySavings` inside a
 * guarded block. A category whose stored configuration is invalid (the compute
 * throws) is EXCLUDED from the aggregate and flips `incomplete` to true, while
 * every other category is still returned and the aggregation as a whole succeeds
 * (Requirement 10.6). The aggregate is also `incomplete` when any included
 * category's own result was incomplete (a period could not be computed —
 * Requirement 9.5).
 *
 * - `totalAccruedSavings = round2(Σ category accruedSavings)` (Total_Accrued_Savings,
 *   Requirement 5.1) and `totalSavingsBalance = round2(Σ category savingsBalance)`
 *   (Total_Savings_Balance — available, floored at 0 so it is never negative;
 *   Requirements 4.9, 5.3, 5.4, 12.9).
 * - `aggregateShortfall = round2(Σ category shortfall)`; the shortfall is reported
 *   separately and never reduces either total (Requirements 8.4, 8.5).
 * - Each per-category row reports both `accruedSavings` and the available
 *   `savingsBalance`. The list is ordered by category name in ascending
 *   lexicographic order — deterministic across runs, tie-broken by id
 *   (Requirement 5.6) — and every reported amount is rounded to 2 decimal places
 *   (Requirement 5.7).
 * - No categories → totals 0 and an empty list (Requirement 5.8); an empty schedule
 *   naturally yields a 0 balance for that category (Requirement 1.5).
 */
export function computePiggybank(
  categories: CategoryInput[],
  expensesByCategory: Map<string, ExpenseInput[]>,
  usagesByCategory: Map<string, SavingsUsageInput[]>,
  enablement: SavingsEnablement,
  now: Date,
  tz: string,
): {
  totalSavingsBalance: number;
  totalAccruedSavings: number;
  aggregateShortfall: number;
  categories: Array<{
    categoryId: string;
    categoryName: string;
    accruedSavings: number;
    savingsBalance: number;
  }>;
  incomplete: boolean;
} {
  // Disabled short-circuit (Requirement 9.5): while savings are disabled the
  // piggybank reports exactly 0.00 across the board and an empty per-category
  // list, and NO accrual is computed regardless of any other input. The
  // enabled-path behavior (enabledAt gating, accrued-vs-available split) below
  // is reached only when `enablement.enabled === true`.
  if (!enablement.enabled) {
    return {
      totalSavingsBalance: 0,
      totalAccruedSavings: 0,
      aggregateShortfall: 0,
      categories: [],
      incomplete: false,
    };
  }

  let incomplete = false;
  let totalSavingsBalance = 0;
  let totalAccruedSavings = 0;
  let aggregateShortfall = 0;
  const rows: Array<{
    categoryId: string;
    categoryName: string;
    accruedSavings: number;
    savingsBalance: number;
  }> = [];

  for (const category of categories) {
    let result: CategorySavings;
    try {
      const expenses = expensesByCategory.get(category.id) ?? [];
      const usages = usagesByCategory.get(category.id) ?? [];
      result = computeCategorySavings(category, expenses, usages, enablement, now, tz);
    } catch {
      // Invalid stored config for this category → exclude it, flag incomplete,
      // and keep aggregating the rest (Requirement 10.6).
      incomplete = true;
      continue;
    }

    if (result.incomplete) incomplete = true;

    totalAccruedSavings += result.accruedSavings;
    totalSavingsBalance += result.savingsBalance;
    aggregateShortfall += result.shortfall;
    rows.push({
      categoryId: result.categoryId,
      categoryName: result.categoryName,
      accruedSavings: round2(result.accruedSavings),
      savingsBalance: round2(result.savingsBalance),
    });
  }

  // Deterministic ascending lexicographic order by name, tie-broken by id so that
  // identical inputs always produce identical ordering (Requirement 5.6).
  rows.sort((a, b) => {
    if (a.categoryName < b.categoryName) return -1;
    if (a.categoryName > b.categoryName) return 1;
    if (a.categoryId < b.categoryId) return -1;
    if (a.categoryId > b.categoryId) return 1;
    return 0;
  });

  return {
    // Total_Savings_Balance floored at 0 so it is never negative (Requirement 5.4, 12.9).
    totalSavingsBalance: round2(Math.max(0, totalSavingsBalance)),
    totalAccruedSavings: round2(totalAccruedSavings),
    aggregateShortfall: round2(aggregateShortfall),
    categories: rows,
    incomplete,
  };
}

/**
 * Accumulate an ordered list of contributing periods into a cumulative-accrued
 * time series (Requirements 6.1, 6.2, 6.6). Periods are ordered by ascending
 * `periodEnd` (tie-broken by `periodStart` for deterministic ordering), then a
 * running accrued balance is carried forward. Because every `periodSavings` is
 * `>= 0` the running total is non-decreasing (monotonic — Requirement 6.6); it
 * is rounded to 2dp and clamped into `[0.00, 999,999,999.99]` (Requirement 6.1)
 * at each step.
 */
function accumulatePoints(periods: PeriodResult[]): TimeSeriesPoint[] {
  const ordered = [...periods].sort((a, b) => {
    const endDiff = a.periodEnd.getTime() - b.periodEnd.getTime();
    if (endDiff !== 0) return endDiff;
    return a.periodStart.getTime() - b.periodStart.getTime();
  });

  const points: TimeSeriesPoint[] = [];
  let running = 0;
  for (const p of ordered) {
    running = round2(running + p.periodSavings);
    if (running < 0) running = 0;
    if (running > MAX_CUMULATIVE_BALANCE) running = MAX_CUMULATIVE_BALANCE;
    points.push({
      periodEnd: p.periodEnd.toISOString(),
      cumulativeBalance: running,
    });
  }
  return points;
}

/**
 * Accumulate contributing periods drawn from ACROSS all categories into a single
 * cumulative-accrued total series (Requirements 6.1, 6.2, 6.6; Property 19).
 *
 * Unlike the per-category accumulation, periods from *different* categories can
 * share an identical `periodEnd` (and even an identical `periodStart`). Ordering
 * such tied periods relative to one another is ambiguous, so the plain
 * `(periodEnd, periodStart)` sort used by `accumulatePoints` leaves the
 * intermediate running balance at that tied instant dependent on the order the
 * categories were supplied — a determinism violation (Requirement 7.3).
 *
 * The fix keys off the definition in Requirement 6.1 / design Property 19: each
 * data point represents exactly one contributing closed period and carries the
 * cumulative `Total_Accrued_Savings` **as of that period's `periodEnd`** — i.e.
 * the sum of ALL `periodSavings` whose `periodEnd <=` that instant. Periods are
 * therefore grouped by their `periodEnd` instant; the running cumulative is
 * advanced once per distinct instant by the full sum of that instant's periods,
 * and then one point is emitted per period in the group, each carrying that same
 * full cumulative. This keeps exactly one data point per contributing period
 * (Requirement 6.1) while making every tied point's value the full through-instant
 * cumulative, so the series is byte-for-byte identical no matter how the tied
 * periods were ordered on input (Requirement 7.3). Each addition is re-rounded to
 * 2dp — every `periodSavings` is already an exact-cent value, so `round2` recovers
 * exact integer cents regardless of summation order — and the running total is
 * clamped into `[0.00, 999,999,999.99]` (Requirement 6.1) and is non-decreasing
 * because every `periodSavings >= 0` (Requirement 6.6).
 */
function accumulateTotalPoints(
  periods: PeriodResult[],
  allUsagesByCategory?: Map<string, SavingsUsageInput[]>,
  now?: Date,
): TimeSeriesPoint[] {
  // Group periods by their `periodEnd` instant so tied periods from different
  // categories can be given a single, order-independent through-instant total.
  const byEnd = new Map<number, PeriodResult[]>();
  for (const p of periods) {
    const endMs = p.periodEnd.getTime();
    const bucket = byEnd.get(endMs);
    if (bucket) bucket.push(p);
    else byEnd.set(endMs, [p]);
  }

  const endMsAsc = [...byEnd.keys()].sort((a, b) => a - b);

  // Flatten and sort all usages by createdAt ascending if usage data was provided.
  const allUsages: SavingsUsageInput[] = [];
  if (allUsagesByCategory !== undefined) {
    for (const usageList of allUsagesByCategory.values()) {
      for (const u of usageList) {
        allUsages.push(u);
      }
    }
    allUsages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  const points: TimeSeriesPoint[] = [];
  let running = 0;
  const totalInstants = endMsAsc.length;
  const nowMs = now ? now.getTime() : Date.now();

  for (let i = 0; i < totalInstants; i++) {
    const endMs = endMsAsc[i];
    const isLastInstant = i === totalInstants - 1;
    const bucket = byEnd.get(endMs) as PeriodResult[];

    // Advance the cumulative by the full sum of this instant's periods, re-rounding
    // each addition to 2dp so the result is independent of the (ambiguous) order of
    // tied periods.
    for (const p of bucket) {
      running = round2(running + p.periodSavings);
    }
    if (running < 0) running = 0;
    if (running > MAX_CUMULATIVE_BALANCE) running = MAX_CUMULATIVE_BALANCE;

    let currentBalance: number | undefined;
    if (allUsagesByCategory !== undefined) {
      // For historical points, cutoff is endMs.
      // For the last point in the time series, cutoff includes usages up to now
      // so recent usages created during the current open period are reflected on the latest point.
      const cutoffMs = isLastInstant ? Math.max(endMs, nowMs) : endMs;

      let usageSum = 0;
      for (const u of allUsages) {
        if (u.createdAt.getTime() <= cutoffMs) {
          usageSum += u.amount;
        }
      }
      const roundedUsage = round2(usageSum);
      currentBalance = round2(Math.max(0, Math.min(running, running - roundedUsage)));
      if (currentBalance > MAX_CUMULATIVE_BALANCE) currentBalance = MAX_CUMULATIVE_BALANCE;
    }

    // Emit one data point per contributing period (Requirement 6.1); every point at
    // this instant carries the same full through-instant cumulative.
    const iso = new Date(endMs).toISOString();
    for (let k = 0; k < bucket.length; k++) {
      const pt: TimeSeriesPoint = { periodEnd: iso, cumulativeBalance: running };
      if (currentBalance !== undefined) {
        pt.currentBalance = currentBalance;
      }
      points.push(pt);
    }
  }
  return points;
}

/**
 * Apply the requested windowing to an already-accumulated ascending series
 * (Requirements 6.4, 6.5). With a range, keep only points whose `periodEnd` is
 * within `[rangeStart, rangeEnd]` inclusive; without a range, keep the most
 * recent `min(limit ?? 12, total)` points in ascending order. The cumulative
 * balance carried by each returned point is still measured against the full
 * history, so a windowed view never resets the running total.
 */
function windowPoints(
  points: TimeSeriesPoint[],
  rangeStart?: Date,
  rangeEnd?: Date,
  limit?: number,
): TimeSeriesPoint[] {
  if (rangeStart || rangeEnd) {
    const startMs = rangeStart ? rangeStart.getTime() : -Infinity;
    const endMs = rangeEnd ? rangeEnd.getTime() : Infinity;
    return points.filter((pt) => {
      const t = new Date(pt.periodEnd).getTime();
      return t >= startMs && t <= endMs;
    });
  }

  const requested = limit !== undefined && limit >= 0 ? limit : DEFAULT_TIMESERIES_LIMIT;
  const keep = Math.min(requested, points.length);
  return keep >= points.length ? points : points.slice(points.length - keep);
}

/**
 * Build the cumulative **accrued** savings time series (Requirements 6.1, 6.2,
 * 6.4, 6.5, 6.6, 6.8, 6.11, 6.12). The series plots per-period savings, which now
 * include a period's `releasedIntoPeriod` (release-to-budget, spec Rule 5); the
 * usage *offset* still never enters, and because every `periodSavings >= 0` the
 * running total stays non-decreasing (Requirement 6.6).
 *
 * `view = 'total'` (the default) returns a single `{ view, points }` series that
 * accumulates every contributing closed period across all categories into one
 * running `Total_Accrued_Savings` line (Requirement 6.11). `view = 'byCategory'`
 * returns `{ view, series }` with one `CategorySeries` per category, each
 * carrying that category's own cumulative `Category_Accrued_Savings`
 * (Requirement 6.12); the series list is ordered by category name ascending
 * (tie-broken by id) so identical inputs always order identically.
 *
 * Steps (both views):
 * 1. When disabled, short-circuit to the empty shape for the requested view
 *    (Requirement 9.5) — no accrual is computed regardless of any other input.
 * 2. Reject an inverted range up front — when `rangeStart > rangeEnd` no points
 *    are produced and a `ValidationError` is thrown (Requirement 6.8).
 * 3. Compute contributing periods (reusing `computeCategorySavings`), accumulate
 *    each series with `accumulatePoints`, then window with `windowPoints`.
 *    Categories whose stored config is invalid are skipped so one bad category
 *    cannot break the whole series.
 */
export function buildTimeSeries(
  categories: CategoryInput[],
  expensesByCategory: Map<string, ExpenseInput[]>,
  enablement: SavingsEnablement,
  now: Date,
  tz: string,
  opts?: { view?: 'total' | 'byCategory'; rangeStart?: Date; rangeEnd?: Date; limit?: number },
  // RELEASE usages by category (release-to-budget). Optional and trailing so
  // legacy callers (and the accrued-only property tests) are unchanged: when
  // omitted the series is pure accrual. Only RELEASE usages matter here — the
  // series plots per-period savings (which include `releasedIntoPeriod`), never
  // the offset, so it stays non-decreasing (Requirement 6.6).
  usagesByCategory?: Map<string, SavingsUsageInput[]>,
  allUsagesByCategory?: Map<string, SavingsUsageInput[]>,
): { view: 'total'; points: TimeSeriesPoint[] } | { view: 'byCategory'; series: CategorySeries[] } {
  const view = opts?.view ?? 'total';

  // Disabled short-circuit (Requirement 9.5): while savings are disabled the
  // series has no data points and NO accrual is computed regardless of any other
  // input (including any requested range). The empty shape matches the requested
  // view. The enabled-path enumeration below is reached only when
  // `enablement.enabled === true`.
  if (!enablement.enabled) {
    return view === 'byCategory'
      ? { view: 'byCategory', series: [] }
      : { view: 'total', points: [] };
  }

  const rangeStart = opts?.rangeStart;
  const rangeEnd = opts?.rangeEnd;
  const limit = opts?.limit;

  // Requirement 6.8: an inverted range is invalid — reject, return no points.
  if (rangeStart && rangeEnd && rangeStart.getTime() > rangeEnd.getTime()) {
    throw new ValidationError('rangeStart must not be later than rangeEnd');
  }

  if (view === 'byCategory') {
    // Requirement 6.12: one cumulative-accrued series per category. Each series
    // accumulates only that category's contributing periods.
    const series: CategorySeries[] = [];
    for (const category of categories) {
      let result: CategorySavings;
      try {
        const expenses = expensesByCategory.get(category.id) ?? [];
        // Release-adjusted accrual: RELEASE usages raise the budget of the period
        // they landed in (auto-return), so the series reflects them. The offset
        // side (appliedUsage) is not used by the series (spec Rule 5).
        const usages = usagesByCategory?.get(category.id) ?? [];
        result = computeCategorySavings(category, expenses, usages, enablement, now, tz);
      } catch {
        continue;
      }
      const points = windowPoints(accumulatePoints(result.periods), rangeStart, rangeEnd, limit);
      series.push({
        categoryId: result.categoryId,
        categoryName: result.categoryName,
        points,
      });
    }

    // Deterministic ordering by name ascending, tie-broken by id (Requirement 6.2/5.7-style).
    series.sort((a, b) => {
      if (a.categoryName < b.categoryName) return -1;
      if (a.categoryName > b.categoryName) return 1;
      if (a.categoryId < b.categoryId) return -1;
      if (a.categoryId > b.categoryId) return 1;
      return 0;
    });

    return { view: 'byCategory', series };
  }

  // view === 'total' (Requirement 6.11): accumulate every closed period across
  // all categories into one running Total_Accrued_Savings line. A category with
  // invalid stored config is skipped rather than aborting the whole series.
  const allPeriods: PeriodResult[] = [];
  for (const category of categories) {
    let result: CategorySavings;
    try {
      const expenses = expensesByCategory.get(category.id) ?? [];
      // Release-adjusted accrual across all categories (spec Rule 5).
      const usages = usagesByCategory?.get(category.id) ?? [];
      result = computeCategorySavings(category, expenses, usages, enablement, now, tz);
    } catch {
      continue;
    }
    for (const p of result.periods) allPeriods.push(p);
  }

  // Collapse periods sharing an identical `periodEnd` (possible when different
  // categories close on the same instant) into one cumulative point so the total
  // series is order-independent (Requirement 7.3, Property 19).
  const points = windowPoints(accumulateTotalPoints(allPeriods, allUsagesByCategory), rangeStart, rangeEnd, limit);
  return { view: 'total', points };
}

// ── Savings_PIN format & lockout helpers (Requirement 12) ────────────────────

/**
 * Single-source constants for the Savings_PIN brute-force lockout (Requirement 12.16).
 * Changing either value changes the behavior everywhere it is enforced (the
 * controller's PIN gate reads these rather than re-declaring its own literals).
 */
export const PIN_LOCK_THRESHOLD = 5; // consecutive wrong attempts → lock (Req 12.14)
export const PIN_LOCK_COOLDOWN_MS = 15 * 60_000; // 15 minutes lock duration (Req 12.14, 12.15)

/** The fixed Savings_PIN format: exactly 6 characters, each a digit 0–9 (Requirement 12.2). */
export const PIN_REGEX = /^[0-9]{6}$/;

/**
 * Validate a submitted Savings_PIN's format (Requirement 12.2). Returns the PIN
 * string when it is exactly 6 digits; throws `ValidationError` otherwise.
 *
 * This is pure and does NOT hash — hashing/verification happens in the controller
 * layer that owns `bcrypt`. Only a string matching `PIN_REGEX` is accepted; any
 * non-string input (number, null, undefined, object) or a mis-formatted string
 * (wrong length, non-digit characters, surrounding whitespace) is rejected.
 */
export function validatePinFormat(input: unknown): string {
  if (typeof input !== 'string' || !PIN_REGEX.test(input)) {
    throw new ValidationError('Savings_PIN must be exactly 6 digits (0-9)');
  }
  return input;
}

/**
 * Pure predicate: is savings spending currently PIN-locked? (Requirements 12.14,
 * 12.15, 12.17.)
 *
 * Locked iff `pinLockedUntil` is set AND `now < pinLockedUntil`; a `null` or past
 * `pinLockedUntil` means unlocked. Exposed as a pure function so it can be
 * property-tested without a database or `bcrypt`.
 */
export function isPinLocked(pinLockedUntil: Date | null, now: Date): boolean {
  if (pinLockedUntil === null) return false;
  return now.getTime() < pinLockedUntil.getTime();
}

/**
 * Derive the available amount for one category given its accrued savings and the
 * category's persisted Savings_Usage records (Requirement 12.9):
 * `max(0, round2(accrued − Σ usage.amount))`.
 *
 * Used by the usage endpoint's over-withdrawal check. Because the offset is a
 * plain sum, the result is independent of the order usage records are supplied
 * (Requirement 12.19), and the floor at 0 keeps the available amount from going
 * negative. Independent of the PIN gate.
 */
export function availableForCategory(accrued: number, usages: SavingsUsageInput[]): number {
  const appliedUsage = usages.reduce((sum, u) => sum + u.amount, 0);
  return round2(Math.max(0, accrued - appliedUsage));
}
