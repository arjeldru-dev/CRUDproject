/**
 * Pure, dependency-free validation for transaction inputs (expense / settlement
 * / top-up). No Express, no Prisma — fully unit-testable.
 *
 * Every validator throws `ValidationError` on bad input. The error carries
 * `statusCode = 400`, so the controllers' existing `catch (e) { if (e.statusCode)
 * … }` blocks translate it into a clean 400 instead of leaking a Prisma crash
 * as a 500.
 */

// The amount columns are Decimal(10,2): at most 8 integer digits + 2 decimals
// → 99,999,999.99. Pinning the app bound to the column prevents inserts that
// silently overflow and surface as a 500.
export const MAX_AMOUNT = 99_999_999.99;
// Matches the PendingTransaction.message column (@db.VarChar(255)); longer text
// would overflow the column and surface as a 500 instead of a clean 400.
export const MAX_MESSAGE_LENGTH = 255;
// Splits are allowed to drift a few centavos from the total to absorb rounding
// when an amount is divided across participants.
export const SPLIT_TOLERANCE = 0.05;

// Re-exported from the shared module so existing imports from this service keep
// working while there is a single ValidationError type across the codebase.
export { ValidationError } from '../errors';
import { ValidationError } from '../errors';

export interface RawSplit {
  profileId?: unknown;
  amount?: unknown;
}

export interface NormalizedSplit {
  profileId: string;
  amount: number;
}

/** True when `n` has no more than two decimal places (tolerant of float drift). */
export function hasAtMostTwoDecimals(n: number): boolean {
  const scaled = n * 100;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

/**
 * Validate a monetary amount. Rejects NaN, ±Infinity, non-numbers, non-positive
 * values, amounts above the Decimal(10,2) ceiling, and >2 decimal places.
 * @returns the amount unchanged (already safe for `new Prisma.Decimal(...)`).
 */
export function validateAmount(value: unknown, label = 'Amount'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    // Number.isFinite rejects NaN and ±Infinity, which the old
    // `typeof === 'number'` guard let slip through into a Prisma crash.
    throw new ValidationError(`${label} must be a finite number`);
  }
  if (value <= 0) {
    throw new ValidationError(`${label} must be a positive number`);
  }
  if (value > MAX_AMOUNT) {
    throw new ValidationError(`${label} cannot exceed ${MAX_AMOUNT}`);
  }
  if (!hasAtMostTwoDecimals(value)) {
    throw new ValidationError(`${label} cannot have more than 2 decimal places`);
  }
  return value;
}

/**
 * Validate an expense's split array against the total amount.
 * @returns the normalized splits (typed profileId + amount).
 */
export function validateSplits(splits: unknown, totalAmount: number): NormalizedSplit[] {
  if (!Array.isArray(splits) || splits.length === 0) {
    throw new ValidationError('splits must be a non-empty array');
  }

  const normalized: NormalizedSplit[] = [];
  for (const s of splits as RawSplit[]) {
    if (!s || typeof s !== 'object') {
      throw new ValidationError('Each split must be an object with profileId and amount');
    }
    if (typeof s.profileId !== 'string' || s.profileId.trim() === '') {
      throw new ValidationError('Each split must have a valid profileId');
    }
    if (typeof s.amount !== 'number' || !Number.isFinite(s.amount)) {
      throw new ValidationError('Each split amount must be a finite number');
    }
    if (s.amount < 0) {
      throw new ValidationError('Split amounts cannot be negative');
    }
    if (s.amount > MAX_AMOUNT) {
      throw new ValidationError(`Split amounts cannot exceed ${MAX_AMOUNT}`);
    }
    if (!hasAtMostTwoDecimals(s.amount)) {
      throw new ValidationError('Split amounts cannot have more than 2 decimal places');
    }
    normalized.push({ profileId: s.profileId, amount: s.amount });
  }

  const sum = normalized.reduce((acc, s) => acc + s.amount, 0);
  if (Math.abs(sum - totalAmount) > SPLIT_TOLERANCE) {
    throw new ValidationError('Sum of splits must equal total amount');
  }
  return normalized;
}

/**
 * Validate an optional free-text message. Undefined/null pass through as
 * undefined; strings are length-capped; other types are rejected.
 * @returns the trimmed message, or undefined when none was provided.
 */
export function validateMessage(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError('message must be a string');
  }
  if (value.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`message cannot exceed ${MAX_MESSAGE_LENGTH} characters`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
