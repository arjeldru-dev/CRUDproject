import { Request, Response } from 'express';
import { generateInsights, type InsightRequestRow, type InsightStatus } from '../services/aiInsightService';
import { generateSavingsNudge, type SavingsNudgeInput } from '../services/aiSavingsNudgeService';
import {
  generateBudgetSummary,
  type BudgetSummaryRow,
  type BudgetStatus,
} from '../services/aiBudgetSummaryService';

/**
 * POST /api/insights/spending
 *
 * Narrates the notable subset of the caller's forecast rows (data the client
 * already legitimately holds) into richer English insights. Always returns 200
 * when authenticated — individual categories degrade to `source: 'fallback'`
 * rather than failing the batch. Protected by a per-user rate limit that guards
 * the shared free-tier LLM key.
 */

const VALID_STATUSES: ReadonlySet<InsightStatus> = new Set(['AT_RISK', 'OVER_BUDGET', 'ON_TRACK']);

// ── Per-user token bucket: 20 requests / 5 minutes (feature spec) ────────
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 5 * 60 * 1000;

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();
/** Sweep expired buckets once the map grows past this, to bound memory. */
const MAX_TRACKED_USERS = 10_000;

/** Drop every bucket whose window has already elapsed. */
function pruneExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** @returns true when the user is under the limit (and records the hit). */
function allowRequest(userId: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(userId);
  if (!bucket || bucket.resetAt <= now) {
    // Opportunistically reclaim stale users before inserting a fresh bucket so
    // the map stays bounded on a long-lived process (idle users never linger).
    if (buckets.size > MAX_TRACKED_USERS) pruneExpiredBuckets(now);
    buckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count++;
  return true;
}

/** Coerce one raw client item into a validated InsightRequestRow, or null. */
function parseRow(raw: unknown): InsightRequestRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.categoryId !== 'string' || !r.categoryId) return null;
  if (typeof r.status !== 'string' || !VALID_STATUSES.has(r.status as InsightStatus)) return null;

  const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

  return {
    categoryId: r.categoryId,
    categoryName: typeof r.categoryName === 'string' ? r.categoryName : '',
    status: r.status as InsightStatus,
    lowConfidence: r.lowConfidence === true,
    pctUsed: num(r.pctUsed),
    projectedPct: num(r.projectedPct),
    daysRemaining: num(r.daysRemaining),
    recommendedDailySpend:
      typeof r.recommendedDailySpend === 'number' && Number.isFinite(r.recommendedDailySpend)
        ? r.recommendedDailySpend
        : null,
    periodLabel: typeof r.periodLabel === 'string' && r.periodLabel ? r.periodLabel : 'this period',
  };
}

export const getSpendingInsights = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;

    const { categories } = req.body ?? {};
    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: 'categories must be an array' });
    }

    // Validate every item up front; a malformed entry rejects the whole request
    // (the client sends well-formed rows it already holds).
    const rows: InsightRequestRow[] = [];
    for (const raw of categories) {
      const parsed = parseRow(raw);
      if (!parsed) {
        return res.status(400).json({ error: 'Each category requires a categoryId and a valid status' });
      }
      rows.push(parsed);
    }

    if (!allowRequest(userId)) {
      return res.status(429).json({ error: 'Too many insight requests, please wait.' });
    }

    const { insights } = await generateInsights(rows);
    return res.status(200).json({ insights });
  } catch (error) {
    console.error('Get spending insights error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ── POST /api/insights/savings (Group 1) ────────────────────────────────

/** Coerce + validate the savings nudge body. Returns null when malformed. */
function parseSavingsBody(raw: unknown): SavingsNudgeInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.enabled !== 'boolean') return null;

  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  let topCategories: SavingsNudgeInput['topCategories'] = [];
  if (Array.isArray(b.topCategories)) {
    topCategories = b.topCategories
      .slice(0, 3)
      .map((c) => {
        const cat = (c ?? {}) as Record<string, unknown>;
        return {
          categoryName: typeof cat.categoryName === 'string' ? cat.categoryName : '',
          accruedSavings: num(cat.accruedSavings),
        };
      });
  }

  let trend: SavingsNudgeInput['trend'];
  if (b.trend && typeof b.trend === 'object') {
    const t = b.trend as Record<string, unknown>;
    if (typeof t.previousAccrued === 'number' && typeof t.latestAccrued === 'number') {
      trend = { previousAccrued: num(t.previousAccrued), latestAccrued: num(t.latestAccrued) };
    }
  }

  return {
    enabled: b.enabled,
    totalSavingsBalance: num(b.totalSavingsBalance),
    totalAccruedSavings: num(b.totalAccruedSavings),
    aggregateShortfall: num(b.aggregateShortfall),
    topCategories,
    trend,
  };
}

/**
 * POST /api/insights/savings
 *
 * Narrates the caller's already-computed savings state (data the client holds
 * from /savings/piggybank) into one short nudge. Always 200 when authenticated —
 * degrades to `source: 'fallback'` on any AI issue. Shares the per-user rate
 * limiter with /spending.
 */
export const getSavingsNudge = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;

    const input = parseSavingsBody(req.body);
    if (!input) {
      return res.status(400).json({ error: 'A valid savings summary with an `enabled` flag is required' });
    }

    if (!allowRequest(userId)) {
      return res.status(429).json({ error: 'Too many insight requests, please wait.' });
    }

    const nudge = await generateSavingsNudge(userId, input);
    return res.status(200).json(nudge);
  } catch (error) {
    console.error('Get savings nudge error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ── POST /api/insights/budget-summary (Group 3) ─────────────────────────

const VALID_BUDGET_STATUSES: ReadonlySet<BudgetStatus> = new Set([
  'NEW',
  'ON_TRACK',
  'AT_RISK',
  'OVER_BUDGET',
  'SURPLUS',
]);

/** Coerce one raw category into a validated BudgetSummaryRow, or null. */
function parseBudgetRow(raw: unknown): BudgetSummaryRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.status !== 'string' || !VALID_BUDGET_STATUSES.has(r.status as BudgetStatus)) return null;

  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  return {
    categoryName: typeof r.categoryName === 'string' ? r.categoryName : '',
    status: r.status as BudgetStatus,
    lowConfidence: r.lowConfidence === true,
    pctUsed: num(r.pctUsed),
    projectedPct: num(r.projectedPct),
    daysRemaining: num(r.daysRemaining),
    periodLabel: typeof r.periodLabel === 'string' && r.periodLabel ? r.periodLabel : 'this period',
  };
}

/**
 * POST /api/insights/budget-summary
 *
 * Synthesizes ONE paragraph summarizing the caller's whole budget picture from
 * the per-category states the client already holds from /transactions/budget.
 * Always 200 when authenticated — degrades to `source: 'fallback'` on any AI
 * issue. Shares the per-user rate limiter with /spending.
 */
export const getBudgetSummary = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;

    const { categories } = req.body ?? {};
    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: 'categories must be a non-empty array' });
    }

    const rows: BudgetSummaryRow[] = [];
    for (const raw of categories) {
      const parsed = parseBudgetRow(raw);
      if (!parsed) {
        return res.status(400).json({ error: 'Each category requires a valid status' });
      }
      rows.push(parsed);
    }

    if (!allowRequest(userId)) {
      return res.status(429).json({ error: 'Too many insight requests, please wait.' });
    }

    const summary = await generateBudgetSummary(userId, rows);
    return res.status(200).json(summary);
  } catch (error) {
    console.error('Get budget summary error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/** Test-only: reset the rate-limit buckets between cases. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}
