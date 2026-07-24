/**
 * Pure, dependency-free validation + normalization for budget categories.
 *
 * Centralizes every rule the create/update endpoints enforce so the controller
 * stays thin and the rules are unit-testable in isolation (no Express, no DB).
 *
 * All validators throw `ValidationError` (→ HTTP 400) on bad input and RETURN a
 * normalized, storage-ready value on success (trimmed name, rounded amount,
 * period config with inapplicable fields nulled out).
 */

export const BUDGET_PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

// The `limit_amount` column is Decimal(10,2): at most 8 integer digits + 2
// decimals → 99,999,999.99. Keeping the app bound in lockstep with the column
// turns what used to be a Prisma insert crash (HTTP 500) into a clean 400.
export const MAX_LIMIT = 99_999_999.99;
export const MAX_NAME_LENGTH = 30;

// Re-exported from the shared module so existing imports from this service keep
// working while there is a single ValidationError type across the codebase.
export { ValidationError } from '../errors';
import { ValidationError } from '../errors';

export interface NormalizedPeriodConfig {
  period: BudgetPeriod;
  monthlyStartDay: number | null;
  weeklyStartDay: number | null;
  customPeriodDays: number | null;
  anchorDate: Date | null;
}

/** Merged view of period params from the request body over the existing row. */
export interface PeriodSource {
  monthlyStartDay?: unknown;
  weeklyStartDay?: unknown;
  customPeriodDays?: unknown;
  anchorDate?: unknown;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

export const isBudgetPeriod = (v: unknown): v is BudgetPeriod =>
  typeof v === 'string' && (BUDGET_PERIODS as readonly string[]).includes(v);

/** Round to 2 decimals without binary-float drift (e.g. 1.005 → 1.01). */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Validate and normalize a category name.
 * @returns the trimmed name.
 */
export function validateName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError('name must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('name cannot be empty');
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`name cannot exceed ${MAX_NAME_LENGTH} characters`);
  }
  return trimmed;
}

/**
 * Validate and normalize a budget limit.
 * @returns the amount rounded to 2 decimal places (matching the DB column).
 */
export function validateLimitAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    // Number.isFinite rejects NaN and ±Infinity, which the old
    // `typeof === 'number'` guard let slip through into a Prisma crash.
    throw new ValidationError('limitAmount must be a finite number');
  }
  if (value < 0) {
    throw new ValidationError('limitAmount must be a non-negative number');
  }
  if (value > MAX_LIMIT) {
    throw new ValidationError(`limitAmount cannot exceed ${MAX_LIMIT}`);
  }
  return round2(value);
}

/**
 * Normalize a YYYY-MM-DD (or ISO) string to a pure UTC-midnight Date.
 *
 * The date is taken from the value's UTC calendar parts, so a full ISO string
 * carrying an offset (e.g. "2026-07-01T23:00:00-05:00") is interpreted by its
 * UTC date (→ 2026-07-02), not its local one. Callers should send a date-only
 * "YYYY-MM-DD" anchor to avoid that ambiguity; the frontend already does.
 */
export function parseAnchorDate(value: unknown): Date {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new ValidationError('anchorDate must be a valid date');
  }
  const d = new Date(value as string);
  if (isNaN(d.getTime())) throw new ValidationError('anchorDate must be a valid date');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Validate the period configuration and null out fields that don't apply to
 * the chosen period. Throws ValidationError (→ 400) on invalid input.
 */
export function normalizePeriodConfig(period: BudgetPeriod, src: PeriodSource): NormalizedPeriodConfig {
  const base: NormalizedPeriodConfig = {
    period,
    monthlyStartDay: null,
    weeklyStartDay: null,
    customPeriodDays: null,
    anchorDate: null,
  };

  switch (period) {
    case 'DAILY':
      return base;

    case 'WEEKLY': {
      const wsd = src.weeklyStartDay;
      if (!isInt(wsd) || wsd < 0 || wsd > 6) {
        throw new ValidationError('weeklyStartDay must be an integer 0–6 for a weekly budget');
      }
      return { ...base, weeklyStartDay: wsd };
    }

    case 'MONTHLY': {
      const msd = src.monthlyStartDay;
      if (msd === undefined || msd === null) {
        return base; // defaults to the calendar 1st
      }
      if (!isInt(msd) || !(msd === -1 || (msd >= 1 && msd <= 31))) {
        throw new ValidationError('monthlyStartDay must be an integer 1–31, or -1 for "last day of month"');
      }
      return { ...base, monthlyStartDay: msd };
    }

    case 'CUSTOM': {
      const days = src.customPeriodDays;
      if (!isInt(days) || days < 1 || days > 366) {
        throw new ValidationError('customPeriodDays must be an integer 1–366 for a custom budget');
      }
      if (src.anchorDate === undefined || src.anchorDate === null) {
        throw new ValidationError('anchorDate is required for a custom budget');
      }
      return { ...base, customPeriodDays: days, anchorDate: parseAnchorDate(src.anchorDate) };
    }

    default:
      throw new ValidationError(`period must be one of: ${BUDGET_PERIODS.join(', ')}`);
  }
}
