import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';

/**
 * Lazily fetch the AI budget-summary paragraph AFTER budget data has loaded.
 *
 * Design (feature-spec-ai-savings-notifications, Group 3):
 *   - Off the critical render path: the Budget Insight card shows a deterministic
 *     summary first, then swaps in the AI paragraph when this resolves.
 *   - ONE POST /api/insights/budget-summary call covering ALL categories.
 *   - Fully graceful: any failure (AI disabled, 429, network) is a silent no-op —
 *     the card keeps the deterministic summary and shows no "AI" pill.
 *   - Refetches only when the overall picture changes (a category flips status or
 *     crosses a 10% bucket), matching the server-side cache signature.
 */

/** Minimal per-category shape this hook needs (from /transactions/budget). */
export interface BudgetSummarySourceRow {
  categoryName: string;
  status?: string;
  lowConfidence?: boolean;
  pctUsed?: number;
  projectedPct?: number;
  periodLabel?: string;
  /** ISO string; used to derive daysRemaining without a re-query. */
  periodEnd?: string;
}

interface UseBudgetSummaryResult {
  /** AI paragraph when source==='ai'; empty string until/unless resolved. */
  summaryText: string;
  source: 'ai' | 'fallback';
  loading: boolean;
}

type BudgetStatus = 'NEW' | 'ON_TRACK' | 'AT_RISK' | 'OVER_BUDGET' | 'SURPLUS';
const VALID_STATUSES: ReadonlySet<string> = new Set(['NEW', 'ON_TRACK', 'AT_RISK', 'OVER_BUDGET', 'SURPLUS']);

const EMPTY: UseBudgetSummaryResult = { summaryText: '', source: 'fallback', loading: false };

function daysRemainingFrom(periodEnd: string | undefined, now: number): number {
  if (!periodEnd) return 0;
  const end = new Date(periodEnd).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}

export function useBudgetSummary(rows: BudgetSummarySourceRow[]): UseBudgetSummaryResult {
  const [result, setResult] = useState<UseBudgetSummaryResult>(EMPTY);

  // Whole-set signature mirroring the server cache: name:status:pctBucket, sorted.
  const signature = rows
    .map((r) => `${r.categoryName}:${r.status ?? ''}:${Math.round((r.pctUsed ?? 0) / 10) * 10}`)
    .sort()
    .join('|');
  const lastSignature = useRef<string>('');

  useEffect(() => {
    if (rows.length === 0) {
      setResult(EMPTY);
      lastSignature.current = signature;
      return;
    }
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;

    const now = Date.now();
    const payload = {
      categories: rows.map((r) => ({
        categoryName: r.categoryName,
        status: (VALID_STATUSES.has(r.status ?? '') ? r.status : 'ON_TRACK') as BudgetStatus,
        lowConfidence: r.lowConfidence === true,
        pctUsed: r.pctUsed ?? 0,
        projectedPct: r.projectedPct ?? 0,
        daysRemaining: daysRemainingFrom(r.periodEnd, now),
        periodLabel: r.periodLabel ?? 'this period',
      })),
    };

    let cancelled = false;
    setResult((prev) => ({ ...prev, loading: true }));
    api
      .post('/insights/budget-summary', payload)
      .then((res) => {
        if (cancelled) return;
        const { summaryText, source } = res.data ?? {};
        setResult({
          summaryText: typeof summaryText === 'string' ? summaryText : '',
          source: source === 'ai' ? 'ai' : 'fallback',
          loading: false,
        });
      })
      .catch(() => {
        // Silent: keep the deterministic summary the card already renders.
        if (!cancelled) setResult(EMPTY);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return result;
}
