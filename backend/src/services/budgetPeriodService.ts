import { getLocalDateParts, getUtcDateOfLocalTime } from './gamificationService';

/**
 * Pure period-window calculator for budget categories.
 *
 * Given a category's period configuration, the current instant, and the user's
 * IANA timezone, it returns the active spending window plus the forecast inputs
 * (daysElapsed / daysRemaining) that `generateSpendingForecast` expects.
 *
 * All boundaries are computed at LOCAL midnight in the user's timezone using the
 * DST-safe helpers from gamificationService, then expressed as UTC instants.
 *
 * This module performs NO I/O and is fully unit-testable.
 */

export type BudgetPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

export interface PeriodOpts {
  monthlyStartDay?: number | null; // 1–31 (clamped), or -1 = "last day of month"; null/1 = calendar month
  weeklyStartDay?: number | null;  // 0=Sunday … 6=Saturday
  customPeriodDays?: number | null; // cycle length in days
  anchorDate?: Date | null;         // reference start date for CUSTOM cycles (a @db.Date value)
}

export interface PeriodWindow {
  periodStart: Date;     // UTC instant of local window start (inclusive)
  periodEnd: Date;       // UTC instant of local window end (exclusive)
  daysElapsed: number;   // whole local days since periodStart, min 1
  daysRemaining: number; // whole local days until periodEnd, min 0
  totalDays: number;     // length of the window in days
  periodLabel: string;   // "Today", "This week", "This month", "This 14-day cycle"
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Number of days in a 1-based month (handles leap years). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Calendar arithmetic on a date-only triple; normalizes month/day overflow. */
function addCalendarDays(year: number, month: number, day: number, delta: number) {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Resolve the effective start day for a month, clamping to the month's length. */
function resolveMonthlyDay(year: number, month: number, monthlyStartDay: number): number {
  const dim = daysInMonth(year, month);
  if (monthlyStartDay === -1) return dim; // "last day of month"
  return Math.min(monthlyStartDay, dim);
}

/** Day-of-week (0=Sunday) for a local calendar date. */
function dayOfWeek(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Compute the active budget window for a category.
 */
export function getPeriodWindow(
  period: BudgetPeriod,
  opts: PeriodOpts,
  now: Date,
  timezone: string
): PeriodWindow {
  const tz = timezone || 'UTC';
  const nowParts = getLocalDateParts(now, tz);
  const { year, month, day } = nowParts;

  let start: Date;
  let end: Date;
  let periodLabel: string;

  switch (period) {
    case 'DAILY': {
      const tomorrow = addCalendarDays(year, month, day, 1);
      start = getUtcDateOfLocalTime(year, month, day, 0, 0, 0, tz);
      end = getUtcDateOfLocalTime(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0, 0, tz);
      periodLabel = 'Today';
      break;
    }

    case 'WEEKLY': {
      const startDow = ((opts.weeklyStartDay ?? 0) % 7 + 7) % 7;
      const currentDow = dayOfWeek(year, month, day);
      const back = (currentDow - startDow + 7) % 7;
      const s = addCalendarDays(year, month, day, -back);
      const e = addCalendarDays(s.year, s.month, s.day, 7);
      start = getUtcDateOfLocalTime(s.year, s.month, s.day, 0, 0, 0, tz);
      end = getUtcDateOfLocalTime(e.year, e.month, e.day, 0, 0, 0, tz);
      periodLabel = 'This week';
      break;
    }

    case 'CUSTOM': {
      const n = Math.max(1, opts.customPeriodDays ?? 1);
      // Treat the @db.Date anchor as a calendar date (its UTC parts).
      const anchor = opts.anchorDate ?? now;
      const aYear = anchor.getUTCFullYear();
      const aMonth = anchor.getUTCMonth() + 1;
      const aDay = anchor.getUTCDate();

      // Cycle index = number of whole LOCAL calendar days between the anchor date
      // and `now`'s local date, divided by the cycle length. Counting local
      // calendar days (via stable UTC-midnight day numbers) rather than dividing a
      // raw millisecond delta by 24h keeps the index correct across DST
      // transitions, where accumulated offset drift would otherwise shift the
      // boundary by up to an hour and make `getPeriodWindow` return a window that
      // does not actually contain `now` near local midnight.
      const anchorDayNumber = Date.UTC(aYear, aMonth - 1, aDay) / MS_PER_DAY;
      const nowDayNumber = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day) / MS_PER_DAY;
      const diffDays = nowDayNumber - anchorDayNumber;
      const k = diffDays < 0 ? 0 : Math.floor(diffDays / n); // future anchor → current window is the first one
      const s = addCalendarDays(aYear, aMonth, aDay, k * n);
      const e = addCalendarDays(s.year, s.month, s.day, n);
      start = getUtcDateOfLocalTime(s.year, s.month, s.day, 0, 0, 0, tz);
      end = getUtcDateOfLocalTime(e.year, e.month, e.day, 0, 0, 0, tz);
      periodLabel = `This ${n}-day cycle`;
      break;
    }

    case 'MONTHLY':
    default: {
      const msd = opts.monthlyStartDay ?? 1;
      const boundaryThisMonth = resolveMonthlyDay(year, month, msd);

      let sYear: number;
      let sMonth: number;
      let sDay: number;
      if (day >= boundaryThisMonth) {
        sYear = year;
        sMonth = month;
        sDay = boundaryThisMonth;
      } else {
        const p = prevMonth(year, month);
        sYear = p.year;
        sMonth = p.month;
        sDay = resolveMonthlyDay(p.year, p.month, msd);
      }

      const nm = nextMonth(sYear, sMonth);
      const eDay = resolveMonthlyDay(nm.year, nm.month, msd);
      start = getUtcDateOfLocalTime(sYear, sMonth, sDay, 0, 0, 0, tz);
      end = getUtcDateOfLocalTime(nm.year, nm.month, eDay, 0, 0, 0, tz);
      periodLabel = 'This month';
      break;
    }
  }

  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY));

  // daysElapsed counts whole LOCAL calendar days from the window start to `now`.
  // Deriving it from local calendar dates (rather than dividing a raw millisecond
  // delta by 24h) keeps it correct across DST transitions, where a local day can
  // be 23 or 25 hours long and a fixed-ms floor would drift by a day near midnight.
  const startParts = getLocalDateParts(start, tz);
  const startDayNumber = Date.UTC(startParts.year, startParts.month - 1, startParts.day) / MS_PER_DAY;
  const nowDayNumber = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day) / MS_PER_DAY;
  const rawCurrentDay = nowDayNumber - startDayNumber + 1;
  const daysElapsed = Math.min(totalDays, Math.max(1, rawCurrentDay));
  const daysRemaining = Math.max(0, totalDays - daysElapsed);

  return { periodStart: start, periodEnd: end, daysElapsed, daysRemaining, totalDays, periodLabel };
}
