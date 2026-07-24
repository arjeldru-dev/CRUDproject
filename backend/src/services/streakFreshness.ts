/**
 * Freshness rule for a stored gamification streak.
 *
 * `UserGamification.currentStreak` is a snapshot written by
 * `gamificationService.updateStreak` (after a transaction, and whenever the
 * daily pass runs). It is NOT decayed by the mere passage of time: when a user
 * stops logging, the snapshot freezes at its last value, which is frequently
 * equal to their `longestStreak`. Any READ path that surfaces "current streak"
 * for display must therefore expire a stale snapshot instead of trusting it
 * verbatim, otherwise an abandoned streak keeps reading as active.
 *
 * A streak is still current only when its last qualifying day is today or
 * yesterday in the user's timezone — the same `diffDays <= 1` continuation rule
 * `updateStreak` applies when it next runs. Otherwise the true current streak
 * is 0.
 *
 * This module is intentionally dependency-free (Intl only) so it can be unit
 * tested without loading the DB-coupled service layer.
 */

/** Local calendar date (YYYY-MM-DD) for an instant in a timezone. */
function localDateStr(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

/**
 * Returns the streak that is still genuinely "current" as of `now`.
 *
 * @param currentStreak  The stored snapshot value.
 * @param lastStreakDate The last day that counted toward the streak (stored as
 *                       UTC midnight of the user's local date).
 * @param timezone       The user's timezone (defaults to UTC).
 * @param now            Injectable clock for deterministic testing.
 * @returns `currentStreak` when the last qualifying day is today or yesterday;
 *          otherwise `0`.
 */
export function effectiveCurrentStreak(
  currentStreak: number,
  lastStreakDate: Date | null,
  timezone?: string,
  now: Date = new Date(),
): number {
  if (currentStreak <= 0 || !lastStreakDate) return 0;

  const tz = timezone || 'UTC';
  const today = new Date(localDateStr(now, tz) + 'T00:00:00Z');
  const lastMidnightUtc = new Date(
    Date.UTC(
      lastStreakDate.getUTCFullYear(),
      lastStreakDate.getUTCMonth(),
      lastStreakDate.getUTCDate(),
    ),
  );

  const diffDays = Math.round(
    (today.getTime() - lastMidnightUtc.getTime()) / (1000 * 60 * 60 * 24),
  );

  return diffDays === 0 || diffDays === 1 ? currentStreak : 0;
}
