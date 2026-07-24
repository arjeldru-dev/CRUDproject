/**
 * AI-Enhanced Spending Insight service.
 *
 * Turns the notable subset of deterministic forecast rows into richer, friendly,
 * English-only nudges. The forecast math stays authoritative — this layer only
 * rewrites the prose. Guarantees (feature spec):
 *   - One batched LLM call per request (not per category); off the /budget path.
 *   - Server-side in-memory cache keyed by (categoryId, status, pctUsed bucket,
 *     periodLabel) with a 6h TTL, so a category in a steady state costs one call.
 *   - Output validation: ≤200 chars on a word boundary; empty/whitespace,
 *     hallucinated ₱ amounts, URLs and code all degrade the row to 'fallback'.
 *   - Never throws: any failure yields `source: 'fallback'` for that row, and the
 *     client keeps its heuristic insightText.
 */
import { generateJSON, isLlmConfigured } from './llm/llmClient';
import { buildInsightPrompt, type InsightPromptRow } from './llm/prompts';

export type InsightStatus = 'AT_RISK' | 'OVER_BUDGET' | 'ON_TRACK';

/** One category the client asks us to (maybe) enhance. Mirrors AiInsightRequest. */
export interface InsightRequestRow {
  categoryId: string;
  categoryName: string;
  status: InsightStatus;
  lowConfidence: boolean;
  pctUsed: number;
  projectedPct: number;
  daysRemaining: number;
  recommendedDailySpend: number | null;
  periodLabel: string;
}

export interface InsightResult {
  categoryId: string;
  /** AI text when source==='ai'; empty string when 'fallback' (client keeps heuristic). */
  insightText: string;
  source: 'ai' | 'fallback';
}

export interface GenerateInsightsSummary {
  count: number;
  cacheHits: number;
  fallbacks: number;
  latencyMs: number;
}

// ── Constants (feature spec) ────────────────────────────────────────────
const MAX_BATCH = 12; // cap notable categories per request; remainder → fallback
const MAX_LEN = 200; // insight text hard cap
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_MAX = 1000;

interface CacheEntry {
  text: string;
  expiresAt: number;
}
const insightCache = new Map<string, CacheEntry>();

/** Bucket pctUsed to the nearest 10 so small drifts reuse the same cache slot. */
function bucketPct(pct: number): number {
  return Math.round((Number.isFinite(pct) ? pct : 0) / 10) * 10;
}

function signature(row: InsightRequestRow): string {
  return `${row.categoryId}:${row.status}:${bucketPct(row.pctUsed)}:${row.periodLabel}`;
}

function cacheGet(key: string): string | undefined {
  const entry = insightCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    insightCache.delete(key);
    return undefined;
  }
  // LRU touch.
  insightCache.delete(key);
  insightCache.set(key, entry);
  return entry.text;
}

function cacheSet(key: string, text: string): void {
  insightCache.set(key, { text, expiresAt: Date.now() + CACHE_TTL_MS });
  if (insightCache.size > CACHE_MAX) {
    const oldest = insightCache.keys().next().value;
    if (oldest !== undefined) insightCache.delete(oldest);
  }
}

/** Only these states earn AI copy; everything else keeps the cheap heuristic. */
export function isNotable(row: Pick<InsightRequestRow, 'status' | 'lowConfidence'>): boolean {
  return row.status === 'OVER_BUDGET' || row.status === 'AT_RISK' || row.lowConfidence === true;
}

/**
 * Validate + normalize a single AI insight string. Returns the cleaned text, or
 * `null` if the text must be rejected (caller degrades that row to fallback).
 */
export function sanitizeInsight(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;

  // Deny-list: LLMs hallucinate peso figures / links. We never send amounts, so
  // any ₱/PHP-prefixed number or URL or code fence is a fabrication → reject.
  if (/₱\s*\d/.test(text)) return null;
  if (/\bPHP\s*\d/i.test(text)) return null;
  if (/https?:\/\//i.test(text)) return null;
  if (text.includes('`')) return null;

  return truncateAtWord(text, MAX_LEN);
}

/** Truncate to <= max chars on the last word boundary, appending an ellipsis. */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

function toPromptRow(row: InsightRequestRow): InsightPromptRow {
  return {
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    status: row.status,
    lowConfidence: row.lowConfidence,
    pctUsed: row.pctUsed,
    projectedPct: row.projectedPct,
    daysRemaining: row.daysRemaining,
    recommendedDailySpend: row.recommendedDailySpend,
    periodLabel: row.periodLabel,
  };
}

/**
 * Generate insights for the given rows. Filters to notable rows, caps the batch,
 * serves cache hits, makes one LLM call for the rest, validates output, and
 * returns one result per notable row (never throws).
 */
export async function generateInsights(
  rows: InsightRequestRow[],
): Promise<{ insights: InsightResult[]; summary: GenerateInsightsSummary }> {
  const startedAt = Date.now();
  const notable = rows.filter(isNotable).slice(0, MAX_BATCH);

  const results: InsightResult[] = [];
  const toGenerate: InsightRequestRow[] = [];
  let cacheHits = 0;

  for (const row of notable) {
    const cached = cacheGet(signature(row));
    if (cached !== undefined) {
      results.push({ categoryId: row.categoryId, insightText: cached, source: 'ai' });
      cacheHits++;
    } else {
      toGenerate.push(row);
    }
  }

  // Fetch the uncached rows in a single batched call (if AI is available).
  if (toGenerate.length > 0 && isLlmConfigured()) {
    const parsed = await generateJSON<{ insights?: Array<{ categoryId?: unknown; insightText?: unknown }> }>(
      buildInsightPrompt(toGenerate.map(toPromptRow)),
      { temperature: 0.4, maxOutputTokens: 512 },
    );

    const byId = new Map<string, string>();
    if (parsed && Array.isArray(parsed.insights)) {
      for (const item of parsed.insights) {
        if (typeof item?.categoryId !== 'string') continue;
        const clean = sanitizeInsight(item.insightText);
        if (clean) byId.set(item.categoryId, clean);
      }
    }

    for (const row of toGenerate) {
      const text = byId.get(row.categoryId);
      if (text) {
        cacheSet(signature(row), text);
        results.push({ categoryId: row.categoryId, insightText: text, source: 'ai' });
      } else {
        results.push({ categoryId: row.categoryId, insightText: '', source: 'fallback' });
      }
    }
  } else {
    // AI disabled or nothing to generate: remaining uncached rows fall back.
    for (const row of toGenerate) {
      results.push({ categoryId: row.categoryId, insightText: '', source: 'fallback' });
    }
  }

  const fallbacks = results.filter((r) => r.source === 'fallback').length;
  const summary: GenerateInsightsSummary = {
    count: results.length,
    cacheHits,
    fallbacks,
    latencyMs: Date.now() - startedAt,
  };
  console.log(`ai.insight.generated ${JSON.stringify(summary)}`);

  return { insights: results, summary };
}

/** Test-only: reset the in-memory cache between cases. */
export function __resetInsightCacheForTests(): void {
  insightCache.clear();
}
