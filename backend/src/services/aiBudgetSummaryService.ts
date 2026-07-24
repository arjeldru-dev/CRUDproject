/**
 * AI Budget Summary service (feature-spec-ai-savings-notifications, Group 3).
 *
 * Synthesizes ONE cohesive paragraph summarizing the budget picture across ALL
 * of a user's categories, from their already-computed deterministic states. The
 * numbers/rings/bars elsewhere on the Categories page stay authoritative — this
 * layer only narrates. Guarantees:
 *   - A pure `buildDeterministicSummary` composes a plain paragraph from status
 *     counts; it is always available and needs no LLM.
 *   - One LLM call per user per state-change, cached server-side by a signature
 *     over the WHOLE set (`sorted ${name}:${status}:${bucket₱ of pctUsed}`), 6h TTL.
 *   - Prompt bounding: only the most notable categories are narrated in detail;
 *     the rest are folded into an aggregate count so the prompt stays small.
 *   - The request carries NO peso amounts (only names/statuses/percentages), so
 *     ANY ₱ figure in the output is a hallucination → reject and fall back.
 *   - Validation: empty / > 500 chars (truncated) / a ₱ amount all degrade to
 *     `source: 'fallback'`. Never throws.
 */
import { generateJSON, isLlmConfigured } from './llm/llmClient';
import { buildBudgetSummaryPrompt, type BudgetSummaryPromptRow } from './llm/prompts';

export type BudgetStatus = 'NEW' | 'ON_TRACK' | 'AT_RISK' | 'OVER_BUDGET' | 'SURPLUS';

/** One category's computed state (mirrors AiBudgetSummaryRequest.categories[]). */
export interface BudgetSummaryRow {
  categoryName: string;
  status: BudgetStatus;
  lowConfidence: boolean;
  pctUsed: number;
  projectedPct: number;
  daysRemaining: number;
  periodLabel: string;
}

export interface BudgetSummaryResult {
  summaryText: string; // one paragraph, ≤ 500 chars, English
  source: 'ai' | 'fallback';
}

// ── Constants (feature spec) ────────────────────────────────────────────
const MAX_LEN = 500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_MAX = 1000;
const MAX_NARRATED = 8; // cap detailed rows in the prompt; rest → aggregate count

interface CacheEntry {
  text: string;
  expiresAt: number;
}
const summaryCache = new Map<string, CacheEntry>();

/** Rank so the most notable states are narrated first when bounding the prompt. */
function notabilityRank(row: BudgetSummaryRow): number {
  if (row.status === 'OVER_BUDGET') return 0;
  if (row.status === 'AT_RISK') return 1;
  if (row.lowConfidence) return 2;
  if (row.status === 'SURPLUS') return 3;
  return 4; // ON_TRACK / NEW
}

/** A category is "notable" (worth naming) when it is not comfortably on track. */
function isNotable(row: BudgetSummaryRow): boolean {
  return row.status === 'OVER_BUDGET' || row.status === 'AT_RISK' || row.status === 'SURPLUS' || row.lowConfidence;
}

/** Bucket pctUsed to the nearest 10 so small drifts reuse the same cache slot. */
function bucketPct(pct: number): number {
  return Math.round((Number.isFinite(pct) ? pct : 0) / 10) * 10;
}

/** Signature over the WHOLE set — regenerates only when the picture changes. */
function signature(rows: BudgetSummaryRow[]): string {
  return rows
    .map((r) => `${r.categoryName}:${r.status}:${bucketPct(r.pctUsed)}`)
    .sort()
    .join('|');
}

function cacheGet(key: string): BudgetSummaryResult | undefined {
  const entry = summaryCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    summaryCache.delete(key);
    return undefined;
  }
  summaryCache.delete(key);
  summaryCache.set(key, entry); // LRU touch
  return { summaryText: entry.text, source: 'ai' };
}

function cacheSet(key: string, text: string): void {
  summaryCache.set(key, { text, expiresAt: Date.now() + CACHE_TTL_MS });
  if (summaryCache.size > CACHE_MAX) {
    const oldest = summaryCache.keys().next().value;
    if (oldest !== undefined) summaryCache.delete(oldest);
  }
}

/** Truncate to <= max chars on a sentence boundary when possible, else a word. */
export function truncateParagraph(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (lastStop > max * 0.5) return slice.slice(0, lastStop + 1).trimEnd();
  const lastSpace = slice.slice(0, max - 1).lastIndexOf(' ');
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice.slice(0, max - 1);
  return `${cut.trimEnd()}…`;
}

/**
 * Pure, always-available fallback: a plain paragraph composed from status counts.
 * Never calls the LLM. Used immediately (before AI resolves) and whenever AI is
 * off or fails.
 */
export function buildDeterministicSummary(rows: BudgetSummaryRow[]): string {
  const total = rows.length;
  if (total === 0) return '';

  const over = rows.filter((r) => r.status === 'OVER_BUDGET').length;
  const atRisk = rows.filter((r) => r.status === 'AT_RISK' || (r.status === 'ON_TRACK' && r.lowConfidence)).length;
  const surplus = rows.filter((r) => r.status === 'SURPLUS').length;
  const onTrack = total - over - atRisk - surplus;

  const budgetsWord = total === 1 ? 'budget' : 'budgets';
  const parts: string[] = [`You have ${total} ${budgetsWord}.`];

  const clauses: string[] = [];
  if (over > 0) clauses.push(`${over} over the limit`);
  if (atRisk > 0) clauses.push(`${atRisk} trending high`);
  if (surplus > 0) clauses.push(`${surplus} with a surplus`);
  if (onTrack > 0) clauses.push(`${onTrack} on track`);

  if (clauses.length > 0) parts.push(`${joinClauses(clauses)}.`);

  if (over > 0 || atRisk > 0) {
    parts.push('Easing off the ones running high this period keeps you steady.');
  } else {
    parts.push('Nice work keeping everything in check — keep it up.');
  }

  return truncateParagraph(parts.join(' '), MAX_LEN);
}

/** Join clauses into a natural, comma+"and" list. */
function joinClauses(clauses: string[]): string {
  if (clauses.length === 1) return capitalize(clauses[0]);
  const head = clauses.slice(0, -1).join(', ');
  return capitalize(`${head} and ${clauses[clauses.length - 1]}`);
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Validate + normalize the AI paragraph. Returns cleaned text or null. */
export function sanitizeSummary(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  // The request carries NO amounts, so any ₱/PHP figure is a fabrication.
  if (/₱\s*\d/.test(text)) return null;
  if (/\bPHP\s*\d/i.test(text)) return null;
  if (/https?:\/\//i.test(text)) return null;
  if (text.includes('`')) return null;
  return truncateParagraph(text, MAX_LEN);
}

/** Split rows into the detailed set to narrate and the count of the rest. */
function boundRows(rows: BudgetSummaryRow[]): { narrated: BudgetSummaryRow[]; otherCount: number } {
  const notable = rows.filter(isNotable).sort((a, b) => notabilityRank(a) - notabilityRank(b));
  if (notable.length <= MAX_NARRATED) {
    // Room to spare: narrate the notable ones plus some on-track for context.
    const onTrack = rows.filter((r) => !isNotable(r));
    const narrated = [...notable, ...onTrack].slice(0, MAX_NARRATED);
    return { narrated, otherCount: Math.max(0, rows.length - narrated.length) };
  }
  const narrated = notable.slice(0, MAX_NARRATED);
  return { narrated, otherCount: rows.length - narrated.length };
}

function toPromptRow(row: BudgetSummaryRow): BudgetSummaryPromptRow {
  return {
    categoryName: row.categoryName,
    status: row.status,
    lowConfidence: row.lowConfidence,
    pctUsed: row.pctUsed,
    projectedPct: row.projectedPct,
    daysRemaining: row.daysRemaining,
    periodLabel: row.periodLabel,
  };
}

/**
 * Generate the portfolio summary. Serves a cache hit, makes at most one bounded
 * LLM call, validates the paragraph, and falls back to the deterministic summary
 * on any failure. Never throws.
 */
export async function generateBudgetSummary(userId: string, rows: BudgetSummaryRow[]): Promise<BudgetSummaryResult> {
  const startedAt = Date.now();
  const deterministic = buildDeterministicSummary(rows);

  if (rows.length === 0) {
    logSummary('fallback', false, 0, startedAt);
    return { summaryText: '', source: 'fallback' };
  }

  const key = `${userId}:${signature(rows)}`;
  const cached = cacheGet(key);
  if (cached) {
    logSummary('ai', true, rows.length, startedAt);
    return cached;
  }

  if (!isLlmConfigured()) {
    logSummary('fallback', false, rows.length, startedAt);
    return { summaryText: deterministic, source: 'fallback' };
  }

  const { narrated, otherCount } = boundRows(rows);
  const parsed = await generateJSON<{ summaryText?: unknown }>(
    buildBudgetSummaryPrompt(narrated.map(toPromptRow), otherCount),
    { temperature: 0.4, maxOutputTokens: 320 },
  );

  const clean = parsed ? sanitizeSummary(parsed.summaryText) : null;
  if (clean) {
    cacheSet(key, clean);
    logSummary('ai', false, rows.length, startedAt);
    return { summaryText: clean, source: 'ai' };
  }

  logSummary('fallback', false, rows.length, startedAt);
  return { summaryText: deterministic, source: 'fallback' };
}

function logSummary(source: 'ai' | 'fallback', cacheHit: boolean, categoryCount: number, startedAt: number): void {
  console.log(
    `ai.budgetSummary.generated ${JSON.stringify({ source, cacheHit, categoryCount, latencyMs: Date.now() - startedAt })}`,
  );
}

/** Test-only: reset the in-memory cache between cases. */
export function __resetBudgetSummaryCacheForTests(): void {
  summaryCache.clear();
}
