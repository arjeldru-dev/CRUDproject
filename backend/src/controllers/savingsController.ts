import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../config/db';
import { ValidationError, HttpError } from '../errors';
import {
  isValidTimezone,
  validateFundedWeekdays,
  validateOverride,
  FundedWeekdays,
} from '../services/fundedDayService';
import {
  buildTimeSeries,
  computePiggybank,
  computeCategorySavings,
  isPinLocked,
  validatePinFormat,
  PIN_LOCK_THRESHOLD,
  PIN_LOCK_COOLDOWN_MS,
  CategoryInput,
  ExpenseInput,
  SavingsEnablement,
  SavingsUsageInput,
} from '../services/savingsService';
import { validateAmount } from '../services/transactionValidationService';
import { BudgetPeriod } from '../services/budgetPeriodService';
import { gamificationService } from '../services/gamificationService';

// Augment the Express Request type with the auth-populated `user` field. This is
// also declared in `middleware/requireAuth.ts`; re-declaring it here (interface
// merging) ensures the augmentation is present whenever this controller is
// compiled directly (e.g. a test that imports only `savingsController`), not
// solely when `requireAuth` happens to be in the module graph.
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

/**
 * Savings_API controller — the thin, non-pure HTTP/data layer for the
 * savings/piggybank feature (Requirement 5, 6, 1.3/1.6/1.7, 2.x, 10.x, 12.x).
 *
 * Responsibilities (mirroring `categoryController` + `categoryValidationService`):
 *   - resolve the User_Timezone;
 *   - load categories, funded-day config, and `EXPENSE` transactions via Prisma;
 *   - hand plain in-memory data to the pure `savingsService` / `fundedDayService`;
 *   - shape/round the JSON response per design.md;
 *   - enforce ownership (`404` absent, `403` foreign) and map `ValidationError` → `400`.
 *
 * The read path performs NO writes (Requirement 7.1, 12.3, 12.4); savings values
 * and the time series are never persisted — they are recomputed on every read.
 */

/** Effective schedule when a category has no stored row: all seven weekdays (Requirement 1.2). */
const ALL_WEEKDAYS: FundedWeekdays = [0, 1, 2, 3, 4, 5, 6];

/**
 * Resolve the User_Timezone for a savings request.
 *
 * Selection order (Requirements 10.4, 10.5, 7.4, 7.5):
 *   1. the `x-timezone` request header when present and a valid IANA identifier;
 *   2. otherwise the stored `UserGamification.timezone` when present and valid;
 *   3. otherwise `UTC`.
 *
 * Always returns a valid IANA identifier and never throws, so downstream
 * timezone-sensitive computation can rely on a usable zone on every path.
 */
export function resolveTimezone(headerTz: unknown, storedTz: string | null | undefined): string {
  if (typeof headerTz === 'string' && isValidTimezone(headerTz)) return headerTz;
  if (typeof storedTz === 'string' && isValidTimezone(storedTz)) return storedTz;
  return 'UTC';
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Convert a stored `@db.Date` override date (a UTC-midnight `Date`) into the
 * `'YYYY-MM-DD'` calendar key the resolver and API responses use.
 */
function overrideDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build a UTC-midnight `Date` for a `'YYYY-MM-DD'` calendar string, matching how
 * Prisma stores/compares an `@db.Date` column.
 */
function dateOnlyToUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** A category row loaded with its funded-day configuration. */
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

/**
 * Map a Prisma category (with its funded-day config) onto the pure
 * `CategoryInput` the compute service consumes. The schedule defaults to all
 * seven weekdays when no row is stored (Requirement 1.2), and overrides become a
 * `'YYYY-MM-DD' → funded` map.
 */
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

/**
 * Load the authenticated user's categories (with funded-day config) and their
 * `EXPENSE` transactions, shaped for the pure compute service. Funded_Spend is
 * sourced from `Transaction.totalAmount` where `type = EXPENSE` (design.md).
 */
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

/** Resolve the timezone for the current request from the header + stored value. */
async function resolveRequestTimezone(req: Request): Promise<string> {
  const gamification = await prisma.userGamification.findUnique({
    where: { userId: req.user.id },
    select: { timezone: true },
  });
  return resolveTimezone(req.headers['x-timezone'], gamification?.timezone);
}

/**
 * Load the account-wide savings enablement for a user (Requirement 9). When no
 * `SavingsSettings` row exists the feature is treated as disabled with no lower
 * bound. `enabledAt` is the accrual lower bound applied by the compute service.
 */
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

/**
 * Load the user's persisted `Savings_Usage` records, grouped by category and
 * shaped for the pure compute service (Requirement 12.8, 12.9). Every usage is
 * applied as an offset to accrual regardless of `kind`; a `RELEASE` usage also
 * feeds the budget of the period it landed in (release-to-budget), so `kind` is
 * selected and threaded through.
 */
async function loadUsagesByCategory(userId: string): Promise<Map<string, SavingsUsageInput[]>> {
  const rows = await prisma.savingsUsage.findMany({
    where: { userId },
    select: { categoryId: true, amount: true, createdAt: true, kind: true },
  });

  const usagesByCategory = new Map<string, SavingsUsageInput[]>();
  for (const r of rows) {
    if (!r.categoryId) continue;
    const entry: SavingsUsageInput = {
      categoryId: r.categoryId,
      amount: Number(r.amount),
      createdAt: r.createdAt,
      kind: r.kind,
    };
    const bucket = usagesByCategory.get(r.categoryId);
    if (bucket) bucket.push(entry);
    else usagesByCategory.set(r.categoryId, [entry]);
  }
  return usagesByCategory;
}

/**
 * Load only the user's `RELEASE` `Savings_Usage` records, grouped by category,
 * for the time-series read (spec Rule 5). The series is release-adjusted accrual,
 * so only `RELEASE` usages (which raise a period's budget) are relevant; legacy
 * `SPEND` offsets never affect the series.
 */
async function loadReleasesByCategory(userId: string): Promise<Map<string, SavingsUsageInput[]>> {
  const rows = await prisma.savingsUsage.findMany({
    where: { userId, kind: 'RELEASE' },
    select: { categoryId: true, amount: true, createdAt: true },
  });

  const releasesByCategory = new Map<string, SavingsUsageInput[]>();
  for (const r of rows) {
    if (!r.categoryId) continue;
    const entry: SavingsUsageInput = {
      categoryId: r.categoryId,
      amount: Number(r.amount),
      createdAt: r.createdAt,
      kind: 'RELEASE',
    };
    const bucket = releasesByCategory.get(r.categoryId);
    if (bucket) bucket.push(entry);
    else releasesByCategory.set(r.categoryId, [entry]);
  }
  return releasesByCategory;
}

/** The disabled-savings piggybank response: zeros + empty list (Requirement 9.5). */
const DISABLED_PIGGYBANK = {
  totalSavingsBalance: 0,
  totalAccruedSavings: 0,
  aggregateShortfall: 0,
  categories: [] as Array<{
    categoryId: string;
    categoryName: string;
    accruedSavings: number;
    savingsBalance: number;
  }>,
  incomplete: false,
};

/**
 * Look up a category by the `:categoryId` route param and enforce ownership.
 * Sends `404` when the category is absent and `403` when it belongs to another
 * user (Requirements 1.7, 2.7, 10.3), returning `null` in both cases so the
 * caller can bail out. Returns the row on success.
 */
async function findOwnedCategory(
  req: Request,
  res: Response,
): Promise<{ id: string; userId: string } | null> {
  const { categoryId } = req.params;
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, userId: true },
  });
  if (!category) {
    res.status(404).json({ error: 'Category not found' });
    return null;
  }
  if (category.userId !== req.user.id) {
    res.status(403).json({ error: 'Forbidden: You do not own this category' });
    return null;
  }
  return category;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

/**
 * GET /api/savings/piggybank
 * Total + per-category savings + aggregate shortfall for the authenticated user
 * (Requirements 5.1–5.8, 8.4, 8.5, 10.6). The per-category list is ordered by
 * name ascending and every amount is rounded to 2dp inside the compute service.
 */
export const getPiggybank = async (req: Request, res: Response) => {
  try {
    const tz = await resolveRequestTimezone(req);
    const enablement = await loadEnablement(req.user.id);

    // Disabled short-circuit (Requirement 9.5): report exactly 0.00 across the
    // board and an empty per-category list; compute nothing and read no
    // categories/transactions/usage.
    if (!enablement.enabled) {
      return res.status(200).json(DISABLED_PIGGYBANK);
    }

    const [{ categories, expensesByCategory }, usagesByCategory] = await Promise.all([
      loadUserSavingsData(req.user.id),
      loadUsagesByCategory(req.user.id),
    ]);

    // The compute service applies the enabledAt lower bound, the accrued-vs-
    // available split, deterministic name ordering, and 2dp rounding. No writes
    // occur on this read path (Requirement 7.1, 12.18).
    const result = computePiggybank(
      categories,
      expensesByCategory,
      usagesByCategory,
      enablement,
      new Date(),
      tz,
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error('Get piggybank error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/savings/timeseries?rangeStart&rangeEnd&limit
 * Cumulative savings series ordered by ascending `periodEnd` (Requirement 6).
 * Malformed query inputs are rejected with `400` (Requirement 7.6); an inverted
 * range (`rangeStart > rangeEnd`) surfaces the service's `ValidationError` → `400`
 * (Requirement 6.8).
 */
export const getTimeSeries = async (req: Request, res: Response) => {
  try {
    const opts: {
      view?: 'total' | 'byCategory';
      rangeStart?: Date;
      rangeEnd?: Date;
      limit?: number;
    } = {};

    const { view, rangeStart, rangeEnd, limit } = req.query;

    // Requirement 6.11/6.12: `view` selects the total or per-category series.
    // Any other value is a malformed input → 400 (Requirement 7.6).
    if (view !== undefined) {
      if (view !== 'total' && view !== 'byCategory') {
        return res.status(400).json({ error: "view must be 'total' or 'byCategory'" });
      }
      opts.view = view;
    }

    if (rangeStart !== undefined) {
      if (typeof rangeStart !== 'string') {
        return res.status(400).json({ error: 'rangeStart must be an ISO date string' });
      }
      const d = new Date(rangeStart);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: 'rangeStart is not a valid date' });
      }
      opts.rangeStart = d;
    }

    if (rangeEnd !== undefined) {
      if (typeof rangeEnd !== 'string') {
        return res.status(400).json({ error: 'rangeEnd must be an ISO date string' });
      }
      const d = new Date(rangeEnd);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: 'rangeEnd is not a valid date' });
      }
      opts.rangeEnd = d;
    }

    if (limit !== undefined) {
      if (typeof limit !== 'string') {
        return res.status(400).json({ error: 'limit must be a non-negative integer' });
      }
      const n = Number(limit);
      if (!Number.isInteger(n) || n < 0) {
        return res.status(400).json({ error: 'limit must be a non-negative integer' });
      }
      opts.limit = n;
    }

    // Requirement 6.8: an inverted range is invalid — reject up front with 400,
    // before any data is read, regardless of the enablement state.
    if (opts.rangeStart && opts.rangeEnd && opts.rangeStart.getTime() > opts.rangeEnd.getTime()) {
      return res.status(400).json({ error: 'rangeStart must not be later than rangeEnd' });
    }

    const effectiveView = opts.view ?? 'total';
    const tz = await resolveRequestTimezone(req);
    const enablement = await loadEnablement(req.user.id);

    // Disabled short-circuit (Requirement 9.5): return an empty series shaped to
    // the requested view; compute nothing and read no categories/transactions.
    if (!enablement.enabled) {
      return res
        .status(200)
        .json(
          effectiveView === 'byCategory'
            ? { view: 'byCategory', series: [] }
            : { view: 'total', points: [] },
        );
    }

    const [{ categories, expensesByCategory }, releasesByCategory, allUsagesByCategory] = await Promise.all([
      loadUserSavingsData(req.user.id),
      loadReleasesByCategory(req.user.id),
      loadUsagesByCategory(req.user.id),
    ]);
    // buildTimeSeries returns a discriminated union keyed by `view`:
    //   { view: 'total', points } | { view: 'byCategory', series }.
    // RELEASE usages raise the budget of the period they landed in, so the
    // release-adjusted accrual series reflects them (spec Rule 5).
    // allUsagesByCategory computes the currentBalance line for the total view.
    const result = buildTimeSeries(
      categories,
      expensesByCategory,
      enablement,
      new Date(),
      tz,
      opts,
      releasesByCategory,
      allUsagesByCategory,
    );
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Get savings time series error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/savings/categories/:categoryId/funded-days
 * Read a category's effective funded-day schedule + overrides (Requirements 1.6, 2).
 * The schedule defaults to all seven weekdays when no row is stored (Requirement 1.2).
 */
export const getFundedDays = async (req: Request, res: Response) => {
  try {
    const category = await findOwnedCategory(req, res);
    if (!category) return;

    const [schedule, overrides] = await Promise.all([
      prisma.fundedDaySchedule.findUnique({ where: { categoryId: category.id } }),
      prisma.fundedDayOverride.findMany({
        where: { categoryId: category.id },
        orderBy: { date: 'asc' },
      }),
    ]);

    const fundedWeekdays: FundedWeekdays = schedule
      ? [...schedule.fundedWeekdays].sort((a, b) => a - b)
      : [...ALL_WEEKDAYS];

    return res.status(200).json({
      schedule: { fundedWeekdays },
      overrides: overrides.map((o) => ({ date: overrideDateKey(o.date), funded: o.funded })),
    });
  } catch (error) {
    console.error('Get funded days error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PUT /api/savings/categories/:categoryId/schedule
 * Replace the category's entire funded-day schedule with the submitted set
 * (Requirements 1.3, 1.4). Invalid input → `400` with the stored schedule left
 * unchanged (validation runs before any write).
 */
export const putSchedule = async (req: Request, res: Response) => {
  try {
    const category = await findOwnedCategory(req, res);
    if (!category) return;

    const fundedWeekdays = validateFundedWeekdays(req.body?.fundedWeekdays);

    await prisma.fundedDaySchedule.upsert({
      where: { categoryId: category.id },
      create: { categoryId: category.id, fundedWeekdays },
      update: { fundedWeekdays },
    });

    return res.status(200).json({ schedule: { fundedWeekdays } });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Put funded-day schedule error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PUT /api/savings/categories/:categoryId/overrides
 * Upsert exactly one override `{ date, funded }` per (category, date)
 * (Requirements 2.2, 2.4). Invalid input → `400` leaving any existing override
 * for that date unchanged (Requirement 2.3).
 */
export const putOverride = async (req: Request, res: Response) => {
  try {
    const category = await findOwnedCategory(req, res);
    if (!category) return;

    const override = validateOverride(req.body?.date, req.body?.funded);
    const dateValue = dateOnlyToUtc(override.date);

    await prisma.fundedDayOverride.upsert({
      where: { categoryId_date: { categoryId: category.id, date: dateValue } },
      create: { categoryId: category.id, date: dateValue, funded: override.funded },
      update: { funded: override.funded },
    });

    return res.status(200).json({ date: override.date, funded: override.funded });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Put funded-day override error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * DELETE /api/savings/categories/:categoryId/overrides/:date
 * Remove one override; the date reverts to the schedule-determined state
 * (Requirement 2.5). Returns `{ existed: false }` when no override was present
 * (Requirement 2.6). A malformed `:date` param → `400` (Requirement 2.3).
 */
export const deleteOverride = async (req: Request, res: Response) => {
  try {
    const category = await findOwnedCategory(req, res);
    if (!category) return;

    // Validate the date param (the funded argument is irrelevant to a delete).
    const { date } = validateOverride(req.params.date, true);
    const dateValue = dateOnlyToUtc(date);

    const result = await prisma.fundedDayOverride.deleteMany({
      where: { categoryId: category.id, date: dateValue },
    });

    return res.status(200).json({ existed: result.count > 0 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Delete funded-day override error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/savings/settings
 * Read the authenticated user's account-wide savings settings
 * (Requirements 9.8, 12.3): `{ enabled, enabledAt, pinSet }`.
 *
 * `pinSet` is a boolean derived solely from whether a `pinHash` is stored — the
 * Savings_PIN value (and its hash) is NEVER returned by this or any endpoint
 * (Requirement 12.3). When no `SavingsSettings` row exists the feature is
 * reported as disabled with no enable timestamp and no PIN set. Owner-only
 * access is inherent: settings are keyed by the authenticated `userId`, so a
 * user can only ever read their own row (Requirement 9.8).
 */
export const getSettings = async (req: Request, res: Response) => {
  try {
    const settings = await prisma.savingsSettings.findUnique({
      where: { userId: req.user.id },
      select: { enabled: true, enabledAt: true, pinHash: true },
    });

    return res.status(200).json({
      enabled: settings?.enabled ?? false,
      enabledAt: settings?.enabledAt ?? null,
      pinSet: Boolean(settings?.pinHash),
    });
  } catch (error) {
    console.error('Get savings settings error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PUT /api/savings/settings
 * Toggle the account-wide Savings_Enabled state (`{ enabled: boolean }`)
 * (Requirements 9.2, 9.3, 9.6, 9.7, 9.8).
 *
 *   - Enabling WHILE DISABLED sets `enabled = true` and `enabledAt = now`,
 *     returning both (Requirement 9.2).
 *   - Enabling WHILE ALREADY ENABLED is idempotent: `enabled` and `enabledAt`
 *     are left unchanged and the existing `enabledAt` is returned (Requirement 9.3).
 *   - Disabling sets `enabled = false`; `enabledAt` is retained so a later
 *     re-enable performed while disabled overwrites it with the new instant
 *     (Requirement 9.6).
 *   - A persistence failure surfaces `500` and leaves BOTH fields unchanged: the
 *     single upsert is atomic, so a failed write persists nothing (Requirement 9.7).
 *
 * Owner-only access is inherent — the row is keyed by the authenticated
 * `userId`, so a non-owner can never target another user's settings; an
 * unauthenticated request is rejected upstream by `requireAuth` (Requirement 9.8,
 * 10.1, 10.2). A malformed `enabled` body → `400` before any write.
 */
export const putSettings = async (req: Request, res: Response) => {
  try {
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const userId = req.user.id;
    const existing = await prisma.savingsSettings.findUnique({
      where: { userId },
      select: { enabled: true, enabledAt: true },
    });

    // Enabling while already enabled is idempotent: leave both fields untouched
    // and echo the existing enable timestamp (Requirement 9.3). No write occurs.
    if (enabled && existing?.enabled) {
      return res.status(200).json({ enabled: true, enabledAt: existing.enabledAt ?? null });
    }

    let saved;
    if (enabled) {
      // Enabling while disabled (or with no row yet): stamp enabledAt = now
      // (Requirement 9.2, 9.6). A failed upsert persists nothing (Requirement 9.7).
      const now = new Date();
      saved = await prisma.savingsSettings.upsert({
        where: { userId },
        create: { userId, enabled: true, enabledAt: now },
        update: { enabled: true, enabledAt: now },
        select: { enabled: true, enabledAt: true },
      });
    } else {
      // Disabling: set enabled = false but RETAIN enabledAt so the compute layer
      // and a later re-enable behave per Requirement 9.6. A failed upsert leaves
      // both fields unchanged (Requirement 9.7).
      saved = await prisma.savingsSettings.upsert({
        where: { userId },
        create: { userId, enabled: false, enabledAt: existing?.enabledAt ?? null },
        update: { enabled: false },
        select: { enabled: true, enabledAt: true },
      });
    }

    return res.status(200).json({ enabled: saved.enabled, enabledAt: saved.enabledAt ?? null });
  } catch (error) {
    console.error('Put savings settings error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PUT /api/savings/settings/pin
 * Set or change the authenticated owner's Savings_PIN (`{ pin }`)
 * (Requirements 12.1, 12.2, 12.3, 12.4).
 *
 *   - The pure `validatePinFormat(pin)` accepts only a string of exactly 6
 *     digits (0-9); any other value throws `ValidationError` → `400` and the
 *     previously stored PIN is left unchanged, since validation runs before any
 *     write (Requirement 12.2).
 *   - A valid PIN is hashed with `bcrypt.hash(pin, saltRounds)` using the SAME
 *     `bcrypt` library and `saltRounds = 10` the existing user auth uses for
 *     `User.passwordHash` (see `authController.ts`); no new hashing dependency is
 *     introduced. The salted, one-way hash is stored in `SavingsSettings.pinHash`
 *     (Requirement 12.1, 12.3).
 *   - Setting/changing the PIN resets the brute-force lockout state:
 *     `failedPinAttempts = 0` and `pinLockedUntil = null`.
 *   - The response is a confirmation only (`{ pinSet: true }`); the PIN value and
 *     its hash are NEVER returned (Requirement 12.1, 12.3).
 *
 * Owner-only access is inherent — the `SavingsSettings` row is keyed by the
 * authenticated `userId`, so a non-owner can never target another user's PIN and
 * the stored PIN is left unchanged; an unauthenticated request is rejected
 * upstream by `requireAuth` (Requirement 12.4, 10.1, 10.2).
 */
export const putPin = async (req: Request, res: Response) => {
  try {
    // Validate format BEFORE any write so an invalid PIN leaves the stored PIN
    // unchanged (Requirement 12.2). Throws ValidationError → 400 below.
    const pin = validatePinFormat(req.body?.pin);

    // Reuse the exact hashing approach used for User.passwordHash in
    // authController.ts: bcrypt with saltRounds = 10 (Requirement 12.1, 12.3).
    const saltRounds = 10;
    const pinHash = await bcrypt.hash(pin, saltRounds);

    const userId = req.user.id;
    await prisma.savingsSettings.upsert({
      where: { userId },
      create: { userId, pinHash, failedPinAttempts: 0, pinLockedUntil: null },
      update: { pinHash, failedPinAttempts: 0, pinLockedUntil: null },
    });

    // Confirmation only — never echo the PIN value or its hash (Requirement 12.1, 12.3).
    return res.status(200).json({ pinSet: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Put savings PIN error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/savings/categories/:categoryId/usage
 * Move accumulated savings into the category's CURRENT-PERIOD budget
 * (release-to-budget), gated by the user-set Savings_PIN (Requirements
 * 12.5–12.15, 12.20, 12.21, 9.5). The release credits the budget instead of
 * recording an expense; unspent released money returns to savings when the
 * period closes (the auto-return handled lazily by the compute service).
 *
 * Request body: `{ amount, pin }`. The legacy `type` field is IGNORED (the
 * SETTLEMENT path is removed) — any release always writes a `TOP_UP`. The
 * response mirrors the existing transaction-creation shape: `{ usage, transaction }`
 * with `transaction.type === 'TOP_UP'`.
 *
 * Ordering of checks (all PIN-gate decisions happen against a row-locked
 * `SavingsSettings` row so concurrent releases for the same user serialize —
 * Requirement 12.21):
 *   1. Validate `amount` (`> 0`, ≤ 2 decimals) and that a `pin` is present →
 *      `400` BEFORE any write (Requirement 12.5, 12.11).
 *   2. Verify the category exists and is owned (`404` / `403`, Requirement 12.20).
 *   3. Inside `prisma.$transaction`, `SELECT … FOR UPDATE` the settings row, then:
 *        - no `pinHash` → `400` "a Savings_PIN must be set first", no writes (12.7);
 *        - currently PIN-locked → lock error, no writes (12.14);
 *        - an expired lock is reset (`failedPinAttempts = 0`, `pinLockedUntil = null`)
 *          before verifying (12.15);
 *        - `bcrypt.compare` mismatch → increment `failedPinAttempts`, set
 *          `pinLockedUntil = now + PIN_LOCK_COOLDOWN_MS` at `PIN_LOCK_THRESHOLD`,
 *          reject `401` (or lock error), no `Savings_Usage`/`Transaction` (12.6, 12.12, 12.14);
 *        - match → reset `failedPinAttempts = 0`, clear `pinLockedUntil` (12.13).
 *   4. Still under the lock: require `enabled` (else `409`, Requirement 9.5),
 *      recompute the category's accrued savings and available balance, and
 *      reject over-withdrawal (`400`) with no rows (12.10).
 *   5. Create a `TOP_UP` `Transaction` + a NEGATIVE `BUDGET_DEDUCTION`
 *      `LedgerEntry` (mirroring `transactionController.createTopUp`, which raises
 *      the category's remaining budget) and a `SavingsUsage { kind: 'RELEASE' }`
 *      row referencing it; commit (Requirement 12.5).
 */
export const postUsage = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    // `type` is intentionally destructured-and-ignored: the SETTLEMENT path is
    // removed, so a release always writes a TOP_UP regardless of any `type` sent.
    const { amount, pin } = req.body ?? {};

    // Requirement 12.11: validate the amount (`> 0`, ≤ 2 decimals) before any
    // write. Throws ValidationError → 400 via the catch below.
    validateAmount(amount, 'amount');

    // Requirement 12.5: a `pin` must be present up front. Correctness is verified
    // under the row lock; here we only guard presence, before any write.
    if (typeof pin !== 'string' || pin.length === 0) {
      return res.status(400).json({ error: 'A Savings_PIN is required' });
    }

    // Requirement 12.20: the category must exist and be owned (404 / 403). This
    // runs before the transaction so a foreign/absent category never opens one.
    const category = await findOwnedCategory(req, res);
    if (!category) return;

    const tz = await resolveRequestTimezone(req);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Requirement 12.21: lock the user's settings row so concurrent usages (and
      // failed-attempt counting) for the same user serialize.
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          pinHash: string | null;
          failedPinAttempts: number;
          pinLockedUntil: Date | null;
          enabled: boolean;
          enabledAt: Date | null;
        }>
      >`
        SELECT id,
               pin_hash            AS "pinHash",
               failed_pin_attempts AS "failedPinAttempts",
               pin_locked_until    AS "pinLockedUntil",
               enabled,
               enabled_at          AS "enabledAt"
        FROM savings_settings
        WHERE user_id = ${userId}::uuid
        FOR UPDATE`;
      const settings = rows[0];

      // ── PIN gate (Requirement 12.5–12.15) ──────────────────────────────────
      // No PIN set → reject with no writes (Requirement 12.7).
      if (!settings || !settings.pinHash) {
        throw new HttpError(400, 'A Savings_PIN must be set first');
      }

      // Currently locked → reject with no writes (Requirement 12.14). Read-only
      // endpoints are unaffected by this lock (Requirement 12.17).
      if (isPinLocked(settings.pinLockedUntil, now)) {
        throw new HttpError(
          423,
          'Savings spending is temporarily locked due to too many incorrect PIN attempts',
        );
      }

      // An expired lock (pinLockedUntil in the past) is treated as unlocked:
      // reset the counters before verifying (Requirement 12.15).
      let baseAttempts = settings.failedPinAttempts;
      if (settings.pinLockedUntil !== null) {
        baseAttempts = 0;
        await tx.savingsSettings.update({
          where: { userId },
          data: { failedPinAttempts: 0, pinLockedUntil: null },
        });
      }

      const pinOk = await bcrypt.compare(pin, settings.pinHash);
      if (!pinOk) {
        // Mismatch → increment attempts; lock at the threshold (Requirement 12.6, 12.12, 12.14).
        const failed = baseAttempts + 1;
        const lockedUntil =
          failed >= PIN_LOCK_THRESHOLD ? new Date(now.getTime() + PIN_LOCK_COOLDOWN_MS) : null;
        await tx.savingsSettings.update({
          where: { userId },
          data: { failedPinAttempts: failed, pinLockedUntil: lockedUntil },
        });
        if (lockedUntil) {
          throw new HttpError(
            423,
            'Too many incorrect PIN attempts. Savings spending is now locked.',
          );
        }
        throw new HttpError(401, 'Incorrect Savings_PIN');
      }

      // Match → reset the lockout state (Requirement 12.13).
      await tx.savingsSettings.update({
        where: { userId },
        data: { failedPinAttempts: 0, pinLockedUntil: null },
      });

      // Requirement 9.5: savings must be enabled to spend.
      if (!settings.enabled) {
        throw new HttpError(409, 'Savings are not enabled');
      }

      // ── Over-withdrawal check (Requirement 12.10) ──────────────────────────
      // Recompute this category's accrued savings and available balance from
      // tx-loaded data (fresh under the lock). The PIN gate never alters this math.
      const catRow = (await tx.category.findUnique({
        where: { id: category.id },
        include: { fundedDaySchedule: true, fundedDayOverrides: true },
      })) as unknown as CategoryWithFunded | null;
      if (!catRow) {
        throw new HttpError(404, 'Category not found');
      }
      const catInput = toCategoryInput(catRow);

      const txns = await tx.transaction.findMany({
        where: { type: 'EXPENSE', categoryId: category.id },
        select: { categoryId: true, totalAmount: true, createdAt: true },
      });
      const expenses: ExpenseInput[] = txns
        .filter((t) => t.categoryId)
        .map((t) => ({
          categoryId: t.categoryId as string,
          amount: Number(t.totalAmount),
          createdAt: t.createdAt,
        }));

      const usageRows = await tx.savingsUsage.findMany({
        where: { userId, categoryId: category.id },
        select: { categoryId: true, amount: true, createdAt: true, kind: true },
      });
      const usages: SavingsUsageInput[] = usageRows.map((u) => ({
        categoryId: u.categoryId,
        amount: Number(u.amount),
        createdAt: u.createdAt,
        kind: u.kind,
      }));

      const enablement: SavingsEnablement = {
        enabled: settings.enabled,
        enabledAt: settings.enabledAt ?? null,
      };
      const catSavings = computeCategorySavings(catInput, expenses, usages, enablement, now, tz);
      // `savingsBalance` is already max(0, round2(accrued − applied usage)).
      const available = catSavings.savingsBalance;

      // Compare in integer cents so a valid 2dp amount never trips a binary-float
      // artifact at the boundary (e.g. amount === available).
      if (Math.round(amount * 100) > Math.round(available * 100)) {
        throw new HttpError(
          400,
          'Amount exceeds the available savings balance for this category',
        );
      }

      // ── Persist the release (Requirement 12.5) ─────────────────────────────
      // Mirror `transactionController.createTopUp`: a TOP_UP Transaction plus a
      // NEGATIVE BUDGET_DEDUCTION LedgerEntry. `getBudgetStatus` sums
      // BUDGET_DEDUCTION entries, so a negative value lowers `spent` and raises
      // the category's remaining budget for the current period. The SavingsUsage
      // is tagged `RELEASE` so the compute service adds it back into that period's
      // accrual at close (auto-return), while it lowers the visible balance now.
      const transaction = await tx.transaction.create({
        data: { creatorId: userId, categoryId: category.id, totalAmount: amount, type: 'TOP_UP' },
      });
      await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          userId,
          friendProfileId: null,
          amountChange: -amount,
          type: 'BUDGET_DEDUCTION',
        },
      });
      const usage = await tx.savingsUsage.create({
        data: {
          userId,
          categoryId: category.id,
          amount,
          transactionId: transaction.id,
          kind: 'RELEASE',
        },
      });

      return { usage, transaction };
    });

    // Releasing savings creates a Transaction + SavingsUsage row that affect the
    // savings-based rewards (savings_first_spend / savings_usage_count / balance
    // badges) and SAVINGS_TARGET challenge progress. Mirror the transaction flow
    // and re-evaluate gamification fire-and-forget so it never blocks the
    // response and a failure here can never fail the release.
    gamificationService.triggerGamificationUpdates(userId).catch(console.error);

    return res.status(201).json({
      usage: {
        id: result.usage.id,
        categoryId: result.usage.categoryId,
        amount: Number(result.usage.amount),
        createdAt: result.usage.createdAt,
        transactionId: result.usage.transactionId,
      },
      transaction: {
        id: result.transaction.id,
        type: result.transaction.type,
        totalAmount: Number(result.transaction.totalAmount),
      },
    });
  } catch (error) {
    // ValidationError and HttpError both carry an explicit statusCode.
    if (error instanceof ValidationError || error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Post savings usage error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Reject any attempt to create/update/delete a savings value or request a
 * withdrawal (Requirements 12.1, 12.2, 12.5). V1 savings are read-only and
 * derived solely from categories/transactions/funded-day config — no savings
 * balance or time-series value is ever persisted, and no withdrawal is created.
 * Wired by the router for savings-value write/withdrawal paths.
 */
export const rejectSavingsModification = (_req: Request, res: Response) =>
  res.status(405).json({ error: 'Modifying savings values is not supported' });
