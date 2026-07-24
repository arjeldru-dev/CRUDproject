import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';

/**
 * Lazily fetch an AI savings nudge AFTER the piggybank has loaded.
 *
 * Design (feature-spec-ai-savings-notifications, Group 1):
 *   - Off the critical render path: the piggybank totals render first; this only
 *     adds a one-line nudge band on top.
 *   - Derives a coarse trend from the total time-series tail (last two points'
 *     cumulative balances) so milestone/growth/stalled can be detected, then
 *     POSTs the compact summary to /insights/savings.
 *   - Fully graceful: any failure (AI disabled, 429, network, timeseries miss) is
 *     a silent no-op — the band simply shows the deterministic line or nothing.
 *   - Never fetches when savings are disabled.
 */

export type SavingsNudgeReason = 'MILESTONE' | 'GROWTH' | 'SHORTFALL' | 'STALLED' | 'NONE';

/** The already-computed piggybank figures this hook narrates. */
export interface SavingsNudgeSource {
  enabled: boolean;
  totalSavingsBalance: number;
  totalAccruedSavings: number;
  aggregateShortfall: number;
  topCategories: Array<{ categoryName: string; accruedSavings: number }>;
}

interface UseSavingsNudgeResult {
  reason: SavingsNudgeReason;
  /** Non-empty only when there is something worth showing. */
  nudgeText: string;
  source: 'ai' | 'fallback';
  loading: boolean;
}

interface TimeSeriesPoint {
  periodEnd: string;
  cumulativeBalance: number;
}

const EMPTY: UseSavingsNudgeResult = { reason: 'NONE', nudgeText: '', source: 'fallback', loading: false };

/** Round a peso figure to the nearest ₱500 so small drifts reuse the same fetch. */
function bucket500(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) / 500) * 500;
}

export function useSavingsNudge(source: SavingsNudgeSource | null): UseSavingsNudgeResult {
  const [result, setResult] = useState<UseSavingsNudgeResult>(EMPTY);

  // Refetch only when the coarse state meaningfully changes, not on every render.
  const signature =
    source && source.enabled
      ? `${bucket500(source.totalAccruedSavings)}:${bucket500(source.aggregateShortfall)}:${bucket500(
          source.totalSavingsBalance,
        )}`
      : 'disabled';
  const lastSignature = useRef<string>('');

  useEffect(() => {
    if (!source || !source.enabled) {
      setResult(EMPTY);
      lastSignature.current = signature;
      return;
    }
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;

    let cancelled = false;
    setResult((prev) => ({ ...prev, loading: true }));

    const run = async () => {
      // Best-effort trend from the total series tail; absence just limits which
      // reasons can fire (shortfall still works without it).
      let trend: { previousAccrued: number; latestAccrued: number } | undefined;
      try {
        const ts = await api.get('/savings/timeseries', { params: { view: 'total', limit: 2 } });
        const points: TimeSeriesPoint[] = ts.data?.points ?? [];
        if (points.length >= 2) {
          trend = {
            previousAccrued: points[points.length - 2].cumulativeBalance,
            latestAccrued: points[points.length - 1].cumulativeBalance,
          };
        } else if (points.length === 1) {
          trend = { previousAccrued: 0, latestAccrued: points[0].cumulativeBalance };
        }
      } catch {
        // Ignore — proceed without a trend.
      }
      if (cancelled) return;

      const payload = {
        enabled: source.enabled,
        totalSavingsBalance: source.totalSavingsBalance,
        totalAccruedSavings: source.totalAccruedSavings,
        aggregateShortfall: source.aggregateShortfall,
        topCategories: [...source.topCategories]
          .sort((a, b) => b.accruedSavings - a.accruedSavings)
          .slice(0, 3),
        ...(trend ? { trend } : {}),
      };

      try {
        const res = await api.post('/insights/savings', payload);
        if (cancelled) return;
        const { reason, nudgeText, source: src } = res.data ?? {};
        setResult({
          reason: (reason as SavingsNudgeReason) ?? 'NONE',
          nudgeText: typeof nudgeText === 'string' ? nudgeText : '',
          source: src === 'ai' ? 'ai' : 'fallback',
          loading: false,
        });
      } catch {
        // Silent: the nudge is an enhancement, not a dependency.
        if (!cancelled) setResult(EMPTY);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return result;
}
