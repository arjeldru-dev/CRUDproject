/**
 * Funded_Day_Resolver — pure, dependency-free validation + resolution for the
 * savings/piggybank feature.
 *
 * This module mirrors the conventions of `categoryValidationService.ts`: every
 * validator throws `ValidationError` (→ HTTP 400) on bad input and RETURNS a
 * normalized, storage-ready value on success. It has no Express or Prisma
 * dependency so its rules are unit- and property-testable in isolation.
 *
 * Task 2.1 implements the validation helpers (`validateFundedWeekdays`,
 * `validateOverride`) and `isValidTimezone`. The `isDateFunded` resolver is
 * implemented in task 2.4; its exported types (`FundedWeekdays`,
 * `OverrideRecord`) are declared here so the rest of the feature can build
 * against a stable surface.
 */

export { ValidationError } from '../errors';
import { ValidationError } from '../errors';
import { getLocalDateParts, getLocalDateStr } from './gamificationService';

/** A validated recurring schedule: the set of funded weekdays (0=Sun … 6=Sat). */
export type FundedWeekdays = number[]; // sorted, unique, each in 0..6

export interface OverrideRecord {
  date: string; // 'YYYY-MM-DD' (calendar date in the owner's timezone)
  funded: boolean;
}

// Override dates are bounded to a sane calendar range (Requirement 2.3). The
// bounds are inclusive: 1900-01-01 … 2999-12-31.
const MIN_OVERRIDE_DATE = '1900-01-01';
const MAX_OVERRIDE_DATE = '2999-12-31';

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Days in a given month, accounting for leap years (Gregorian rules). */
function daysInMonth(year: number, month: number): number {
  // month is 1-based here.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Validate a submitted recurring funded-day schedule (Requirement 1.1, 1.4).
 *
 * Accepts an array whose every element is an integer in `0..6` with no
 * duplicates. Returns the same set sorted ascending and duplicate-free (which
 * is naturally bounded to 0–7 entries). Throws `ValidationError` on any
 * non-array input, non-integer / out-of-range value, or duplicate weekday.
 */
export function validateFundedWeekdays(input: unknown): FundedWeekdays {
  if (!Array.isArray(input)) {
    throw new ValidationError('fundedWeekdays must be an array of integers 0–6');
  }

  const seen = new Set<number>();
  for (const value of input) {
    if (!isInt(value) || value < 0 || value > 6) {
      throw new ValidationError('fundedWeekdays must contain only integers in the range 0–6');
    }
    if (seen.has(value)) {
      throw new ValidationError('fundedWeekdays must not contain duplicate weekday values');
    }
    seen.add(value);
  }

  return Array.from(seen).sort((a, b) => a - b);
}

/**
 * Validate a submitted one-off override date + funded state (Requirement 2.1, 2.3).
 *
 * Accepts a well-formed calendar date string in `YYYY-MM-DD` format that lies
 * within `1900-01-01 … 2999-12-31` (inclusive) and a boolean funded state.
 * Returns a normalized `OverrideRecord`. Throws `ValidationError` on a
 * malformed date, a real-but-out-of-range date, or a non-boolean funded state.
 */
export function validateOverride(dateInput: unknown, fundedInput: unknown): OverrideRecord {
  if (typeof dateInput !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    throw new ValidationError('date must be a string in YYYY-MM-DD format');
  }

  const [yearStr, monthStr, dayStr] = dateInput.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) {
    throw new ValidationError('date has an invalid month');
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new ValidationError('date has an invalid day for the given month');
  }

  // Lexicographic comparison is valid for zero-padded YYYY-MM-DD strings.
  if (dateInput < MIN_OVERRIDE_DATE || dateInput > MAX_OVERRIDE_DATE) {
    throw new ValidationError(`date must be within ${MIN_OVERRIDE_DATE} … ${MAX_OVERRIDE_DATE}`);
  }

  if (typeof fundedInput !== 'boolean') {
    throw new ValidationError('funded must be a boolean (funded or unfunded)');
  }

  return { date: dateInput, funded: fundedInput };
}

/**
 * Validate an IANA timezone identifier.
 *
 * Returns `true` iff `tz` is a non-empty string that `Intl.DateTimeFormat`
 * accepts as a timezone (invalid identifiers make the constructor throw a
 * `RangeError`). Never throws.
 */
export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== 'string' || tz.length === 0) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Funded_Day_Resolver (Requirement 3).
 *
 * Decide whether `date` is funded for a category, evaluated in timezone `tz`:
 *   1. If an override exists for that local calendar date (`YYYY-MM-DD` in `tz`),
 *      return its funded value, disregarding the schedule (Requirement 3.1).
 *   2. Otherwise return `true` iff the date's local weekday (0=Sun … 6=Sat,
 *      computed in `tz`) is present in `schedule`, and `false` when the schedule
 *      is empty or does not contain that weekday (Requirement 3.2).
 *
 * `schedule` is the effective schedule; callers substitute all seven weekdays
 * (`[0,1,2,3,4,5,6]`) when a category has no stored schedule (Requirement 1.2).
 *
 * The local date string and weekday are derived from the DST-safe
 * `getLocalDateStr` / `getLocalDateParts` helpers, so the result depends only on
 * the resolved timezone and is identical on repeated evaluation of unchanged
 * inputs (Requirements 3.3, 3.6). The rule is period-type independent — it never
 * consults a period type (Requirement 3.4).
 *
 * Throws `ValidationError` when `tz` is not a valid IANA identifier, returning no
 * funded value (Requirement 3.5).
 */
export function isDateFunded(
  date: Date,
  tz: string,
  schedule: FundedWeekdays,
  overrides: Map<string, boolean>, // key: 'YYYY-MM-DD'
): boolean {
  if (!isValidTimezone(tz)) {
    throw new ValidationError('tz must be a valid IANA timezone identifier');
  }

  // Local calendar date key ('YYYY-MM-DD') in the resolved timezone.
  const localDateStr = getLocalDateStr(date, tz);

  // Precedence: a one-off override for this local date wins over the schedule.
  const override = overrides.get(localDateStr);
  if (override !== undefined) {
    return override;
  }

  // Otherwise: funded iff the local weekday is in the effective schedule. The
  // weekday of a fixed calendar date is timezone-independent once the local
  // Y/M/D is known, so we build a UTC date from the local parts and read its day.
  const { year, month, day } = getLocalDateParts(date, tz);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return schedule.includes(weekday);
}
