import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LineChart, AlertCircle, RefreshCw, TrendingUp, PiggyBank } from 'lucide-react';
import api from '../../lib/api';
import { formatPeso } from './formatPeso';

/**
 * Savings_Graph — Dashboard cumulative-savings line chart.
 *
 * Fetches `GET /api/savings/timeseries` and `GET /api/savings/settings` through
 * the shared axios singleton (which already attaches the Bearer token and
 * `x-timezone` header) and draws a hand-rolled SVG line chart of cumulative
 * accrued savings over time, plotting exactly one point per returned data point.
 * The chart is drawn without a third-party charting dependency, matching the
 * approach used by the existing `BudgetForecastBarChart` / `SpendingDonutChart`
 * components.
 *
 * View toggle (Requirements 6.11, 6.12):
 *  - `total`      — one cumulative Total_Accrued_Savings line (`view=total`).
 *  - `byCategory` — one cumulative line per category (`view=byCategory`),
 *                   re-fetched from the API when the toggle changes.
 *
 * Layout (Requirements 6.9, 6.10):
 *  - 6.9  — at desktop viewports (≥ 1024 CSS px) the plotting area is capped at
 *           a height of 260 CSS px.
 *  - 6.10 — the graph is rendered after `FinancialOverviewPanel` in
 *           `Dashboard.tsx` document order (see the Dashboard page).
 *
 * Display-state handling (savings-piggybank Requirement 11):
 *  - 11.1  loading  — a loading indicator shows immediately (≤200 ms) with no
 *                     stale/previously-loaded data visible.
 *  - 11.2  error    — an error message + enabled retry control, while retaining
 *                     any previously displayed data.
 *  - 11.3  timeout  — a request that does not resolve within 30 s is aborted and
 *                     treated as a failure (falls into the 11.2 error state).
 *  - 11.4  retry    — activating retry re-issues the request and returns to the
 *                     loading state.
 *  - 11.6  empty    — a series with 0 data points shows an empty-state message
 *                     instead of rendering a blank chart.
 *  - 11.8  populated— renders one plotted point per returned data point.
 *  - 11.10 disabled — when settings report `enabled=false`, a disabled state is
 *                     shown instead of plotting any line.
 *
 * The optional time-range selector re-issues the request with the corresponding
 * `rangeStart` / `rangeEnd` query parameters (Requirements 6.3, 6.5, 6.7).
 *
 * @see Requirements 6.3, 6.7, 6.9, 6.10, 6.11, 6.12, 11.1, 11.2, 11.3, 11.4, 11.6, 11.8, 11.10
 */

/** One cumulative point of the time series (GET /api/savings/timeseries). */
interface TimeSeriesPoint {
  /** ISO instant of the closed period's `periodEnd`. */
  periodEnd: string;
  /** Running cumulative accrued savings as of `periodEnd`, rounded to 2dp. */
  cumulativeBalance: number;
  /** Running available savings balance (accrued - applied usages) as of `periodEnd`, 2dp. */
  currentBalance?: number;
}

/** One category's cumulative accrued series (view=byCategory). */
interface CategorySeries {
  categoryId: string;
  categoryName: string;
  points: TimeSeriesPoint[];
}

/**
 * Discriminated-union response of GET /api/savings/timeseries (see design.md):
 *  - `total`      → a single cumulative series across all categories.
 *  - `byCategory` → one cumulative series per category.
 */
type TimeSeriesResponse =
  | { view: 'total'; points: TimeSeriesPoint[] }
  | { view: 'byCategory'; series: CategorySeries[] };

/** Response of GET /api/savings/settings — the PIN value is never returned. */
interface SavingsSettingsResponse {
  enabled: boolean;
  enabledAt: string | null;
  pinSet: boolean;
}

type Status = 'loading' | 'success' | 'error';
type View = 'total' | 'byCategory';

/** 30-second request ceiling shared by the savings fetches (Requirement 11.3). */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Desktop plotting-area height ceiling in CSS pixels (Requirement 6.9). Applied
 * as an inline `maxHeight` on the plotting area so the chart never renders taller
 * than this, regardless of the container width at wide (≥ 1024px) viewports.
 */
const PLOT_MAX_HEIGHT_PX = 260;

/**
 * Per-category line colors for the by-category view. The first entry reuses the
 * app primary so the single-category case matches the total-view line; the rest
 * are distinct hues cycled for additional categories.
 */
const SERIES_COLORS = [
  'var(--color-primary)',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
] as const;

const colorForIndex = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length];

/** View-toggle options (Requirements 6.11, 6.12). */
const VIEW_OPTIONS: Array<{ key: View; label: string }> = [
  { key: 'total', label: 'Total' },
  { key: 'byCategory', label: 'By category' },
];

/**
 * Time-range presets for the optional selector (Requirements 6.5, 6.7).
 *
 * `recent` sends no range parameters so the API returns its default most-recent
 * window (12 closed periods, Requirement 6.4). Every other option constrains the
 * series to `[rangeStart, rangeEnd]`.
 */
const RANGE_OPTIONS = [
  { key: 'recent', label: 'Recent' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'All' },
] as const;

type RangeKey = (typeof RANGE_OPTIONS)[number]['key'];

/** Translate a selected range preset into `timeseries` query parameters. */
function buildRangeParams(range: RangeKey): Record<string, string> {
  if (range === 'recent') return {};

  const now = new Date();
  const rangeEnd = now.toISOString();

  if (range === 'all') {
    // A very early start ensures the full history is returned rather than the
    // default most-recent window.
    return { rangeStart: new Date('1900-01-01T00:00:00.000Z').toISOString(), rangeEnd };
  }

  const start = new Date(now);
  if (range === '3m') start.setMonth(start.getMonth() - 3);
  else if (range === '6m') start.setMonth(start.getMonth() - 6);
  else if (range === '1y') start.setFullYear(start.getFullYear() - 1);

  return { rangeStart: start.toISOString(), rangeEnd };
}

const cardClass = 'bg-surface rounded-2xl shadow-sm animate-scaleIn transform-origin-center';

const CardHeader: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
        <LineChart className="w-5 h-5" />
      </div>
      <h2 className="font-display font-semibold text-lg text-foreground truncate">Savings Over Time</h2>
    </div>
    {children}
  </div>
);

/**
 * The plotting-area wrapper enforces the desktop height ceiling (Requirement
 * 6.9). The cap is applied as an inline `maxHeight`, which bounds the chart at
 * ≥ 1024px viewports (where the card is wide enough for the SVG's intrinsic
 * aspect ratio to otherwise exceed 260px) and is harmless at narrower widths.
 */
const PlotArea: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="w-full overflow-hidden"
    data-testid="savings-plot-area"
    style={{ maxHeight: PLOT_MAX_HEIGHT_PX }}
  >
    {children}
  </div>
);

const SavingsGraphComponent: React.FC = () => {
  const [status, setStatus] = useState<Status>('loading');
  // Account-wide savings enable flag (GET /savings/settings). `null` until the
  // first successful load. When `false`, the graph shows a disabled state and
  // never plots a line (Requirement 11.10).
  const [enabled, setEnabled] = useState<boolean | null>(null);
  // Last successful payloads. Retained across an error so the error state can
  // keep prior data on screen (Requirement 11.2), but never rendered while
  // `status === 'loading'` (Requirement 11.1).
  const [totalPoints, setTotalPoints] = useState<TimeSeriesPoint[] | null>(null);
  const [categorySeries, setCategorySeries] = useState<CategorySeries[] | null>(null);
  const [view, setView] = useState<View>('total');
  const [range, setRange] = useState<RangeKey>('recent');

  // Tracks the in-flight request so we can abort a superseded/unmounted fetch
  // and ignore its late resolution.
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async (selectedView: View, selectedRange: RangeKey) => {
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
      // Fetch settings (enable flag) and the time series together so the graph
      // resolves in a single loading pass. Both share the 30 s abort ceiling.
      const [settingsRes, seriesRes] = await Promise.all([
        api.get<SavingsSettingsResponse>('/savings/settings', { signal: controller.signal }),
        api.get<TimeSeriesResponse>('/savings/timeseries', {
          params: { view: selectedView, ...buildRangeParams(selectedRange) },
          signal: controller.signal,
        }),
      ]);

      if (controller.signal.aborted || !mountedRef.current) return;

      setEnabled(Boolean(settingsRes.data?.enabled));

      const data = seriesRes.data;
      if (data && data.view === 'byCategory') {
        setCategorySeries(data.series ?? []);
        setTotalPoints(null);
      } else {
        setTotalPoints((data?.points as TimeSeriesPoint[]) ?? []);
        setCategorySeries(null);
      }
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
    fetchData(view, range);
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, [fetchData, view, range]);

  const handleRetry = useCallback(() => {
    fetchData(view, range);
  }, [fetchData, view, range]);

  // View toggle chips (total ⇄ by category). Disabled while loading so a click
  // cannot stack fetches.
  const viewSelector = (
    <div
      className="flex items-center gap-1 rounded-xl bg-surface-hover/60 p-1"
      role="group"
      aria-label="Select savings view"
      data-testid="savings-view-toggle"
    >
      {VIEW_OPTIONS.map((opt) => {
        const active = opt.key === view;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => setView(opt.key)}
            aria-pressed={active}
            data-testid={`savings-view-${opt.key}`}
            className={`px-2.5 h-7 rounded-lg text-xs font-display font-semibold transition-[background-color,color] duration-150 ease-out cursor-pointer ${
              active ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  // Range selector chips.
  const rangeSelector = (
    <div
      className="flex items-center gap-1 rounded-xl bg-surface-hover/60 p-1"
      role="group"
      aria-label="Select savings time range"
    >
      {RANGE_OPTIONS.map((opt) => {
        const active = opt.key === range;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => setRange(opt.key)}
            aria-pressed={active}
            className={`px-2.5 h-7 rounded-lg text-xs font-display font-semibold transition-[background-color,color] duration-150 ease-out cursor-pointer ${
              active ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  const controls = (
    <div className="flex items-center gap-2 flex-wrap">
      {viewSelector}
      {rangeSelector}
    </div>
  );

  // ── Loading (Requirement 11.1) ──────────────────────────────────────
  // A skeleton placeholder consistent with the Dashboard's other cards
  // (e.g. FinancialOverviewPanel) rather than a bare spinner. The accessible
  // status role + sr-only text are retained so screen readers still announce
  // the busy state.
  if (status === 'loading') {
    return (
      <div
        className={cardClass}
        style={{ padding: '24px' }}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="sr-only">Loading your savings history…</span>
        <CardHeader />
        <div className="animate-pulse" aria-hidden="true">
          {/* Total-accumulated figure placeholder */}
          <div className="flex flex-col gap-2 mb-4">
            <div className="h-2.5 w-28 bg-surface-hover rounded" />
            <div className="h-7 w-40 bg-surface-hover rounded-lg" />
          </div>
          {/* Plotting-area placeholder (within the desktop height cap) */}
          <div
            className="w-full bg-surface-hover rounded-xl"
            style={{ height: PLOT_MAX_HEIGHT_PX }}
          />
        </div>
      </div>
    );
  }

  // ── Error (Requirements 11.2, 11.3) ─────────────────────────────────
  if (status === 'error') {
    const hasRetainedTotal = enabled !== false && view === 'total' && (totalPoints?.length ?? 0) > 0;
    const hasRetainedByCategory =
      enabled !== false &&
      view === 'byCategory' &&
      (categorySeries?.some((s) => s.points.length > 0) ?? false);
    return (
      <div className={cardClass} style={{ padding: '24px' }}>
        <CardHeader>{controls}</CardHeader>

        <div
          className="flex items-start gap-2.5 p-4 rounded-2xl bg-error/10 border border-error/20 text-error text-sm font-sans"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-grow">
            <p>Savings data could not be loaded.</p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-2 inline-flex items-center gap-1.5 px-3 h-9 bg-surface-hover text-foreground hover:bg-border/50 font-display font-semibold text-xs rounded-xl transition-[transform,background-color] duration-150 ease-out-emil btn-active-tactile cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>

        {/* Requirement 11.2 — retain previously displayed data on failure. */}
        {hasRetainedTotal && (
          <div className="mt-5 opacity-60">
            <PlotArea>
              <SavingsLineChart points={totalPoints as TimeSeriesPoint[]} />
            </PlotArea>
          </div>
        )}
        {hasRetainedByCategory && (
          <div className="mt-5 opacity-60">
            <PlotArea>
              <SavingsMultiLineChart series={categorySeries as CategorySeries[]} />
            </PlotArea>
          </div>
        )}
      </div>
    );
  }

  // status === 'success'

  // ── Disabled (Requirement 11.10) ────────────────────────────────────
  // When savings are turned off, show a disabled state and plot no line.
  if (enabled === false) {
    return (
      <div className={cardClass} style={{ padding: '24px' }}>
        <CardHeader />
        <div
          className="flex flex-col items-center justify-center py-14 text-center px-2"
          data-testid="savings-disabled"
        >
          <div className="w-12 h-12 rounded-2xl bg-surface-hover flex items-center justify-center text-muted mb-4">
            <PiggyBank className="w-6 h-6" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted font-sans max-w-sm leading-relaxed">
            Savings is turned off. Enable savings from the piggybank on the Budget Categories page to
            start tracking your savings over time.
          </p>
        </div>
      </div>
    );
  }

  // ── By-category view (Requirements 6.11, 6.12) ──────────────────────
  if (view === 'byCategory') {
    const series = categorySeries ?? [];
    const hasPoints = series.some((s) => s.points.length > 0);

    // Empty state — no contributing periods across any category (Requirements 6.7, 11.6).
    if (!hasPoints) {
      return (
        <div className={cardClass} style={{ padding: '24px' }}>
          <CardHeader>{controls}</CardHeader>
          <EmptyState />
        </div>
      );
    }

    return (
      <div className={cardClass} style={{ padding: '24px' }}>
        <CardHeader>{controls}</CardHeader>
        <PlotArea>
          <SavingsMultiLineChart series={series} />
        </PlotArea>
        <CategoryLegend series={series} />
      </div>
    );
  }

  // ── Total view ──────────────────────────────────────────────────────
  const points = totalPoints ?? [];

  // Empty state (Requirements 6.7, 11.6).
  if (points.length === 0) {
    return (
      <div className={cardClass} style={{ padding: '24px' }}>
        <CardHeader>{controls}</CardHeader>
        <EmptyState />
      </div>
    );
  }

  // Populated (Requirements 6.3, 11.8).
  const latest = points[points.length - 1];
  const hasBalanceData = points.some((p) => p.currentBalance !== undefined);
  const usedAmount =
    latest.currentBalance !== undefined && latest.currentBalance < latest.cumulativeBalance
      ? Math.round((latest.cumulativeBalance - latest.currentBalance + Number.EPSILON) * 100) / 100
      : 0;

  return (
    <div className={cardClass} style={{ padding: '24px' }}>
      <CardHeader>{controls}</CardHeader>
      <div className="flex items-baseline justify-between gap-4 mb-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted font-bold font-display uppercase tracking-wider">
            Total Saved
          </span>
          <span className="font-mono font-bold text-2xl text-foreground" data-testid="savings-latest">
            {formatPeso(latest.cumulativeBalance)}
          </span>
        </div>
        {latest.currentBalance !== undefined && (
          <div className="flex flex-col gap-1 items-end">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold font-display uppercase tracking-wider">
                Current Balance
              </span>
              {usedAmount > 0 && (
                <span className="text-xs text-muted font-sans font-medium" data-testid="savings-used-delta">
                  ↓ {formatPeso(usedAmount)} used
                </span>
              )}
            </div>
            <span className="font-mono font-bold text-2xl text-emerald-600 dark:text-emerald-400" data-testid="savings-current-balance">
              {formatPeso(latest.currentBalance)}
            </span>
          </div>
        )}
      </div>
      <PlotArea>
        <SavingsLineChart points={points} />
      </PlotArea>
      {hasBalanceData && <TotalLegend hasBalanceData={hasBalanceData} />}
    </div>
  );
};

/** Shared empty-state block (Requirements 6.7, 11.6). */
const EmptyState: React.FC = () => (
  <div
    className="flex flex-col items-center justify-center py-14 text-center px-2"
    data-testid="savings-empty"
  >
    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4 animate-float">
      <TrendingUp className="w-6 h-6" />
    </div>
    <p className="text-sm text-muted font-sans max-w-sm leading-relaxed">
      No savings data available yet. Your savings graph fills in as budget periods close and leftover
      funded budget accrues.
    </p>
  </div>
);

/** Legend for the Total view showing Total Saved and Current Balance indicators. */
const TotalLegend: React.FC<{ hasBalanceData: boolean }> = ({ hasBalanceData }) => (
  <div className="flex items-center gap-x-5 gap-y-1.5 flex-wrap mt-4" data-testid="savings-total-legend">
    <div className="flex items-center gap-2">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: 'var(--color-primary)' }}
        aria-hidden="true"
      />
      <span className="text-xs font-sans text-muted">Total Saved</span>
    </div>
    {hasBalanceData && (
      <div className="flex items-center gap-2">
        <span
          className="w-4 h-0 border-b-2 border-dashed border-[#10b981] shrink-0"
          aria-hidden="true"
        />
        <span className="text-xs font-sans text-muted">Current Balance</span>
      </div>
    )}
  </div>
);

/** Legend mapping each category to its line color (by-category view). */
const CategoryLegend: React.FC<{ series: CategorySeries[] }> = ({ series }) => (
  <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap mt-4" data-testid="savings-legend">
    {series.map((s, i) => (
      <div key={s.categoryId} className="flex items-center gap-1.5 min-w-0">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: colorForIndex(i) }}
          aria-hidden="true"
        />
        <span className="text-xs font-sans text-muted truncate">{s.categoryName}</span>
      </div>
    ))}
  </div>
);

// Shared chart geometry (a fixed viewBox scaled responsively by the container).
const CHART_W = 640;
const CHART_H = 240;
const CHART_PAD = { top: 16, right: 20, bottom: 36, left: 64 };
const CHART_INNER_W = CHART_W - CHART_PAD.left - CHART_PAD.right;
const CHART_INNER_H = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

const formatAxisDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
};

/**
 * Hand-rolled SVG cumulative-savings line chart (total view).
 *
 * Plots the solid accrued savings line ("Total Saved") and optional dashed
 * available savings balance line ("Current Balance") with area fills and tooltip.
 */
const SavingsLineChart: React.FC<{ points: TimeSeriesPoint[] }> = ({ points }) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const {
    accruedLinePath,
    balanceLinePath,
    balanceAreaPath,
    usedAreaPath,
    plotted,
    yTicks,
    maxValue,
    hasDivergence,
  } = useMemo(() => {
    const n = points.length;
    const values = points.map((p) => p.cumulativeBalance);
    const rawMax = Math.max(...values, 0);
    const max = rawMax <= 0 ? 1 : rawMax;
    const span = max; // baseline anchored at 0

    const xFor = (i: number) =>
      n === 1 ? CHART_PAD.left + CHART_INNER_W / 2 : CHART_PAD.left + (i / (n - 1)) * CHART_INNER_W;
    const yFor = (v: number) => CHART_PAD.top + CHART_INNER_H - (v / span) * CHART_INNER_H;

    const hasDiv = points.some(
      (p) => p.currentBalance !== undefined && p.currentBalance < p.cumulativeBalance,
    );

    const coords = points.map((p, i) => {
      const yAccrued = yFor(p.cumulativeBalance);
      const yBalance = p.currentBalance !== undefined ? yFor(p.currentBalance) : yAccrued;
      return { i, x: xFor(i), yAccrued, yBalance, point: p };
    });

    const accruedLine = coords.map((c) => `${c.x},${c.yAccrued}`).join(' ');
    const balanceLine = coords.map((c) => `${c.x},${c.yBalance}`).join(' ');

    const baselineY = CHART_PAD.top + CHART_INNER_H;

    // Area fill below balance line (what is available)
    const balanceArea =
      coords.length > 0
        ? `M ${coords[0].x},${baselineY} ` +
          coords.map((c) => `L ${c.x},${c.yBalance}`).join(' ') +
          ` L ${coords[coords.length - 1].x},${baselineY} Z`
        : '';

    // Area fill between accrued line and balance line (used zone)
    let usedArea = '';
    if (hasDiv && coords.length > 0) {
      const topForward = coords.map((c) => `L ${c.x},${c.yAccrued}`).join(' ');
      const bottomBackward = [...coords].reverse().map((c) => `L ${c.x},${c.yBalance}`).join(' ');
      usedArea = `M ${coords[0].x},${coords[0].yAccrued} ${topForward} ${bottomBackward} Z`;
    }

    const ticks = Array.from({ length: 5 }, (_, k) => {
      const value = (span / 4) * k;
      return { value, y: yFor(value) };
    });

    return {
      accruedLinePath: accruedLine,
      balanceLinePath: balanceLine,
      balanceAreaPath: balanceArea,
      usedAreaPath: usedArea,
      plotted: coords,
      yTicks: ticks,
      maxValue: max,
      hasDivergence: hasDiv,
    };
  }, [points]);

  const single = plotted.length === 1;
  const hoveredPoint = hovered !== null ? plotted[hovered] : null;

  const latestPoint = points[points.length - 1];
  const ariaLabel =
    latestPoint?.currentBalance !== undefined
      ? `Cumulative savings line chart with ${plotted.length} data ${
          plotted.length === 1 ? 'point' : 'points'
        }, latest total saved ${formatPeso(latestPoint.cumulativeBalance)}, current balance ${formatPeso(
          latestPoint.currentBalance,
        )}.`
      : `Cumulative savings line chart with ${plotted.length} data ${
          plotted.length === 1 ? 'point' : 'points'
        }, latest total saved ${formatPeso(points[points.length - 1].cumulativeBalance)}.`;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full h-auto"
        style={{ maxHeight: PLOT_MAX_HEIGHT_PX }}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Horizontal gridlines + Y-axis value labels */}
        {yTicks.map((t, k) => (
          <g key={`tick-${k}`}>
            <line
              x1={CHART_PAD.left}
              y1={t.y}
              x2={CHART_W - CHART_PAD.right}
              y2={t.y}
              stroke="var(--color-border)"
              strokeWidth={1}
              className="opacity-40"
            />
            <text
              x={CHART_PAD.left - 8}
              y={t.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted"
              style={{ fontSize: '10px' }}
            >
              {formatPeso(t.value)}
            </text>
          </g>
        ))}

        {/* Area fill below balance line */}
        {!single && balanceAreaPath && (
          <path d={balanceAreaPath} fill="var(--color-primary)" className="opacity-[0.06]" />
        )}

        {/* Area fill between accrued line and balance line (used zone) */}
        {!single && usedAreaPath && (
          <path d={usedAreaPath} fill="#10b981" className="opacity-[0.08]" />
        )}

        {/* Solid accrued line ("Total Saved") */}
        {!single && (
          <polyline
            points={accruedLinePath}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            data-testid="savings-line"
          />
        )}

        {/* Dashed balance line ("Current Balance") */}
        {!single && hasDivergence && (
          <polyline
            points={balanceLinePath}
            fill="none"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinejoin="round"
            strokeLinecap="round"
            data-testid="savings-line-balance"
          />
        )}

        {/* One plotted marker per data point */}
        {plotted.map((c) => {
          const isHovered = hovered === c.i;
          const pointAria =
            c.point.currentBalance !== undefined
              ? `${formatAxisDate(c.point.periodEnd)}: Total saved ${formatPeso(
                  c.point.cumulativeBalance,
                )}, Current ${formatPeso(c.point.currentBalance)}`
              : `${formatAxisDate(c.point.periodEnd)}: ${formatPeso(c.point.cumulativeBalance)}`;

          return (
            <g key={`pt-${c.i}`}>
              <circle
                cx={c.x}
                cy={c.yAccrued}
                r={14}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={pointAria}
                onMouseEnter={() => setHovered(c.i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(c.i)}
                onBlur={() => setHovered(null)}
                className="cursor-pointer focus:outline-none"
                data-testid="savings-point"
              />
              <circle
                cx={c.x}
                cy={c.yAccrued}
                r={isHovered ? 5.5 : 3.5}
                fill="var(--color-surface)"
                stroke="var(--color-primary)"
                strokeWidth={2.5}
                className="pointer-events-none transition-[r] duration-150 ease-out"
              />
              {hasDivergence && (
                <circle
                  cx={c.x}
                  cy={c.yBalance}
                  r={isHovered ? 5.5 : 3.5}
                  fill="var(--color-surface)"
                  stroke="#10b981"
                  strokeWidth={2}
                  className="pointer-events-none transition-[r] duration-150 ease-out"
                />
              )}
            </g>
          );
        })}

        {/* X-axis endpoint date labels (first + last) */}
        {plotted.length > 0 && (
          <>
            <text
              x={plotted[0].x}
              y={CHART_H - 12}
              textAnchor={single ? 'middle' : 'start'}
              className="fill-muted"
              style={{ fontSize: '10px' }}
            >
              {formatAxisDate(plotted[0].point.periodEnd)}
            </text>
            {!single && (
              <text
                x={plotted[plotted.length - 1].x}
                y={CHART_H - 12}
                textAnchor="end"
                className="fill-muted"
                style={{ fontSize: '10px' }}
              >
                {formatAxisDate(plotted[plotted.length - 1].point.periodEnd)}
              </text>
            )}
          </>
        )}

        {/* Hover guide line */}
        {hoveredPoint && (
          <line
            x1={hoveredPoint.x}
            y1={CHART_PAD.top}
            x2={hoveredPoint.x}
            y2={CHART_PAD.top + CHART_INNER_H}
            stroke="var(--color-primary)"
            strokeWidth={1}
            strokeDasharray="3 3"
            className="opacity-40 pointer-events-none"
          />
        )}
      </svg>

      {/* Tooltip for the hovered/focused point */}
      {hoveredPoint && (
        <div
          className="absolute -translate-x-1/2 -translate-y-full pointer-events-none bg-foreground text-surface text-xs font-sans rounded-xl px-3 py-2 shadow-xl whitespace-nowrap z-10 flex flex-col gap-1 border border-border/20"
          style={{
            left: `${(hoveredPoint.x / CHART_W) * 100}%`,
            top: `${(Math.min(hoveredPoint.yAccrued, hoveredPoint.yBalance) / CHART_H) * 100}%`,
          }}
          role="status"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="opacity-70 text-[11px]">Total Saved:</span>
            <span className="font-mono font-semibold">{formatPeso(hoveredPoint.point.cumulativeBalance)}</span>
          </div>
          {hoveredPoint.point.currentBalance !== undefined && (
            <div className="flex items-center justify-between gap-3 text-emerald-400">
              <span className="opacity-80 text-[11px]">Current:</span>
              <span className="font-mono font-semibold">{formatPeso(hoveredPoint.point.currentBalance)}</span>
            </div>
          )}
          <div className="text-[10px] opacity-60 text-right border-t border-surface/20 pt-1 mt-0.5">
            {formatAxisDate(hoveredPoint.point.periodEnd)}
          </div>
        </div>
      )}

      <span className="sr-only">{`Maximum cumulative balance shown: ${formatPeso(maxValue)}.`}</span>
    </div>
  );
};

/**
 * Hand-rolled SVG multi-series line chart (by-category view, Requirement 6.12).
 *
 * Every category shares one Y scale (anchored at 0, scaled to the global max) and
 * one time axis built from the union of all series' `periodEnd` instants, so lines
 * are aligned in time. Each category renders one polyline plus one marker per data
 * point, in a distinct color that matches the legend.
 */
const SavingsMultiLineChart: React.FC<{ series: CategorySeries[] }> = ({ series }) => {
  const { periods, yTicks, lines } = useMemo(() => {
    // Shared, time-ordered axis across every series.
    const uniquePeriods = Array.from(
      new Set(series.flatMap((s) => s.points.map((p) => p.periodEnd))),
    ).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const n = uniquePeriods.length;

    const allValues = series.flatMap((s) => s.points.map((p) => p.cumulativeBalance));
    const rawMax = Math.max(...allValues, 0);
    const max = rawMax <= 0 ? 1 : rawMax;
    const span = max;

    const indexOfPeriod = new Map(uniquePeriods.map((p, i) => [p, i]));
    const xFor = (iso: string) => {
      const idx = indexOfPeriod.get(iso) ?? 0;
      return n === 1 ? CHART_PAD.left + CHART_INNER_W / 2 : CHART_PAD.left + (idx / (n - 1)) * CHART_INNER_W;
    };
    const yFor = (v: number) => CHART_PAD.top + CHART_INNER_H - (v / span) * CHART_INNER_H;

    const builtLines = series.map((s, i) => {
      const coords = s.points.map((p) => ({ x: xFor(p.periodEnd), y: yFor(p.cumulativeBalance), point: p }));
      return {
        categoryId: s.categoryId,
        categoryName: s.categoryName,
        color: colorForIndex(i),
        coords,
        polyline: coords.map((c) => `${c.x},${c.y}`).join(' '),
      };
    });

    const ticks = Array.from({ length: 5 }, (_, k) => {
      const value = (span / 4) * k;
      return { value, y: yFor(value) };
    });

    return { periods: uniquePeriods, yTicks: ticks, lines: builtLines };
  }, [series]);

  const single = periods.length === 1;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full h-auto"
        style={{ maxHeight: PLOT_MAX_HEIGHT_PX }}
        role="img"
        aria-label={`Cumulative savings by category with ${lines.length} ${
          lines.length === 1 ? 'category' : 'categories'
        }.`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Horizontal gridlines + Y-axis value labels */}
        {yTicks.map((t, k) => (
          <g key={`tick-${k}`}>
            <line
              x1={CHART_PAD.left}
              y1={t.y}
              x2={CHART_W - CHART_PAD.right}
              y2={t.y}
              stroke="var(--color-border)"
              strokeWidth={1}
              className="opacity-40"
            />
            <text
              x={CHART_PAD.left - 8}
              y={t.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted"
              style={{ fontSize: '10px' }}
            >
              {formatPeso(t.value)}
            </text>
          </g>
        ))}

        {/* One polyline + markers per category (Requirement 6.12) */}
        {lines.map((ln) => (
          <g key={`series-${ln.categoryId}`} data-testid="savings-category-line" data-category-id={ln.categoryId}>
            {ln.coords.length > 1 && (
              <polyline
                points={ln.polyline}
                fill="none"
                stroke={ln.color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {ln.coords.map((c, ci) => (
              <circle
                key={`m-${ln.categoryId}-${ci}`}
                cx={c.x}
                cy={c.y}
                r={3.5}
                fill="var(--color-surface)"
                stroke={ln.color}
                strokeWidth={2.5}
              >
                <title>{`${ln.categoryName} · ${formatAxisDate(c.point.periodEnd)}: ${formatPeso(
                  c.point.cumulativeBalance,
                )}`}</title>
              </circle>
            ))}
          </g>
        ))}

        {/* X-axis endpoint date labels (first + last) */}
        {periods.length > 0 && (
          <>
            <text
              x={single ? CHART_PAD.left + CHART_INNER_W / 2 : CHART_PAD.left}
              y={CHART_H - 12}
              textAnchor={single ? 'middle' : 'start'}
              className="fill-muted"
              style={{ fontSize: '10px' }}
            >
              {formatAxisDate(periods[0])}
            </text>
            {!single && (
              <text
                x={CHART_W - CHART_PAD.right}
                y={CHART_H - 12}
                textAnchor="end"
                className="fill-muted"
                style={{ fontSize: '10px' }}
              >
                {formatAxisDate(periods[periods.length - 1])}
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  );
};

export const SavingsGraph = React.memo(SavingsGraphComponent);

export default SavingsGraph;
