/**
 * Provider-agnostic LLM client (zero runtime dependencies).
 *
 * Both AI features (spending insights + smart category icons) go through this
 * thin layer so the model is swappable via env and retries/timeouts/the API key
 * live in one place. It intentionally uses the global `fetch` (Node 18+) rather
 * than an SDK — the calls are simple and this keeps the dependency footprint at
 * zero (see the feature spec's "zero-dependency route").
 *
 * Provider selection:
 *   LLM_PROVIDER=gemini (default) | groq
 *   GEMINI_API_KEY / GROQ_API_KEY   — secret, backend-only, never logged
 *   LLM_MODEL                       — optional model override per provider
 *
 * Design guarantees (from `ai-product` / `prompt-engineer` skills):
 *   - Never throws to callers: returns `null` on any failure (missing key,
 *     timeout, non-2xx, malformed JSON). Callers degrade to a heuristic.
 *   - Bounded latency via AbortController; one retry with backoff on transient
 *     failures (network / 5xx / 429).
 *   - Output is always returned as raw text; structural validation (JSON parse,
 *     enum coercion, length caps) is the caller's responsibility.
 */

export type LlmProvider = 'gemini' | 'groq';

export interface LlmGenerateOptions {
  /** Sampling temperature. Low for classification, slightly higher for prose. */
  temperature?: number;
  /** Hard cap on output tokens to bound cost/latency. */
  maxOutputTokens?: number;
  /** Request JSON output (Gemini responseMimeType / Groq response_format). */
  json?: boolean;
  /** Overall timeout in ms (default 8000, per spec). */
  timeoutMs?: number;
  /**
   * Max provider attempts, including the first (default 2 → one retry). Set to 1
   * for latency-sensitive write paths (e.g. icon classify on category create)
   * so a hanging provider can't stack two timeouts onto a user-blocking request.
   */
  maxAttempts?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_TOKENS = 256;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// Use the "-latest" alias so the default tracks the current free flash-lite
// model and does not break when a specific version is deprecated for new keys
// (e.g. gemini-2.5-flash-lite returns 404 "no longer available to new users").
// Pin an exact version via LLM_MODEL if you need reproducible output.
const GEMINI_DEFAULT_MODEL = 'gemini-flash-lite-latest';
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';

/** Resolve the active provider from env, defaulting to Gemini. */
export function getProvider(): LlmProvider {
  return process.env.LLM_PROVIDER === 'groq' ? 'groq' : 'gemini';
}

/** The API key for the active provider, or undefined when unconfigured. */
function getApiKey(provider: LlmProvider): string | undefined {
  return provider === 'groq' ? process.env.GROQ_API_KEY : process.env.GEMINI_API_KEY;
}

function getModel(provider: LlmProvider): string {
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  return provider === 'groq' ? GROQ_DEFAULT_MODEL : GEMINI_DEFAULT_MODEL;
}

/** True when the active provider has a usable key. Callers short-circuit on false. */
export function isLlmConfigured(): boolean {
  return Boolean(getApiKey(getProvider()));
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface HttpAttempt {
  ok: boolean;
  status: number;
  text: string;
  aborted: boolean;
}

/** Single fetch with an AbortController-bounded timeout. Never throws. */
async function fetchOnce(url: string, init: RequestInit, timeoutMs: number): Promise<HttpAttempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, aborted: false };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { ok: false, status: 0, text: '', aborted };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST to the active provider and return the model's raw text output, or `null`
 * on any failure. One retry with backoff on transient (retryable) failures.
 */
async function callProvider(prompt: string, opts: LlmGenerateOptions): Promise<string | null> {
  const provider = getProvider();
  const apiKey = getApiKey(provider);
  if (!apiKey) return null;

  const model = getModel(provider);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const temperature = opts.temperature ?? 0.2;
  const maxOutputTokens = opts.maxOutputTokens ?? DEFAULT_MAX_TOKENS;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 2);

  const { url, init, extract } = buildRequest(provider, model, apiKey, prompt, {
    temperature,
    maxOutputTokens,
    json: opts.json ?? false,
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetchOnce(url, init, timeoutMs);
    if (res.ok) {
      try {
        return extract(JSON.parse(res.text));
      } catch {
        return null; // malformed provider envelope
      }
    }
    const retryable = res.aborted || res.status === 0 || RETRYABLE_STATUS.has(res.status);
    if (!retryable || attempt === maxAttempts) {
      console.warn(`ai.llm.error ${JSON.stringify({ provider, feature: 'llmClient', status: res.status })}`);
      return null;
    }
    await delay(300 * attempt);
  }
  return null;
}

interface NormalizedOpts {
  temperature: number;
  maxOutputTokens: number;
  json: boolean;
}

/** Build the provider-specific request URL/body and a response text extractor. */
function buildRequest(
  provider: LlmProvider,
  model: string,
  apiKey: string,
  prompt: string,
  opts: NormalizedOpts,
): { url: string; init: RequestInit; extract: (body: unknown) => string | null } {
  if (provider === 'groq') {
    return {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: opts.temperature,
          max_tokens: opts.maxOutputTokens,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'user', content: prompt }],
        }),
      },
      extract: (body) => {
        const b = body as { choices?: Array<{ message?: { content?: string } }> };
        return b.choices?.[0]?.message?.content ?? null;
      },
    };
  }

  // Gemini (default) — Google AI Studio generateContent REST endpoint.
  // The key travels in the `x-goog-api-key` header rather than the URL query
  // string so it is not captured by URL-based proxy/access logs.
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxOutputTokens,
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    },
    extract: (body) => {
      const b = body as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const parts = b.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p) => p.text ?? '').join('');
      return text || null;
    },
  };
}

/**
 * Generate free-form text. Returns `null` on any failure so callers fall back.
 */
export async function generateText(prompt: string, opts: LlmGenerateOptions = {}): Promise<string | null> {
  return callProvider(prompt, opts);
}

/**
 * Generate and JSON-parse a structured response. Returns `null` if the provider
 * fails or the output is not valid JSON. The generic `T` is unchecked here —
 * callers must validate the shape (this layer only guarantees "parsed JSON").
 */
export async function generateJSON<T>(prompt: string, opts: LlmGenerateOptions = {}): Promise<T | null> {
  const raw = await generateText(prompt, { ...opts, json: true });
  if (!raw) return null;
  try {
    return JSON.parse(stripCodeFence(raw)) as T;
  } catch {
    return null;
  }
}

/**
 * Some models wrap JSON in a ```json fence even when asked for raw JSON. Strip a
 * leading/trailing fence so JSON.parse succeeds.
 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}
