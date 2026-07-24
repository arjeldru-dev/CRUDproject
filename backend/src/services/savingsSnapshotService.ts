/**
 * Read-only savings snapshot helper for the gamification system.
 *
 * Gamification needs a few aggregate savings figures (lifetime accrual, current
 * balance, spend count, "no overspend" period count, and windowed accrual for
 * SAVINGS_TARGET challenges) without duplicating the piggybank controller's data
 * assembly. This module loads the same inputs `getPiggybank` uses and delegates
 * to the EXISTING pure compute functions in `savingsService` — it performs NO
 * writes (mirrors the savings read-path guarantee, Requirement 7.1).
 *
 * The loaders below intentionally re-derive the small amount of Prisma loading
 * that `savingsController` also does privately. This keeps the heavily-tested
 * savings write/read controller untouched (it is on the spec's "do not change"
 * list) at the cost of a little duplication; a future refactor could hoist the
 * loaders into a shared data-access module used by both.
 */
import { prisma } from '../config/db';
import {
  computeCategorySavings,
  CategoryInput,
  ExpenseInput,
  SavingsUsageInput,
  SavingsEnablement,
  CategorySavings,
} from './savingsService';
import { BudgetPeriod } from './budgetPeriodService';
import { FundedWeekdays } from './fundedDayService';

/** Aggregate savings figures the badge/challenge evaluators consume. */
export interface UserSavingsSnapshot {
  enabled: boolean;
  totalAccruedSavings: number; // lifetime accrual (Total_Accrued_Savings)
  totalSavingsBalance: number; // current available (Total_Savings_Balance)
  usageCount: number; // count of persisted SavingsUsage rows
  noOverspendPeriodCount: number; // closed periods with periodSavings > 0
}

/** Round to 2 decimals without binary-float drift (mirrors savingsService.round2). */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Effective schedule when a category has no stored row: all seven weekdays. */
const ALL_WEEKDAYS: FundedWeekdays = [0, 1, 2, 3, 4, 5, 6];

/** Savings always enabled — used to enumerate every closed period ungated. */
const ALWAYS_ENABLED: SavingsEnablement = { enabled: true, enabledAt: null };

type CategoryWithFunded = {
  id: string;
  name: string;
  limitAmount: unknown; // Prisma Decimal
  period: string;
  monthlyStartDay: number | null;
  weeklyStartDay: number | null;
  customPeriodDays: number | null;
  anchorDate: Date | null;
  fundedDaySchedule: { fundedWeekdays: number[] } | null;
  fundedDayOverrides: { date: Date; funded: boolean }[];
};

/** Convert a stored `@db.Date` override date to the `'YYYY-MM-DD'` calendar key. */
function overrideDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Map a Prisma category (with funded-day config) onto the pure CategoryInput. */
function toCategoryInput(cat: CategoryWithFunded): CategoryInput {
  const schedule: FundedWeekdays = cat.fundedDaySchedule
    ? [...cat.fundedDaySchedule.fundedWeekdays]
        .filter((w) => Number.isInteger(w) && w >= 0 && w <= 6)
        .sort((a, b) => a - b)
    : [...ALL_WEEKDAYS];

  const overrides = new Map<string, boolean>();
  for (const o of cat.fundedDayOverrides) {
    overrides.set(overrideDateKey(o.date), o.funded);
  }

  return {
    id: cat.id,
    name: cat.name,
    limitAmount: Number(cat.limitAmount),
    period: cat.period as BudgetPeriod,
    monthlyStartDay: cat.monthlyStartDay,
    weeklyStartDay: cat.weeklyStartDay,
    customPeriodDays: cat.customPeriodDays,
    anchorDate: cat.anchorDate,
    schedule,
    overrides,
  };
}

/** Load categories (with funded-day config) + EXPENSE transactions for the user. */
async function loadUserSavingsData(
  userId: string,
): Promise<{ categories: CategoryInput[]; expensesByCategory: Map<string, ExpenseInput[]> }> {
  const cats = (await prisma.category.findMany({
    where: { userId },
    include: { fundedDaySchedule: true, fundedDayOverrides: true },
  })) as unknown as CategoryWithFunded[];

  const categories = cats.map(toCategoryInput);

  const txns = await prisma.transaction.findMany({
    where: { type: 'EXPENSE', category: { userId } },
    select: { categoryId: true, totalAmount: true, createdAt: true },
  });

  const expensesByCategory = new Map<string, ExpenseInput[]>();
  for (const t of txns) {
    if (!t.categoryId) continue;
    const entry: ExpenseInput = {
      categoryId: t.categoryId,
      amount: Number(t.totalAmount),
      createdAt: t.createdAt,
    };
    const bucket = expensesByCategory.get(t.categoryId);
    if (bucket) bucket.push(entry);
    else expensesByCategory.set(t.categoryId, [entry]);
  }

  return { categories, expensesByCategory };
}

/** Load the account-wide savings enablement (disabled when no row exists). */
async function loadEnablement(userId: string): Promise<SavingsEnablement> {
  const settings = await prisma.savingsSettings.findUnique({
    where: { userId },
    select: { enabled: true, enabledAt: true },
  });
  if (!settings || !settings.enabled) {
    return { enabled: false, enabledAt: settings?.enabledAt ?? null };
  }
  return { enabled: true, enabledAt: settings.enabledAt ?? null };
}

/** Load the user's persisted SavingsUsage rows grouped by category. */
async function loadUsagesByCategory(userId: string): Promise<Map<string, SavingsUsageInput[]>> {
  const rows = await prisma.savingsUsage.findMany({
    where: { userId },
    select: { categoryId: true, amount: true, createdAt: true },
  });

  const usagesByCategory = new Map<string, SavingsUsageInput[]>();
  for (const r of rows) {
    if (!r.categoryId) continue;
    const entry: SavingsUsageInput = {
      categoryId: r.categoryId,
      amount: Number(r.amount),
      createdAt: r.createdAt,
    };
    const bucket = usagesByCategory.get(r.categoryId);
    if (bucket) bucket.push(entry);
    else usagesByCategory.set(r.categoryId, [entry]);
  }
  return usagesByCategory;
}

/** Resolve the user's timezone (UserGamification.timezone → UTC fallback). */
async function resolveTimezone(userId: string): Promise<string> {
  const g = await prisma.userGamification.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  return g?.timezone || 'UTC';
}

/**
 * Compute the read-only savings snapshot for a user. When savings is disabled the
 * snapshot returns zeros across the board (matches the piggybank disabled
 * short-circuit) so savings badges do not unlock while savings is off.
 */
export async function getUserSavingsSnapshot(
  userId: string,
  now: Date = new Date(),
): Promise<UserSavingsSnapshot> {
  const enablement = await loadEnablement(userId);
  if (!enablement.enabled) {
    return {
      enabled: false,
      totalAccruedSavings: 0,
      totalSavingsBalance: 0,
      usageCount: 0,
      noOverspendPeriodCount: 0,
    };
  }

  const tz = await resolveTimezone(userId);
  const [{ categories, expensesByCategory }, usagesByCategory, usageCount] = await Promise.all([
    loadUserSavingsData(userId),
    loadUsagesByCategory(userId),
    prisma.savingsUsage.count({ where: { userId } }),
  ]);

  // Single per-category pass. The aggregate totals and the "no overspend" period
  // count are both derived from one `computeCategorySavings` call per category,
  // avoiding the earlier double compute (once via `computePiggybank`, then again
  // in a second loop for the period count). Totals mirror `computePiggybank`
  // exactly: accrued is round2(Σ), balance is round2(max(0, Σ)) so it is never
  // negative, and a category with invalid stored config is skipped.
  let totalAccruedSavings = 0;
  let totalSavingsBalance = 0;
  let noOverspendPeriodCount = 0;
  for (const category of categories) {
    let result: CategorySavings;
    try {
      const expenses = expensesByCategory.get(category.id) ?? [];
      const usages = usagesByCategory.get(category.id) ?? [];
      result = computeCategorySavings(category, expenses, usages, enablement, now, tz);
    } catch {
      continue;
    }
    totalAccruedSavings += result.accruedSavings;
    totalSavingsBalance += result.savingsBalance;
    // Contributing closed periods that ended under budget (periodSavings > 0).
    for (const p of result.periods) {
      if (p.periodSavings > 0) noOverspendPeriodCount++;
    }
  }

  return {
    enabled: true,
    totalAccruedSavings: round2(totalAccruedSavings),
    totalSavingsBalance: round2(Math.max(0, totalSavingsBalance)),
    usageCount,
    noOverspendPeriodCount,
  };
}

/** One CLOSED budget period window for a category (period-aware, spend-agnostic). */
export interface ClosedPeriodWindow {
  categoryId: string;
  limitAmount: number; // the category's configured limit
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Return the window (`periodStart`/`periodEnd`) + limit for every CLOSED budget
 * period across all of a user's categories, period-aware and ungated by savings
 * enablement (this backs the `budget_pct_under` badge, a budget reward independent
 * of savings). Spend is intentionally NOT computed here: the caller measures it
 * from `BUDGET_DEDUCTION` ledger entries so the badge agrees with the streak and
 * the budget-status page (which are net of top-ups/settlements), rather than the
 * savings engine's funded EXPENSE totals.
 *
 * Reuses the pure `computeCategorySavings` closed-period enumeration for the
 * window boundaries; a category with no expenses or an invalid stored config
 * contributes no periods.
 */
export async function getClosedBudgetPeriods(
  userId: string,
  now: Date = new Date(),
): Promise<ClosedPeriodWindow[]> {
  const tz = await resolveTimezone(userId);
  const { categories, expensesByCategory } = await loadUserSavingsData(userId);

  const out: ClosedPeriodWindow[] = [];
  for (const category of categories) {
    if (category.limitAmount <= 0) continue;
    let result: CategorySavings;
    try {
      const expenses = expensesByCategory.get(category.id) ?? [];
      result = computeCategorySavings(category, expenses, [], ALWAYS_ENABLED, now, tz);
    } catch {
      continue;
    }
    for (const p of result.periods) {
      out.push({
        categoryId: category.id,
        limitAmount: category.limitAmount,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
      });
    }
  }
  return out;
}

/**
 * Sum the NEW savings accrued within `[start, end)` for a user, used to evaluate
 * SAVINGS_TARGET challenge progress. A closed period contributes when its
 * `periodEnd` falls in `(start, end]`. Accrual is gated by savings enablement, so
 * a participant with savings disabled accrues 0 in any window.
 */
export async function getAccruedSavingsInWindow(
  userId: string,
  start: Date,
  end: Date,
  now: Date = new Date(),
): Promise<number> {
  const enablement = await loadEnablement(userId);
  if (!enablement.enabled) return 0;

  const tz = await resolveTimezone(userId);
  const { categories, expensesByCategory } = await loadUserSavingsData(userId);

  const startMs = start.getTime();
  const endMs = end.getTime();
  let total = 0;

  for (const category of categories) {
    let result: CategorySavings;
    try {
      const expenses = expensesByCategory.get(category.id) ?? [];
      result = computeCategorySavings(category, expenses, [], enablement, now, tz);
    } catch {
      continue;
    }
    for (const p of result.periods) {
      const pEnd = p.periodEnd.getTime();
      if (pEnd > startMs && pEnd <= endMs) {
        total += p.periodSavings;
      }
    }
  }

  return round2(total);
}
