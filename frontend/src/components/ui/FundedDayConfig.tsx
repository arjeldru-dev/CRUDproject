import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, Plus, Trash2, Check, CalendarX2, CalendarCheck } from 'lucide-react';
import api from '../../lib/api';

/**
 * Funded-day configuration UI (savings-piggybank task 7.7).
 *
 * Rendered within the category create/edit flow on the Budget Categories page
 * (`pages/Categories.tsx`). Lets the owner configure, per category:
 *   - a recurring Funded_Day_Schedule via seven weekday toggles
 *     (0=Sunday … 6=Saturday), and
 *   - a list of one-off Funded_Day_Overrides (add / remove a specific date
 *     marked funded or unfunded).
 *
 * All calls go through the shared axios singleton (`lib/api.ts`), which already
 * attaches the Bearer token and `x-timezone` header:
 *   - GET    /savings/categories/:categoryId/funded-days  — read schedule + overrides
 *   - PUT    /savings/categories/:categoryId/schedule     — replace schedule { fundedWeekdays }
 *   - PUT    /savings/categories/:categoryId/overrides    — upsert one override { date, funded }
 *   - DELETE /savings/categories/:categoryId/overrides/:date — remove one override
 *
 * Validation errors returned by the API (HTTP 400) are surfaced inline
 * (Requirements 1.4, 2.3). Because savings only accrue on funded days, this
 * configuration directly shapes the piggybank/graph results.
 *
 * @see Requirements 1.3, 2.2, 2.5, 2.6
 */

interface FundedDayConfigProps {
  /** The owned category whose funded-day config is being edited. */
  categoryId: string;
  /** Category name, used only for accessible labels. */
  categoryName: string;
}

interface OverrideRecord {
  date: string; // 'YYYY-MM-DD'
  funded: boolean;
}

interface FundedDaysResponse {
  schedule: { fundedWeekdays: number[] };
  overrides: OverrideRecord[];
}

/** Sunday-first weekday labels, index = weekday value (0=Sunday … 6=Saturday). */
const WEEKDAYS: { value: number; short: string; label: string }[] = [
  { value: 0, short: 'S', label: 'Sunday' },
  { value: 1, short: 'M', label: 'Monday' },
  { value: 2, short: 'T', label: 'Tuesday' },
  { value: 3, short: 'W', label: 'Wednesday' },
  { value: 4, short: 'T', label: 'Thursday' },
  { value: 5, short: 'F', label: 'Friday' },
  { value: 6, short: 'S', label: 'Saturday' },
];

/** Pull a user-facing message out of an axios-style error (400 → API message). */
function extractApiError(err: unknown, fallback: string): string {
  const apiError = err as { response?: { data?: { error?: string } } };
  return apiError.response?.data?.error || fallback;
}

const FundedDayConfigComponent: React.FC<FundedDayConfigProps> = ({ categoryId, categoryName }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // ── Schedule state ──────────────────────────────────────────────────
  // The set of funded weekdays currently reflected in the toggles.
  const [fundedWeekdays, setFundedWeekdays] = useState<Set<number>>(new Set());
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleSaved, setScheduleSaved] = useState(false);

  // ── Overrides state ─────────────────────────────────────────────────
  const [overrides, setOverrides] = useState<OverrideRecord[]>([]);
  const [newDate, setNewDate] = useState('');
  const [newFunded, setNewFunded] = useState<boolean>(false);
  const [isAddingOverride, setIsAddingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState('');
  const [removingDate, setRemovingDate] = useState<string | null>(null);

  // ── Load current schedule + overrides ───────────────────────────────
  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await api.get<FundedDaysResponse>(
        `/savings/categories/${categoryId}/funded-days`,
      );
      setFundedWeekdays(new Set(res.data.schedule?.fundedWeekdays ?? []));
      setOverrides(res.data.overrides ?? []);
    } catch (err) {
      setLoadError(extractApiError(err, 'Failed to load funded-day settings.'));
    } finally {
      setIsLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ── Schedule: toggle a weekday locally ──────────────────────────────
  const toggleWeekday = (value: number) => {
    setScheduleSaved(false);
    setScheduleError('');
    setFundedWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  // ── Schedule: persist the current set (replace-all semantics, Req 1.3) ─
  const handleSaveSchedule = async () => {
    setIsSavingSchedule(true);
    setScheduleError('');
    setScheduleSaved(false);
    try {
      const payload = { fundedWeekdays: Array.from(fundedWeekdays).sort((a, b) => a - b) };
      const res = await api.put<{ schedule: { fundedWeekdays: number[] } }>(
        `/savings/categories/${categoryId}/schedule`,
        payload,
      );
      // Reflect the persisted set the server echoes back.
      setFundedWeekdays(new Set(res.data.schedule?.fundedWeekdays ?? payload.fundedWeekdays));
      setScheduleSaved(true);
    } catch (err) {
      // Surface the 400 validation message; stored schedule is left unchanged.
      setScheduleError(extractApiError(err, 'Failed to save schedule. Please try again.'));
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // ── Overrides: add / upsert one date (Req 2.2, 2.4) ─────────────────
  const handleAddOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverrideError('');

    if (!newDate) {
      setOverrideError('Pick a date for the override.');
      return;
    }

    setIsAddingOverride(true);
    try {
      const res = await api.put<OverrideRecord>(
        `/savings/categories/${categoryId}/overrides`,
        { date: newDate, funded: newFunded },
      );
      const saved: OverrideRecord = { date: res.data.date, funded: res.data.funded };
      // Upsert into the local list (one entry per date), keeping it sorted.
      setOverrides((prev) => {
        const others = prev.filter((o) => o.date !== saved.date);
        return [...others, saved].sort((a, b) => a.date.localeCompare(b.date));
      });
      setNewDate('');
      setNewFunded(false);
    } catch (err) {
      setOverrideError(extractApiError(err, 'Failed to save override. Please try again.'));
    } finally {
      setIsAddingOverride(false);
    }
  };

  // ── Overrides: remove one date (Req 2.5, 2.6) ───────────────────────
  const handleRemoveOverride = async (date: string) => {
    setOverrideError('');
    setRemovingDate(date);
    try {
      await api.delete(`/savings/categories/${categoryId}/overrides/${date}`);
      setOverrides((prev) => prev.filter((o) => o.date !== date));
    } catch (err) {
      setOverrideError(extractApiError(err, 'Failed to remove override. Please try again.'));
    } finally {
      setRemovingDate(null);
    }
  };

  // ── Loading ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 py-4 text-muted text-xs font-sans"
        role="status"
        aria-busy="true"
      >
        <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden="true" />
        <span>Loading funded-day settings…</span>
      </div>
    );
  }

  // ── Load error (with retry) ─────────────────────────────────────────
  if (loadError) {
    return (
      <div
        className="flex items-start gap-2 p-3 rounded-xl bg-error/10 border border-error/20 text-error text-xs font-sans"
        role="alert"
      >
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-grow">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={fetchConfig}
            className="mt-2 inline-flex items-center gap-1.5 px-3 h-8 bg-surface-hover text-foreground hover:bg-border/50 font-display font-semibold text-xs rounded-lg transition-[transform,background-color] duration-150 ease-out-emil btn-active-tactile cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-fadeInFast" data-testid="funded-day-config">
      {/* ── Recurring schedule ─────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <span className="block text-xs font-bold font-display text-muted uppercase tracking-wider">
          Funded weekdays
        </span>
        <p className="text-[10px] text-muted/70 -mt-1">
          Savings only accrue on funded days. Deselect the days this budget isn&rsquo;t active.
        </p>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={`Funded weekdays for ${categoryName}`}
        >
          {WEEKDAYS.map((d) => {
            const active = fundedWeekdays.has(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleWeekday(d.value)}
                aria-pressed={active}
                aria-label={d.label}
                title={d.label}
                className={`w-9 h-9 rounded-lg text-xs font-bold font-display transition-[background-color,color,border-color] duration-150 ease-out-emil btn-active-tactile cursor-pointer border ${
                  active
                    ? 'bg-primary text-white border-primary'
                    : 'bg-background text-muted border-border hover:border-primary/40'
                }`}
              >
                {d.short}
              </button>
            );
          })}
        </div>

        {scheduleError && (
          <div
            className="flex items-center gap-2 p-2.5 rounded-xl bg-error/10 border border-error/20 text-error text-xs font-sans"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{scheduleError}</span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={handleSaveSchedule}
            disabled={isSavingSchedule}
            className="inline-flex items-center gap-1.5 px-3 h-9 bg-primary text-white hover:bg-primary-hover font-display font-semibold text-xs rounded-lg transition-[transform,background-color] duration-150 ease-out-emil btn-active-tactile cursor-pointer disabled:opacity-50"
          >
            {isSavingSchedule ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            Save schedule
          </button>
          {scheduleSaved && !isSavingSchedule && (
            <span className="text-xs text-success font-semibold animate-fadeInFast">Saved</span>
          )}
        </div>
      </div>

      {/* ── One-off overrides ──────────────────────────────────────── */}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <span className="block text-xs font-bold font-display text-muted uppercase tracking-wider">
          Date overrides
        </span>
        <p className="text-[10px] text-muted/70 -mt-1">
          Mark a specific date funded or unfunded (holiday, absence, suspension).
        </p>

        {/* Existing overrides list */}
        {overrides.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {overrides.map((o) => (
              <li
                key={o.date}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-background border border-border"
                data-testid="override-row"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {o.funded ? (
                    <CalendarCheck className="w-3.5 h-3.5 text-success shrink-0" aria-hidden="true" />
                  ) : (
                    <CalendarX2 className="w-3.5 h-3.5 text-error shrink-0" aria-hidden="true" />
                  )}
                  <span className="font-mono text-xs text-foreground truncate">{o.date}</span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      o.funded ? 'text-success' : 'text-error'
                    }`}
                  >
                    {o.funded ? 'Funded' : 'Unfunded'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveOverride(o.date)}
                  disabled={removingDate === o.date}
                  aria-label={`Remove override for ${o.date}`}
                  className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10 transition-[transform,background-color] duration-150 ease-out-emil cursor-pointer btn-active-tactile disabled:opacity-50 shrink-0"
                >
                  {removingDate === o.date ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted/70 italic">No date overrides yet.</p>
        )}

        {/* Add override form */}
        <form onSubmit={handleAddOverride} className="flex flex-wrap items-end gap-2 mt-1">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`override-date-${categoryId}`}
              className="text-[10px] font-bold font-display text-muted uppercase tracking-wider"
            >
              Date
            </label>
            <input
              id={`override-date-${categoryId}`}
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="h-9 bg-background border border-border rounded-lg px-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-[border-color,box-shadow] duration-200 ease-out text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`override-state-${categoryId}`}
              className="text-[10px] font-bold font-display text-muted uppercase tracking-wider"
            >
              State
            </label>
            <select
              id={`override-state-${categoryId}`}
              value={newFunded ? 'funded' : 'unfunded'}
              onChange={(e) => setNewFunded(e.target.value === 'funded')}
              className="h-9 bg-background border border-border rounded-lg px-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-[border-color,box-shadow] duration-200 ease-out text-xs"
            >
              <option value="unfunded">Unfunded</option>
              <option value="funded">Funded</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isAddingOverride}
            className="inline-flex items-center gap-1.5 px-3 h-9 bg-surface-hover text-foreground hover:bg-border/50 font-display font-semibold text-xs rounded-lg transition-[transform,background-color] duration-150 ease-out-emil btn-active-tactile cursor-pointer disabled:opacity-50"
          >
            {isAddingOverride ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            Add
          </button>
        </form>

        {overrideError && (
          <div
            className="flex items-center gap-2 p-2.5 rounded-xl bg-error/10 border border-error/20 text-error text-xs font-sans"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{overrideError}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const FundedDayConfig = React.memo(FundedDayConfigComponent);

export default FundedDayConfig;
