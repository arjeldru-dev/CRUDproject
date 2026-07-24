import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';

/**
 * Lazily fetch AI-enhanced spending insights AFTER budget data has loaded.
 *
 * Design (feature spec):
 *   - Off the critical render path: the Dashboard shows heuristic `insightText`
 *     first, then swaps in AI copy for notable categories when this resolves.
 *   - Batches all notable categories into ONE POST /api/insights/spending call.
 *   - Fully graceful: any failure (AI disabled, 429, network) is a silent no-op —
 *     the returned map simply stays empty and the UI keeps its heuristic text.
 *
 * Notable = OVER_BUDGET, AT_RISK, or an early-period low-confidence ON_TRACK row.
 * Non-notable rows are never sent (they keep their cheap heuristic copy).
 */

/** Minimal shape this hook needs from a budget status row. */
export interface InsightSourceRow {
  categoryId: string;
  categoryName: string;
  status?: string;
  lowConfidence?: boolean;
  pctUsed?: number;
  projectedPct?: number;
  recommendedDailySpend?: number | null;
  periodLabel?: string;
  /** ISO string; used to derive daysRemaining without a re-query. */
  periodEnd?: string;
}

interface AiInsight {
  categoryId: string;
  insightText: string;
  source: 'ai' | 'fallback';
}

interface UseSpendingInsightsResult {
  /** categoryId → AI insight text (only for rows where source === 'ai'). */
  aiInsights: Record<string, string>;
  /** True while the batched request is in flight. */
  loading: boolean;
}

type NotableStatus = 'AT_RISK' | 'OVER_BUDGET' | 'ON_TRACK';

/** Statuses the insights endpoint accepts verbatim; everything else → ON_TRACK. */
const PRIMARY_STATUSES: ReadonlySet<string> = new Set(['AT_RISK', 'OVER_BUDGET']);

/**
 * A notable row is either AT_RISK/OVER_BUDGET or a low-confidence early-period
 * row. Only the two primary statuses are valid on the server; a low-confidence
 * NEW/SURPLUS/ON_TRACK row is sent as ON_TRACK (per spec: "ON_TRACK sent only
 * when lowConfidence"), so one odd row can't 400 — and drop — the whole batch.
 */
function toRequestStatus(status: string | undefined): NotableStatus {
  return status && PRIMARY_STATUSES.has(status) ? (status as NotableStatus) : 'ON_TRACK';
}

function daysRemainingFrom(periodEnd: string | undefined, now: number): number {
  if (!periodEnd) return 0;
  const end = new Date(periodEnd).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}

function isNotable(row: InsightSourceRow): boolean {
  return row.status === 'OVER_BUDGET' || row.status === 'AT_RISK' || row.lowConfidence === true;
}

export function useSpendingInsights(rows: InsightSourceRow[]): UseSpendingInsightsResult {
  const [aiInsights, setAiInsights] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Signature of the notable set so we refetch only when it meaningfully changes
  // (not on every unrelated Dashboard re-render).
  const notable = rows.filter(isNotable);
  const signature = notable
    .map((r) => `${r.categoryId}:${r.status}:${Math.round((r.pctUsed ?? 0) / 10) * 10}`)
    .sort()
    .join('|');
  const lastSignature = useRef<string>('');

  useEffect(() => {
    if (notable.length === 0) {
      setAiInsights({});
      lastSignature.current = signature;
      return;
    }
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;

    const now = Date.now();
    const payload = {
      categories: notable.slice(0, 12).map((r) => ({
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        status: toRequestStatus(r.status),
        lowConfidence: r.lowConfidence === true,
        pctUsed: r.pctUsed ?? 0,
        projectedPct: r.projectedPct ?? 0,
        daysRemaining: daysRemainingFrom(r.periodEnd, now),
        recommendedDailySpend: r.recommendedDailySpend ?? null,
        periodLabel: r.periodLabel ?? 'this period',
      })),
    };

    let cancelled = false;
    setLoading(true);
    api
      .post('/insights/spending', payload)
      .then((res) => {
        if (cancelled) return;
        const insights: AiInsight[] = res.data?.insights ?? [];
        const map: Record<string, string> = {};
        for (const insight of insights) {
          if (insight.source === 'ai' && insight.insightText) {
            map[insight.categoryId] = insight.insightText;
          }
        }
        setAiInsights(map);
      })
      .catch(() => {
        // Silent: AI is an enhancement, not a dependency. Keep heuristic copy.
        if (!cancelled) setAiInsights({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return { aiInsights, loading };
}
