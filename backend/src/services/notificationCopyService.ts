/**
 * Notification copy service (feature-spec-ai-savings-notifications, Group 2).
 *
 * Makes notification wording warmer WITHOUT re-plumbing delivery. For each
 * allow-listed notification type the LLM produces a small pool of friendly copy
 * TEMPLATES containing placeholders (`{actor}`, `{challengeName}`, …); the app
 * fills those placeholders deterministically at render/push time. This keeps the
 * feature cheap (≈one call per type, cached for days), private (only the neutral
 * type + placeholder names ever reach the LLM — never a real name, amount, or any
 * PII), and non-blocking (the notify path never awaits the model).
 *
 * Design guarantees:
 *   - The allow-list is a single constant; flipping a type off instantly reverts
 *     it to today's copy. Money/approval types are never enhanced.
 *   - Every generated template is validated: it must use ONLY its type's allowed
 *     placeholders and include all REQUIRED ones, or it is discarded. If none
 *     survive, that type falls back to the current copy.
 *   - Variant selection is deterministic (seeded by notification id) so the
 *     in-app `displayText` and the push body always resolve to the SAME variant.
 *   - Filling is pure, text-only substitution (no HTML) — no XSS vector.
 *   - Template generation is lazy + non-blocking: a cache miss kicks off a
 *     fire-and-forget populate (guarded by an in-flight lock so concurrent misses
 *     don't stampede the LLM); the current notification falls back, later ones use
 *     the now-cached pool.
 */
import { NotificationType } from '@prisma/client';
import { generateJSON, isLlmConfigured } from './llm/llmClient';
import { buildNotificationTemplatePrompt } from './llm/prompts';

/** Placeholder names templates may reference (the closed, allowed set). */
export type Placeholder = 'actor' | 'amount' | 'challengeName' | 'streakDays' | 'badgeName';

interface TypeConfig {
  /** Neutral, PII-free description handed to the LLM. */
  description: string;
  /** Placeholders a template MAY use. */
  allowed: Placeholder[];
  /** Placeholders a template MUST include (a subset of `allowed`). */
  required: Placeholder[];
}

/**
 * The curated allow-list of enhanced types. Types NOT present here (e.g.
 * FEED_REACTION, FEED_COMMENT, and all TRANSACTION_* money types) keep their
 * exact current copy. Editing this map is the single switch for enabling a type.
 */
const ENHANCED_TYPES: Partial<Record<NotificationType, TypeConfig>> = {
  FRIEND_REQUEST_RECEIVED: {
    description: 'Someone (the actor) sent the user a friend request.',
    allowed: ['actor'],
    required: ['actor'],
  },
  FRIEND_REQUEST_ACCEPTED: {
    description: 'Someone (the actor) accepted the user’s friend request.',
    allowed: ['actor'],
    required: ['actor'],
  },
  ADDED_TO_SPLIT: {
    description: 'Someone (the actor) added the user to a new shared expense split.',
    allowed: ['actor'],
    required: ['actor'],
  },
  BALANCE_CHANGED: {
    description: 'The user’s running balance with a friend (the actor) has changed.',
    allowed: ['actor'],
    required: ['actor'],
  },
  SETTLEMENT_REMINDER: {
    description: 'A friend (the actor) sent the user a friendly reminder to settle up.',
    allowed: ['actor'],
    required: ['actor'],
  },
  CHALLENGE_INVITE: {
    description: 'A friend (the actor) invited the user to a savings challenge named challengeName.',
    allowed: ['actor', 'challengeName'],
    required: ['actor', 'challengeName'],
  },
  CHALLENGE_COMPLETED: {
    description: 'The user completed a savings challenge named challengeName. Celebrate it.',
    allowed: ['challengeName'],
    required: ['challengeName'],
  },
  BADGE_UNLOCKED: {
    description: 'The user unlocked an achievement badge named badgeName. Celebrate it.',
    allowed: ['badgeName'],
    required: ['badgeName'],
  },
  STREAK_MILESTONE: {
    description: 'The user reached a streakDays-day activity streak. Celebrate the momentum.',
    allowed: ['streakDays'],
    required: ['streakDays'],
  },
};

const POOL_SIZE = 5; // K templates per type
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface PoolEntry {
  templates: string[];
  expiresAt: number;
}
const templatePools = new Map<NotificationType, PoolEntry>();
/** In-flight generation locks so concurrent misses don't stampede the LLM. */
const inFlight = new Map<NotificationType, Promise<string[]>>();

const PLACEHOLDER_RE = /\{([a-zA-Z]+)\}/g;

/** Extract the placeholder names referenced by a template. */
function placeholdersIn(template: string): string[] {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_RE.exec(template)) !== null) found.push(m[1]);
  return found;
}

/**
 * Validate one candidate template against a type's config. A template is kept
 * only when it uses ONLY allowed placeholders and includes every required one,
 * carries no HTML/URL/markdown, and is a reasonable length.
 */
export function isValidTemplate(template: unknown, config: TypeConfig): template is string {
  if (typeof template !== 'string') return false;
  const text = template.trim();
  if (!text || text.length > 160) return false;
  if (/https?:\/\//i.test(text) || text.includes('`') || /[<>]/.test(text)) return false;

  const used = placeholdersIn(text);
  const allowed = new Set<string>(config.allowed);
  for (const p of used) {
    if (!allowed.has(p)) return false; // disallowed placeholder → discard
  }
  const usedSet = new Set(used);
  for (const req of config.required) {
    if (!usedSet.has(req)) return false; // missing required placeholder → discard
  }
  return true;
}

/** True when a type is on the enhancement allow-list. */
export function isEnhancedType(type: NotificationType): boolean {
  return Boolean(ENHANCED_TYPES[type]);
}

function poolGet(type: NotificationType): string[] | undefined {
  const entry = templatePools.get(type);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    templatePools.delete(type);
    return undefined;
  }
  return entry.templates;
}

/**
 * Generate + validate the template pool for a type via the LLM, storing only the
 * survivors. Guarded by an in-flight lock. Returns the (possibly empty) pool.
 */
async function generatePool(type: NotificationType): Promise<string[]> {
  const config = ENHANCED_TYPES[type];
  if (!config || !isLlmConfigured()) return [];

  const existing = inFlight.get(type);
  if (existing) return existing;

  const startedAt = Date.now();
  const task = (async (): Promise<string[]> => {
    const parsed = await generateJSON<{ templates?: unknown }>(
      buildNotificationTemplatePrompt(config.description, config.allowed, POOL_SIZE),
      { temperature: 0.7, maxOutputTokens: 512 },
    );
    const raw = parsed && Array.isArray(parsed.templates) ? parsed.templates : [];
    const valid = raw.filter((t): t is string => isValidTemplate(t, config)).map((t) => t.trim());
    if (valid.length > 0) {
      templatePools.set(type, { templates: valid, expiresAt: Date.now() + CACHE_TTL_MS });
      console.log(
        `ai.notifCopy.generated ${JSON.stringify({ type, variantCount: valid.length, latencyMs: Date.now() - startedAt })}`,
      );
    }
    return valid;
  })();

  inFlight.set(type, task);
  try {
    return await task;
  } finally {
    inFlight.delete(type);
  }
}

/** Small deterministic string hash (FNV-1a) for seeded variant selection. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Pick a cached template for a type deterministically from `seed` (the
 * notification id), so the in-app and push renderers agree on the same variant.
 * Returns `null` when no pool is cached — and, on that miss, kicks off a
 * fire-and-forget populate so subsequent notifications are enhanced. NEVER awaits
 * the LLM: the notify path stays synchronous.
 */
export function pickTemplate(type: NotificationType, seed: string): string | null {
  if (!isEnhancedType(type)) return null;

  const pool = poolGet(type);
  if (!pool || pool.length === 0) {
    // Non-blocking warm-up for next time; ignore the result and any error.
    if (isLlmConfigured() && !inFlight.has(type)) {
      void generatePool(type).catch(() => {
        console.warn(`ai.notifCopy.fallback ${JSON.stringify({ type, cause: 'generate-failed' })}`);
      });
    } else {
      console.log(`ai.notifCopy.fallback ${JSON.stringify({ type, cause: 'cache-miss' })}`);
    }
    return null;
  }

  const index = hashSeed(seed) % pool.length;
  return pool[index];
}

/**
 * Fill a template's placeholders with the given values, as plain text (no HTML).
 * Returns `null` when a placeholder present in the template has no value — the
 * caller then falls back to the current copy rather than render a broken string.
 */
export function fillTemplate(template: string, vars: Partial<Record<Placeholder, string>>): string | null {
  const needed = placeholdersIn(template);
  for (const name of needed) {
    const value = vars[name as Placeholder];
    if (value === undefined || value === null || value === '') return null;
  }
  return template.replace(PLACEHOLDER_RE, (_match, name: string) => String(vars[name as Placeholder] ?? ''));
}

/**
 * Resolve friendly copy for a notification, or `null` to use the caller's current
 * copy. Deterministic (seeded by `seed`), synchronous, and PII-safe. Both the
 * push body and the in-app `displayText` call this with the same seed so they
 * always agree.
 */
export function resolveFriendlyCopy(
  type: NotificationType,
  seed: string,
  vars: Partial<Record<Placeholder, string>>,
): string | null {
  const template = pickTemplate(type, seed);
  if (!template) return null;
  return fillTemplate(template, vars);
}

/**
 * Pre-generate template pools for every allow-listed type. Safe to call at
 * startup (fire-and-forget) so the first real notification never waits on the
 * LLM. No-op when the LLM is unconfigured. Never throws.
 */
export async function warmUpNotificationCopy(): Promise<void> {
  if (!isLlmConfigured()) return;
  const types = Object.keys(ENHANCED_TYPES) as NotificationType[];
  await Promise.all(
    types.map((type) =>
      generatePool(type).catch(() => {
        /* best-effort warm-up; a failed type simply falls back until next miss */
      }),
    ),
  );
}

/** Test-only: seed a pool directly (bypasses the LLM). */
export function __setPoolForTests(type: NotificationType, templates: string[]): void {
  templatePools.set(type, { templates, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Test-only: clear all cached pools between cases. */
export function __resetCopyCacheForTests(): void {
  templatePools.clear();
  inFlight.clear();
}
