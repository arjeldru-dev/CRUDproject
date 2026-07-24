/**
 * AI Savings Nudge service (feature-spec-ai-savings-notifications, Group 1).
 *
 * Adds an LLM narration layer over the already-computed, authoritative savings
 * numbers. The math in `savingsService.ts` is never touched — this layer only
 * turns a PII-light summary into one short, motivating line. Guarantees:
 *   - A pure `evaluateNudgeReason` gate decides eligibility BEFORE any LLM call;
 *     a `NONE` reason never calls the model (and renders no nudge).
 *   - A deterministic heuristic line exists for every notable reason, shown
 *     immediately and used as the fallback whenever AI is off/fails.
 *   - Server-side in-memory LRU keyed by `${userId}:${reason}:${bucket₱500}` with
 *     a 6h TTL — a user in the same state all day costs one call. No exact
 *     amounts or category names are part of the cache key.
 *   - Output validation: empty / > 160 chars (truncated) / a ₱ amount NOT present
 *     in the input context all degrade to `source: 'fallback'`.
 *   - Never throws: any failure yields the heuristic line with `source: 'fallback'`.
 */
import { generateJSON, isLlmConfigured } from './llm/llmClient';
import { buildSavingsNudgePrompt, type SavingsNudgeReason } from './llm/prompts';

export type { SavingsNudgeReason } from './llm/prompts';

/** Compact, already-computed summary the client holds from /savings/piggybank. */
export interface SavingsNudgeInput {
  enabled: boolean;
  totalSavingsBalance: number;
  totalAccruedSavings: number;
  aggregateShortfall: number;
  topCategories: Array<{ categoryName: string; accruedSavings: number }>;
  trend?: { previousAccrued: number; latestAccrued: number };
}

export interface SavingsNudgeResult {
  reason: SavingsNudgeReason;
  /** ≤ 160 chars, English. Empty only for `NONE` (the client renders no band). */
  nudgeText: string;
  source: 'ai' | 'fallback';
}

// ── Constants (feature spec) ────────────────────────────────────────────
const MAX_LEN = 160;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_MAX = 1000;
const ACCRUED_BUCKET = 500; // coarse ₱ bucket for the cache key
const MILESTONE_STEP = 1000; // a new multiple of ₱1,000 is a milestone

interface CacheEntry {
  text: string;
  expiresAt: number;
}
const nudgeCache = new Map<string, CacheEntry>();

/**
 * Pure eligibility gate. Picks the single most relevant reason from the computed
 * savings state, or `NONE` when there is nothing worth saying. Priority:
 * MILESTONE (a fresh ₱1,000 crossing) → SHORTFALL → GROWTH → STALLED → NONE.
 */
export function evaluateNudgeReason(input: SavingsNudgeInput): SavingsNudgeReason {
  if (!input.enabled) return 'NONE';

  const total = Number.isFinite(input.totalAccruedSavings) ? input.totalAccruedSavings : 0;
  const shortfall = Number.isFinite(input.aggregateShortfall) ? input.aggregateShortfall : 0;
  const trend = input.trend;

  // MILESTONE: this period's accrual crossed into a new ₱1,000 band.
  if (trend) {
    const crossed = Math.floor(trend.latestAccrued / MILESTONE_STEP) > Math.floor(trend.previousAccrued / MILESTONE_STEP);
    if (crossed && trend.latestAccrued > 0) return 'MILESTONE';
  }

  if (shortfall > 0) return 'SHORTFALL';

  if (trend) {
    if (trend.latestAccrued > trend.previousAccrued) return 'GROWTH';
    if (total > 0 && trend.latestAccrued <= trend.previousAccrued) return 'STALLED';
  }

  return 'NONE';
}

/** Deterministic, LLM-free line for each reason. `NONE` renders no nudge. */
export function buildHeuristicNudge(reason: SavingsNudgeReason): string {
  switch (reason) {
    case 'MILESTONE':
      return 'You just crossed a new savings milestone — your best stretch yet. Keep it going!';
    case 'GROWTH':
      return 'Your savings grew this period. Nice, steady progress — keep the momentum up.';
    case 'SHORTFALL':
      return 'A couple of categories went over their funded budget. A small trim next period gets you back on track.';
    case 'STALLED':
      return 'Your savings held steady. Setting a little aside next period gets them growing again.';
    case 'NONE':
    default:
      return '';
  }
}

/** Round to the nearest ₱500 so small drifts reuse the same cache slot. */
function bucketAccrued(amount: number): number {
  return Math.round((Number.isFinite(amount) ? amount : 0) / ACCRUED_BUCKET) * ACCRUED_BUCKET;
}

function cacheKey(userId: string, reason: SavingsNudgeReason, input: SavingsNudgeInput): string {
  return `${userId}:${reason}:${bucketAccrued(input.totalAccruedSavings)}`;
}

function cacheGet(key: string): string | undefined {
  const entry = nudgeCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    nudgeCache.delete(key);
    return undefined;
  }
  nudgeCache.delete(key);
  nudgeCache.set(key, entry); // LRU touch
  return entry.text;
}

function cacheSet(key: string, text: string): void {
  nudgeCache.set(key, { text, expiresAt: Date.now() + CACHE_TTL_MS });
  if (nudgeCache.size > CACHE_MAX) {
    const oldest = nudgeCache.keys().next().value;
    if (oldest !== undefined) nudgeCache.delete(oldest);
  }
}

/** Truncate to <= max chars on the last word boundary, appending an ellipsis. */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/**
 * The set of whole-peso amounts the model is allowed to mention — every figure
 * present in the input context (plus the crossed milestone threshold). Any ₱
 * amount in the output that is not in this set is a hallucination → reject.
 */
function allowedAmounts(reason: SavingsNudgeReason, input: SavingsNudgeInput): Set<number> {
  const amounts = new Set<number>();
  const add = (n: number) => {
    if (Number.isFinite(n)) amounts.add(Math.round(n));
  };
  add(input.totalSavingsBalance);
  add(input.totalAccruedSavings);
  add(input.aggregateShortfall);
  for (const c of input.topCategories) add(c.accruedSavings);
  if (input.trend) {
    add(input.trend.previousAccrued);
    add(input.trend.latestAccrued);
    if (reason === 'MILESTONE') {
      add(Math.floor(input.trend.latestAccrued / MILESTONE_STEP) * MILESTONE_STEP);
    }
  }
  return amounts;
}

/** True when the text names a ₱ figure that is not present in `allowed`. */
export function hasHallucinatedAmount(text: string, allowed: Set<number>): boolean {
  const re = /₱\s*([\d,]+(?:\.\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const value = Math.round(Number(match[1].replace(/,/g, '')));
    if (!Number.isFinite(value) || !allowed.has(value)) return true;
  }
  // A bare "PHP 500" style figure is also treated as a fabrication.
  if (/\bPHP\s*\d/i.test(text)) return true;
  return false;
}

/**
 * Validate + normalize a single AI nudge string. Returns the cleaned text, or
 * `null` if it must be rejected (caller degrades to the heuristic line).
 */
export function sanitizeNudge(raw: unknown, reason: SavingsNudgeReason, input: SavingsNudgeInput): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (/https?:\/\//i.test(text)) return null;
  if (text.includes('`')) return null;
  if (hasHallucinatedAmount(text, allowedAmounts(reason, input))) return null;
  return truncateAtWord(text, MAX_LEN);
}

/**
 * Generate a savings nudge for the given summary. Gates on the pure reason,
 * serves a cache hit, makes at most one LLM call, validates the output, and
 * falls back to the deterministic heuristic line on any failure. Never throws.
 */
export async function generateSavingsNudge(userId: string, input: SavingsNudgeInput): Promise<SavingsNudgeResult> {
  const startedAt = Date.now();
  const reason = evaluateNudgeReason(input);

  // NONE (and disabled) never calls the LLM and renders no band.
  if (reason === 'NONE') {
    logNudge(reason, 'fallback', false, startedAt);
    return { reason, nudgeText: '', source: 'fallback' };
  }

  const heuristic = buildHeuristicNudge(reason);
  const key = cacheKey(userId, reason, input);

  const cached = cacheGet(key);
  if (cached !== undefined) {
    logNudge(reason, 'ai', true, startedAt);
    return { reason, nudgeText: cached, source: 'ai' };
  }

  if (!isLlmConfigured()) {
    logNudge(reason, 'fallback', false, startedAt);
    return { reason, nudgeText: heuristic, source: 'fallback' };
  }

  const parsed = await generateJSON<{ nudgeText?: unknown }>(
    buildSavingsNudgePrompt(reason, {
      totalSavingsBalance: input.totalSavingsBalance,
      totalAccruedSavings: input.totalAccruedSavings,
      aggregateShortfall: input.aggregateShortfall,
      topCategories: input.topCategories.slice(0, 3),
      trend: input.trend,
    }),
    { temperature: 0.5, maxOutputTokens: 128 },
  );

  const clean = parsed ? sanitizeNudge(parsed.nudgeText, reason, input) : null;
  if (clean) {
    cacheSet(key, clean);
    logNudge(reason, 'ai', false, startedAt);
    return { reason, nudgeText: clean, source: 'ai' };
  }

  logNudge(reason, 'fallback', false, startedAt);
  return { reason, nudgeText: heuristic, source: 'fallback' };
}

function logNudge(reason: SavingsNudgeReason, source: 'ai' | 'fallback', cacheHit: boolean, startedAt: number): void {
  console.log(
    `ai.savingsNudge.generated ${JSON.stringify({ reason, source, cacheHit, latencyMs: Date.now() - startedAt })}`,
  );
}

/** Test-only: reset the in-memory cache between cases. */
export function __resetNudgeCacheForTests(): void {
  nudgeCache.clear();
}
