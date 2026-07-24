import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PiggyBank, AlertCircle, RefreshCw, Loader2, Lock, X, Check, Wallet, Sparkles } from 'lucide-react';
import api from '../../lib/api';
import { formatPeso } from './formatPeso';
import { useSavingsNudge, type SavingsNudgeReason } from '../../hooks/useSavingsNudge';

/**
 * Piggybank_Card — Budget Categories page savings summary + spending controls.
 *
 * Fetches `GET /api/savings/piggybank` and `GET /api/savings/settings` through
 * the shared axios singleton (which attaches the Bearer token and `x-timezone`
 * header) under a single 30 s `AbortController` ceiling. It renders the
 * Total_Savings_Balance and Total_Accrued_Savings plus a per-category list that
 * shows BOTH the accrued and available balance for every category.
 *
 * Beyond the read-only display it also drives the savings write flows:
 *  - an enable toggle + disabled state that offers to switch savings on
 *    (`PUT /api/savings/settings`);
 *  - a set/change-PIN affordance (`PUT /api/savings/settings/pin`) with a
 *    client-side 6-digit format check — the PIN is never rendered back;
 *  - a PIN-gated use-savings action per category
 *    (`POST /api/savings/categories/:categoryId/usage`) whose PIN-not-set,
 *    incorrect-PIN, and PIN-locked outcomes surface as distinct messages while
 *    the read-only balances stay on screen.
 *
 * Display-state handling (savings-piggybank Requirement 11):
 *  - 11.1 loading  — a loading indicator shows immediately (≤200 ms) with no
 *                     stale/previously-loaded data visible.
 *  - 11.2 error    — an error message + enabled retry control, while retaining
 *                     any previously displayed data.
 *  - 11.3 timeout  — a request that does not resolve within 30 s is aborted and
 *                     treated as a failure (falls into the 11.2 error state).
 *  - 11.4 retry    — activating retry re-issues the requests and returns to the
 *                     loading state.
 *  - 11.5 empty    — enabled with nothing accrued shows explanatory copy
 *                     instead of a bare ₱0.00 figure.
 *  - 11.7 populated— renders the total and a row for every returned category.
 *  - 11.9 currency — every amount is formatted with {@link formatPeso}.
 *  - 11.10 disabled— savings-off state with an enable control.
 *  - 11.12 layout  — per-category entries use a ≥ 2-column grid at ≥ 640px.
 *
 * @see Requirements 5.5, 11.1-11.12, 12.1, 12.2, 12.3, 12.5, 12.6, 12.7, 12.17
 */

/** Per-category savings figures (GET /api/savings/piggybank). */
interface CategorySavings {
  categoryId: string;
  categoryName: string;
  accruedSavings: number;
  savingsBalance: number;
}

/** Response shape of GET /api/savings/piggybank (see design.md). */
interface PiggybankData {
  totalSavingsBalance: number;
  totalAccruedSavings: number;
  aggregateShortfall: number;
  categories: CategorySavings[];
  incomplete?: boolean;
}

/** Response shape of GET /api/savings/settings (the PIN value is never returned). */
interface SavingsSettings {
  enabled: boolean;
  enabledAt: string | null;
  pinSet: boolean;
}

type Status = 'loading' | 'success' | 'error';

/** 30-second request ceiling shared by the savings fetches (Requirement 11.3). */
const REQUEST_TIMEOUT_MS = 30_000;

/** Exactly six digits, matching the backend PIN_REGEX (Requirement 12.2). */
const PIN_REGEX = /^[0-9]{6}$/;
/** Positive monetary amount with at most two decimal places (Requirement 12.11). */
const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

/** Narrow an unknown thrown value to the shape axios errors carry. */
function readAxiosError(err: unknown): { status?: number; message?: string } {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
    return {
      status: axiosErr.response?.status,
      message: axiosErr.response?.data?.error,
    };
  }
  return {};
}

/**
 * Map a usage-endpoint failure to a distinct, user-facing message.
 *
 * The three PIN outcomes are kept deliberately distinct (Requirements 12.5,
 * 12.6, 12.7, 12.17): PIN-not-set (400 with a PIN hint), incorrect-PIN (401),
 * and PIN-locked (409/423). Other 400s (over-withdrawal, invalid amount) surface
 * the server-provided message.
 */
function usageErrorMessage(err: unknown): string {
  const { status, message } = readAxiosError(err);
  if (status === 401) {
    return 'That PIN is incorrect. Please try again.';
  }
  if (status === 409 || status === 423) {
    return (
      message ||
      'Savings spending is temporarily locked after too many incorrect PIN attempts. Try again later.'
    );
  }
  if (status === 400) {
    // A missing/unset PIN is reported as a 400 whose message mentions the PIN.
    if (message && /pin/i.test(message)) {
      return message;
    }
    if (!message) {
      return 'Please set a Savings PIN before spending savings.';
    }
    return message;
  }
  return message || 'Could not use savings right now. Please try again.';
}

const cardClass =
  'bg-surface rounded-2xl shadow-sm animate-scaleIn transform-origin-center';
const cardHeaderIcon =
  'w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0';

/** Shared card chrome so every display state renders the same header. */
const CardShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={cardClass} style={{ padding: '24px' }}>
    <div className="flex items-center gap-3 mb-5">
      <div className={cardHeaderIcon}>
        <PiggyBank className="w-5 h-5" />
      </div>
      <h2 className="font-display font-semibold text-lg text-foreground">Savings Piggybank</h2>
    </div>
    {children}
  </div>
);

const PiggybankCardComponent: React.FC = () => {
  const [status, setStatus] = useState<Status>('loading');
  // `data`/`settings` hold the last successful payloads. They are retained across
  // an error so the error state can keep prior data on screen (Requirement 11.2),
  // but are never rendered while `status === 'loading'` (Requirement 11.1).
  const [data, setData] = useState<PiggybankData | null>(null);
  const [settings, setSettings] = useState<SavingsSettings | null>(null);

  // ── Enable-toggle state (Requirements 11.10, 9.2) ──────────────────
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);

  // ── Set/change-PIN state (Requirements 12.1, 12.2, 12.3) ───────────
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinNotice, setPinNotice] = useState<string | null>(null);

  // ── Use-savings state (Requirements 12.5, 12.6, 12.7, 12.17) ───────
  const [usageTarget, setUsageTarget] = useState<CategorySavings | null>(null);
  const [usageAmount, setUsageAmount] = useState('');
  const [usagePin, setUsagePin] = useState('');
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageSubmitting, setUsageSubmitting] = useState(false);
  const [usageNotice, setUsageNotice] = useState<string | null>(null);

  // Tracks the in-flight read request so we can abort a superseded/unmounted
  // fetch and ignore its late resolution.
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchSavings = useCallback(async () => {
    // Abort any request already in flight before starting a fresh one.
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('loading');

    // `didTimeout` distinguishes a real 30 s timeout abort (which must surface
    // the error state, Requirement 11.3) from a supersede/unmount abort (which
    // must not).
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      // Both reads share the single 30 s ceiling (Requirement 11.3).
      const [piggybankRes, settingsRes] = await Promise.all([
        api.get<PiggybankData>('/savings/piggybank', { signal: controller.signal }),
        api.get<SavingsSettings>('/savings/settings', { signal: controller.signal }),
      ]);
      if (controller.signal.aborted || !mountedRef.current) return;
      setData(piggybankRes.data);
      setSettings(settingsRes.data);
      setStatus('success');
    } catch {
      if (!mountedRef.current) return;
      // Ignore aborts from a superseded or unmounted fetch — React StrictMode
      // double-invokes the mount effect in dev (and rapid navigation re-fetches),
      // and the cancelled first request must NOT flash the error state. Only a
      // genuine failure or the 30 s timeout surfaces the error (Req 11.2, 11.3).
      if (controller.signal.aborted && !didTimeout) return;
      setStatus('error');
    } finally {
      clearTimeout(timeoutId);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchSavings();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, [fetchSavings]);

  // ── Enable savings (Requirement 11.10 → PUT /settings) ─────────────
  const handleEnable = useCallback(async () => {
    setEnableError(null);
    setEnabling(true);
    try {
      await api.put('/savings/settings', { enabled: true });
      if (!mountedRef.current) return;
      await fetchSavings();
    } catch (err) {
      if (!mountedRef.current) return;
      setEnableError(readAxiosError(err).message || 'Could not enable savings. Please try again.');
    } finally {
      if (mountedRef.current) setEnabling(false);
    }
  }, [fetchSavings]);

  // ── Set/change the Savings_PIN (Requirements 12.1, 12.2, 12.3) ─────
  const resetPinForm = useCallback(() => {
    setShowPinForm(false);
    setPinInput('');
    setPinError(null);
  }, []);

  const handlePinSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setPinNotice(null);
      // Client-side format validation surfaces errors WITHOUT issuing a request
      // on invalid input (Requirement 12.2).
      if (!PIN_REGEX.test(pinInput)) {
        setPinError('PIN must be exactly 6 digits (0-9).');
        return;
      }
      setPinError(null);
      setPinSubmitting(true);
      try {
        // The PIN is sent once and never echoed back into any state (Req 12.3).
        await api.put('/savings/settings/pin', { pin: pinInput });
        if (!mountedRef.current) return;
        setPinInput('');
        setShowPinForm(false);
        setPinNotice('Your Savings PIN has been saved.');
        await fetchSavings();
      } catch (err) {
        if (!mountedRef.current) return;
        setPinError(readAxiosError(err).message || 'Could not save your PIN. Please try again.');
      } finally {
        if (mountedRef.current) setPinSubmitting(false);
      }
    },
    [pinInput, fetchSavings],
  );

  // ── Use savings (Requirements 12.5, 12.6, 12.7, 12.17) ─────────────
  const openUsage = useCallback((cat: CategorySavings) => {
    setUsageTarget(cat);
    setUsageAmount('');
    setUsagePin('');
    setUsageError(null);
    setUsageNotice(null);
  }, []);

  const closeUsage = useCallback(() => {
    setUsageTarget(null);
    setUsageAmount('');
    setUsagePin('');
    setUsageError(null);
    setUsageSubmitting(false);
  }, []);

  const handleUsageSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!usageTarget) return;
      setUsageNotice(null);

      // Client-side validation avoids a doomed request (Requirements 12.2, 12.11).
      if (!AMOUNT_REGEX.test(usageAmount) || Number(usageAmount) <= 0) {
        setUsageError('Enter an amount greater than ₱0.00 with at most two decimals.');
        return;
      }
      if (Number(usageAmount) > usageTarget.savingsBalance) {
        setUsageError('Amount exceeds the available savings for this category.');
        return;
      }
      if (!PIN_REGEX.test(usagePin)) {
        setUsageError('PIN must be exactly 6 digits (0-9).');
        return;
      }
      setUsageError(null);
      setUsageSubmitting(true);
      try {
        await api.post(`/savings/categories/${usageTarget.categoryId}/usage`, {
          amount: Number(usageAmount),
          pin: usagePin,
        });
        if (!mountedRef.current) return;
        const movedName = usageTarget.categoryName;
        const movedAmount = Number(usageAmount);
        closeUsage();
        setUsageNotice(`Moved ${formatPeso(movedAmount)} from savings into ${movedName}'s budget.`);
        await fetchSavings();
      } catch (err) {
        if (!mountedRef.current) return;
        // Distinct PIN-not-set / incorrect-PIN / PIN-locked messaging; the PIN
        // input is cleared but read-only balances stay visible (Req 12.17).
        setUsagePin('');
        setUsageError(usageErrorMessage(err));
      } finally {
        if (mountedRef.current) setUsageSubmitting(false);
      }
    },
    [usageTarget, usageAmount, usagePin, closeUsage, fetchSavings],
  );

  // ── AI savings nudge (feature-spec-ai-savings-notifications, Group 1) ──
  // Lazily fetched AFTER the piggybank loads; gated on savings being enabled so
  // no request is made while disabled. Fully graceful — an empty nudge renders
  // no band. Called unconditionally (before the early returns) per hook rules.
  const nudge = useSavingsNudge(
    status === 'success' && settings?.enabled && data
      ? {
          enabled: true,
          totalSavingsBalance: data.totalSavingsBalance,
          totalAccruedSavings: data.totalAccruedSavings ?? 0,
          aggregateShortfall: data.aggregateShortfall ?? 0,
          topCategories: data.categories.map((c) => ({
            categoryName: c.categoryName,
            accruedSavings: c.accruedSavings,
          })),
        }
      : null,
  );

  // ── Loading (Requirement 11.1) ──────────────────────────────────────
  // A skeleton placeholder consistent with the Categories page's other cards
  // rather than a bare spinner. The accessible status role + sr-only text are
  // retained so screen readers still announce the busy state.
  if (status === 'loading') {
    return (
      <CardShell>
        <div role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">Loading your savings…</span>
          <div className="animate-pulse" aria-hidden="true">
            {/* Totals row placeholder (available + accrued) */}
            <div className="flex flex-wrap gap-x-8 gap-y-3 mb-5">
              <div className="flex flex-col gap-2">
                <div className="h-2.5 w-24 bg-surface-hover rounded" />
                <div className="h-8 w-36 bg-surface-hover rounded-lg" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="h-2.5 w-20 bg-surface-hover rounded" />
                <div className="h-7 w-28 bg-surface-hover rounded-lg" />
              </div>
            </div>
            {/* Per-category rows placeholder (≥ 2-column grid at ≥ 640px) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border pt-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-surface-hover rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </CardShell>
    );
  }

  // ── Error (Requirements 11.2, 11.3) ─────────────────────────────────
  if (status === 'error') {
    const showRetainedData = data !== null && settings !== null;
    return (
      <CardShell>
        <div
          className="flex items-start gap-2.5 p-4 rounded-2xl bg-error/10 border border-error/20 text-error text-sm font-sans"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-grow">
            <p>Savings data could not be loaded.</p>
            <button
              type="button"
              onClick={fetchSavings}
              className="mt-2 inline-flex items-center gap-1.5 px-3 h-9 bg-surface-hover text-foreground hover:bg-border/50 font-display font-semibold text-xs rounded-xl transition-[transform,background-color] duration-150 ease-out-emil btn-active-tactile cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>

        {/* Requirement 11.2 — retain previously displayed data on failure. */}
        {showRetainedData && (
          <div className="mt-5 opacity-60" aria-hidden="false">
            <PiggybankBody data={data} settings={settings} onUse={openUsage} />
          </div>
        )}
      </CardShell>
    );
  }

  // status === 'success' — both payloads are present.
  const populatedData = data as PiggybankData;
  const populatedSettings = settings as SavingsSettings;

  // ── Disabled (Requirement 11.10) ────────────────────────────────────
  if (!populatedSettings.enabled) {
    return (
      <CardShell>
        <div className="flex flex-col items-center justify-center py-8 text-center px-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4">
            <PiggyBank className="w-6 h-6" />
          </div>
          <p className="text-sm text-muted font-sans max-w-xs leading-relaxed mb-5">
            Savings are turned off. Enable savings to start setting aside your leftover funded
            budget when each budget period closes.
          </p>
          {enableError && (
            <div
              className="flex items-center gap-2 p-2.5 mb-3 rounded-xl bg-error/10 border border-error/20 text-error text-xs font-sans w-full max-w-xs"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{enableError}</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleEnable}
            disabled={enabling}
            className="inline-flex items-center gap-2 px-4 h-10 bg-primary text-white hover:bg-primary-hover font-display font-semibold text-sm rounded-xl transition-[transform,background-color] duration-150 ease-out-emil btn-active-tactile cursor-pointer disabled:opacity-60"
            data-testid="piggybank-enable"
          >
            {enabling ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <PiggyBank className="w-4 h-4" aria-hidden="true" />
            )}
            Enable savings
          </button>
        </div>
      </CardShell>
    );
  }

  // ── Empty while enabled (Requirement 11.5) ──────────────────────────
  const isEmpty =
    populatedData.totalSavingsBalance === 0 &&
    (populatedData.totalAccruedSavings ?? 0) === 0 &&
    (populatedData.aggregateShortfall ?? 0) === 0 &&
    populatedData.categories.length === 0;

  return (
    <CardShell>
      {/* PIN management + confirmations sit above the balances so the read-only
          figures always remain visible (Requirement 12.17). */}
      <PinControls
        pinSet={populatedSettings.pinSet}
        showForm={showPinForm}
        pinInput={pinInput}
        pinError={pinError}
        pinSubmitting={pinSubmitting}
        pinNotice={pinNotice}
        onOpen={() => {
          setPinNotice(null);
          setShowPinForm(true);
        }}
        onChange={setPinInput}
        onSubmit={handlePinSubmit}
        onCancel={resetPinForm}
      />

      {/* AI savings nudge band — a single motivating line above the totals. Only
          renders when there's something worth saying (Group 1). */}
      <NudgeBand reason={nudge.reason} text={nudge.nudgeText} source={nudge.source} />

      {usageNotice && (
        <div
          className="flex items-center gap-2 p-2.5 mb-4 rounded-xl bg-success/10 border border-success/20 text-success text-xs font-sans"
          role="status"
        >
          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{usageNotice}</span>
        </div>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-8 text-center px-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4 animate-float">
            <PiggyBank className="w-6 h-6" />
          </div>
          <p className="text-sm text-muted font-sans max-w-xs leading-relaxed">
            Your piggybank is ready. Savings accrue automatically when a budget period closes and
            you have leftover funded budget.
          </p>
        </div>
      ) : (
        <PiggybankBody data={populatedData} settings={populatedSettings} onUse={openUsage} />
      )}

      {/* Use-savings flow — collects the amount and 6-digit PIN (Req 12.5). */}
      {usageTarget && (
        <UsageForm
          target={usageTarget}
          amount={usageAmount}
          pin={usagePin}
          error={usageError}
          submitting={usageSubmitting}
          onAmountChange={setUsageAmount}
          onPinChange={setUsagePin}
          onSubmit={handleUsageSubmit}
          onCancel={closeUsage}
        />
      )}
    </CardShell>
  );
};

/**
 * Savings nudge band (Group 1). A single ≤160-char motivating line in a subtle
 * rounded band above the totals. `SHORTFALL` gets a gentle warning tint; every
 * other reason uses the neutral primary tint. Renders nothing when there is no
 * nudge (reason NONE / off / empty), so the empty and disabled states are
 * unaffected. `aria-live="polite"` announces it once.
 *
 * The `Sparkles` "AI" pill appears ONLY when the copy is AI-sourced
 * (`source === 'ai'`); a heuristic fallback line shows no AI pill (spec Group 1
 * fallback state), keeping only the `SHORTFALL` warning icon when relevant.
 */
const NudgeBand: React.FC<{ reason: SavingsNudgeReason; text: string; source: 'ai' | 'fallback' }> = ({
  reason,
  text,
  source,
}) => {
  if (!text) return null;
  const warn = reason === 'SHORTFALL';
  const isAi = source === 'ai';
  const tint = warn
    ? 'bg-warning/10 text-warning border border-warning/20'
    : 'bg-primary/5 text-muted border border-primary/10';
  return (
    <div
      className={`flex items-start gap-2 p-3 mb-5 rounded-xl text-xs font-sans leading-relaxed ${tint}`}
      role="status"
      aria-live="polite"
      data-testid="piggybank-nudge"
    >
      {isAi ? (
        <Sparkles
          className={`w-4 h-4 shrink-0 mt-0.5 ${warn ? 'text-warning' : 'text-primary'}`}
          role="img"
          aria-label="AI-generated savings nudge"
        />
      ) : warn ? (
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-warning" aria-hidden="true" />
      ) : null}
      <span className="flex-grow">{text}</span>
    </div>
  );
};

/**
 * Set/change-PIN affordance. The "Set" vs "Change" label is driven by the
 * settings `pinSet` flag (Requirement 12.1); the PIN value is never rendered
 * back (Requirement 12.3).
 */
const PinControls: React.FC<{
  pinSet: boolean;
  showForm: boolean;
  pinInput: string;
  pinError: string | null;
  pinSubmitting: boolean;
  pinNotice: string | null;
  onOpen: () => void;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}> = ({ pinSet, showForm, pinInput, pinError, pinSubmitting, pinNotice, onOpen, onChange, onSubmit, onCancel }) => (
  <div className="mb-5">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Lock className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
        <span className="text-xs font-sans text-muted truncate">
          {pinSet ? 'A Savings PIN is set' : 'No Savings PIN set yet'}
        </span>
      </div>
      {!showForm && (
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 px-3 h-9 bg-surface-hover text-foreground hover:bg-border/50 font-display font-semibold text-xs rounded-xl transition-[transform,background-color] duration-150 ease-out-emil btn-active-tactile cursor-pointer shrink-0"
          data-testid="piggybank-pin-open"
        >
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
          {pinSet ? 'Change PIN' : 'Set PIN'}
        </button>
      )}
    </div>

    {pinNotice && !showForm && (
      <div
        className="flex items-center gap-2 p-2.5 mt-3 rounded-xl bg-success/10 border border-success/20 text-success text-xs font-sans"
        role="status"
      >
        <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{pinNotice}</span>
      </div>
    )}

    {showForm && (
      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 font-sans">
        <label htmlFor="savings-pin-input" className="text-[10px] text-muted font-bold font-display uppercase tracking-wider">
          {pinSet ? 'New 6-digit PIN' : '6-digit PIN'}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="savings-pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pinInput}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            className="w-32 h-10 bg-background border border-border rounded-xl px-3 tracking-[0.4em] text-center text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-[border-color,box-shadow] duration-200 ease-out text-sm"
            data-testid="piggybank-pin-input"
          />
          <button
            type="submit"
            disabled={pinSubmitting}
            className="w-10 h-10 flex items-center justify-center bg-success text-white rounded-xl hover:bg-success/80 transition-[transform,background-color] duration-150 ease-out-emil cursor-pointer btn-active-tactile disabled:opacity-50 shrink-0"
            aria-label="Save PIN"
          >
            {pinSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-10 h-10 flex items-center justify-center bg-surface-hover text-foreground rounded-xl hover:bg-border/50 transition-[transform,background-color] duration-150 ease-out-emil cursor-pointer btn-active-tactile shrink-0"
            aria-label="Cancel PIN change"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {pinError && (
          <div
            className="flex items-center gap-2 p-2.5 rounded-xl bg-error/10 border border-error/20 text-error text-xs"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{pinError}</span>
          </div>
        )}
      </form>
    )}
  </div>
);

/**
 * Inline use-savings form. Collects the amount and 6-digit PIN and posts them to
 * the usage endpoint. Distinct PIN outcomes are surfaced by the caller while the
 * read-only balances above stay on screen (Requirement 12.17).
 */
const UsageForm: React.FC<{
  target: CategorySavings;
  amount: string;
  pin: string;
  error: string | null;
  submitting: boolean;
  onAmountChange: (value: string) => void;
  onPinChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}> = ({ target, amount, pin, error, submitting, onAmountChange, onPinChange, onSubmit, onCancel }) => (
  <form
    onSubmit={onSubmit}
    className="mt-5 border-t border-border pt-4 flex flex-col gap-3 font-sans animate-fadeInFast"
    data-testid="piggybank-usage-form"
  >
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-display font-semibold text-foreground truncate" title={target.categoryName}>
        Move to budget — {target.categoryName}
      </p>
      <span className="text-xs text-muted shrink-0">
        Available <span className="font-mono text-foreground">{formatPeso(target.savingsBalance)}</span>
      </span>
    </div>

    <p className="text-xs text-muted leading-relaxed">
      This adds the amount to {target.categoryName}&rsquo;s budget for the current period. Anything
      you don&rsquo;t spend returns to savings when the period ends.
    </p>

    <div className="flex flex-col sm:flex-row gap-2">
      <div className="flex flex-col gap-1 flex-1">
        <label htmlFor="usage-amount-input" className="text-[10px] text-muted font-bold font-display uppercase tracking-wider">
          Amount (₱)
        </label>
        <input
          id="usage-amount-input"
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="0.00"
          className="w-full h-10 bg-background border border-border rounded-xl px-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-[border-color,box-shadow] duration-200 ease-out text-sm"
          data-testid="piggybank-usage-amount"
        />
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <label htmlFor="usage-pin-input" className="text-[10px] text-muted font-bold font-display uppercase tracking-wider">
          Savings PIN
        </label>
        <input
          id="usage-pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => onPinChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="••••••"
          className="w-full h-10 bg-background border border-border rounded-xl px-3 tracking-[0.3em] text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-[border-color,box-shadow] duration-200 ease-out text-sm"
          data-testid="piggybank-usage-pin"
        />
      </div>
    </div>

    {error && (
      <div
        className="flex items-center gap-2 p-2.5 rounded-xl bg-error/10 border border-error/20 text-error text-xs"
        role="alert"
      >
        <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{error}</span>
      </div>
    )}

    <div className="flex gap-2">
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-1.5 px-4 h-10 bg-primary text-white hover:bg-primary-hover font-display font-semibold text-sm rounded-xl transition-[transform,background-color] duration-150 ease-out-emil btn-active-tactile cursor-pointer disabled:opacity-60"
        data-testid="piggybank-usage-submit"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
        Move to budget
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center px-4 h-10 bg-surface-hover text-foreground hover:bg-border/50 font-display font-semibold text-sm rounded-xl transition-[transform,background-color] duration-150 ease-out-emil btn-active-tactile cursor-pointer"
      >
        Cancel
      </button>
    </div>
  </form>
);

/**
 * Total + per-category rows. Extracted so the error state can re-render the same
 * body when retaining prior data (Requirement 11.2). Each category shows BOTH
 * its accrued and available balance in a ≥ 2-column grid at ≥ 640px (Req 11.12).
 */
const PiggybankBody: React.FC<{
  data: PiggybankData;
  settings: SavingsSettings;
  onUse: (cat: CategorySavings) => void;
}> = ({ data, settings, onUse }) => (
  <div className="font-sans">
    {/* Totals — available (spendable) and accrued (Requirements 11.7, 11.9) */}
    <div className="flex flex-wrap gap-x-8 gap-y-3 mb-5">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted font-bold font-display uppercase tracking-wider">
          Available to Spend
        </span>
        <span className="font-mono font-bold text-3xl text-foreground" data-testid="piggybank-total">
          {formatPeso(data.totalSavingsBalance)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted font-bold font-display uppercase tracking-wider">
          Total Accrued
        </span>
        <span
          className="font-mono font-semibold text-2xl text-muted"
          data-testid="piggybank-total-accrued"
        >
          {formatPeso(data.totalAccruedSavings ?? 0)}
        </span>
      </div>
    </div>

    {data.aggregateShortfall > 0 && (
      <p className="text-xs text-muted -mt-3 mb-4">
        Overspend shortfall:{' '}
        <span className="font-mono text-error/80">{formatPeso(data.aggregateShortfall)}</span>
      </p>
    )}

    {/* Per-category rows — ≥ 2-column grid at ≥ 640px (Requirement 11.12) */}
    {data.categories.length > 0 && (
      <ul
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border pt-4"
        data-testid="piggybank-category-grid"
      >
        {data.categories.map((cat) => (
          <li
            key={cat.categoryId}
            className="flex flex-col gap-1.5 p-3 rounded-xl bg-background/60 border border-border"
            data-testid="piggybank-category-row"
          >
            <span
              className="text-sm font-semibold text-foreground truncate min-w-0"
              title={cat.categoryName}
            >
              {cat.categoryName}
            </span>
            <div className="flex items-end justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted font-bold font-display uppercase tracking-wider">
                  Available
                </span>
                <span
                  className="font-mono text-sm font-semibold text-foreground"
                  data-testid="piggybank-category-available"
                >
                  {formatPeso(cat.savingsBalance)}
                </span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[10px] text-muted font-bold font-display uppercase tracking-wider">
                  Accrued
                </span>
                <span
                  className="font-mono text-sm text-muted"
                  data-testid="piggybank-category-accrued"
                >
                  {formatPeso(cat.accruedSavings)}
                </span>
              </div>
            </div>
            {settings.enabled && cat.savingsBalance > 0 && (
              <button
                type="button"
                onClick={() => onUse(cat)}
                className="mt-1 inline-flex items-center justify-center gap-1.5 px-3 h-8 bg-surface-hover text-foreground hover:bg-border/50 font-display font-semibold text-xs rounded-lg transition-[transform,background-color] duration-150 ease-out-emil btn-active-tactile cursor-pointer"
                data-testid="piggybank-use-savings"
              >
                <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
                Move to budget
              </button>
            )}
          </li>
        ))}
      </ul>
    )}

    {data.incomplete && (
      <p className="text-[11px] text-muted/70 mt-3 italic">
        Some periods couldn&rsquo;t be calculated, so these totals may be incomplete.
      </p>
    )}
  </div>
);

export const PiggybankCard = React.memo(PiggybankCardComponent);

export default PiggybankCard;
