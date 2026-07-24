/**
 * AI Smart Category Icon service.
 *
 * `classifyIcon(name)` maps a category name to one key from the closed ICON_KEYS
 * set, classified once at write time (create / name-change) and persisted on the
 * Category row — never on render. Guarantees (feature spec Business Rules):
 *   - Returns exactly one ICON_KEYS value, or `null` on any failure/timeout.
 *   - Unknown/off-list model output is coerced to 'wallet' (never persisted raw).
 *   - Never throws: a failed classify returns null so category creation succeeds
 *     and the frontend falls back to its keyword heuristic.
 *
 * A small in-memory cache keyed by the lowercased, trimmed name avoids
 * re-classifying the same name twice within a process lifetime.
 */
import { generateJSON, isLlmConfigured } from './llm/llmClient';
import { buildIconPrompt, ICON_KEYS, type IconKey } from './llm/prompts';

export type { IconKey };

const DEFAULT_ICON: IconKey = 'wallet';
const ICON_KEY_SET = new Set<string>(ICON_KEYS);

// Simple bounded name→result cache. Names are low-cardinality per process; cap
// keeps memory flat. Value `null` is cached too (do not hammer a failing key).
const CACHE_MAX = 500;
const iconCache = new Map<string, IconKey | null>();

function cacheGet(key: string): IconKey | null | undefined {
  if (!iconCache.has(key)) return undefined;
  const value = iconCache.get(key)!;
  // LRU touch: re-insert to mark most-recently-used.
  iconCache.delete(key);
  iconCache.set(key, value);
  return value;
}

function cacheSet(key: string, value: IconKey | null): void {
  iconCache.set(key, value);
  if (iconCache.size > CACHE_MAX) {
    const oldest = iconCache.keys().next().value;
    if (oldest !== undefined) iconCache.delete(oldest);
  }
}

/** Coerce arbitrary model output to a valid IconKey, defaulting to 'wallet'. */
export function coerceIconKey(raw: unknown): IconKey {
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (ICON_KEY_SET.has(normalized)) return normalized as IconKey;
  }
  return DEFAULT_ICON;
}

/**
 * Classify a category name into an IconKey.
 * @returns the classified key, or `null` when AI is unconfigured/unavailable or
 *          the name is empty — signaling the caller to persist `null` (heuristic
 *          fallback on the frontend).
 */
export async function classifyIcon(name: string): Promise<IconKey | null> {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return null;
  if (!isLlmConfigured()) return null;

  const cacheKey = trimmed.toLowerCase();
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const startedAt = Date.now();
  // Write-path call: keep it snappy. A single attempt with a short timeout means
  // a hanging provider adds at most ~3s to category create/rename (never the
  // ~16s that a full 2-attempt × 8s budget could stack onto a blocking request).
  // Icon accuracy is best-effort anyway — a miss just falls back to the heuristic.
  const parsed = await generateJSON<{ iconKey?: unknown }>(buildIconPrompt(trimmed), {
    temperature: 0, // deterministic classification
    maxOutputTokens: 32,
    timeoutMs: 3000,
    maxAttempts: 1,
  });

  if (parsed === null) {
    // Provider failure/timeout — do NOT cache (transient); let a later write retry.
    console.warn(`ai.icon.classified ${JSON.stringify({ iconKey: null, source: 'fallback', latencyMs: Date.now() - startedAt })}`);
    return null;
  }

  const iconKey = coerceIconKey(parsed.iconKey);
  cacheSet(cacheKey, iconKey);
  console.log(`ai.icon.classified ${JSON.stringify({ iconKey, source: 'ai', latencyMs: Date.now() - startedAt })}`);
  return iconKey;
}

/** Test-only: reset the in-memory cache between cases. */
export function __resetIconCacheForTests(): void {
  iconCache.clear();
}
