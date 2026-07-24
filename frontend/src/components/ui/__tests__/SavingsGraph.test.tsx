import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SavingsGraph from '../SavingsGraph';

// Component tests for the Savings_Graph (savings-piggybank task 8.5).
//
// The Dashboard graph fetches BOTH `GET /api/savings/settings` (the account-wide
// enable flag) and `GET /api/savings/timeseries` (the cumulative series) in a
// single `Promise.all`, through the axios singleton (`src/lib/api.ts`). That
// module is mocked and its `get` is routed per-URL so both fetches resolve
// independently and the `view` query parameter can be asserted.
//
// Coverage (task 8.5 → requirements):
//   - 6.9   plotting-area height capped at ≤ 260 CSS px on a desktop (≥ 1024px) viewport.
//   - 6.11/6.12  the total/by-category toggle: `total` fetches `view=total`, and
//                switching to *by category* re-fetches `view=byCategory` and renders
//                one line per category.
//   - 11.1  loading    — a loading indicator with no stale/previously-loaded data.
//   - 11.2  error       — an error message + an enabled retry control, while
//                          retaining any previously displayed data.
//   - 11.3  timeout     — a request exceeding 30 s is aborted and treated as a failure.
//   - 11.4  retry       — activating retry re-issues the request and returns to loading.
//   - 11.6  empty       — a series with 0 data points shows an empty-state message.
//   - 11.10 disabled    — settings `enabled=false` shows a disabled state and plots no line.
//   - 6.3 / 11.8 populated — exactly one plotted marker per returned data point.
//
// (Requirement 6.10 — the Savings_Graph is positioned after the Financial Overview
//  section in the Dashboard document order — is a Dashboard-layout concern and is
//  covered by `src/pages/__tests__/DashboardSavingsOrder.test.tsx`.)

// ── Mock the axios singleton ─────────────────────────────────────────
vi.mock('../../../lib/api', () => ({
  default: { get: vi.fn() },
}));

// Imported after the mock is registered; cast to the mock for control.
import api from '../../../lib/api';
const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;

type Cfg = { params?: { view?: string; rangeStart?: string; rangeEnd?: string }; signal?: AbortSignal };

interface SettingsPayload {
  enabled: boolean;
  enabledAt: string | null;
  pinSet: boolean;
}

/** A never-settling promise — keeps a request "in flight" for loading assertions. */
function pendingResponse(): Promise<never> {
  return new Promise<never>(() => {
    /* never resolves */
  });
}

/** A promise that rejects only once its AbortController signal fires. */
function abortableResponse(config?: Cfg): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const signal = config?.signal;
    if (signal) {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }
  });
}

/** Build a `total`-view timeseries payload with `n` cumulative, non-decreasing points. */
function makePoints(n: number) {
  const points = Array.from({ length: n }, (_, i) => ({
    periodEnd: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
    cumulativeBalance: (i + 1) * 100,
  }));
  return { view: 'total' as const, points };
}

/** Build a `byCategory`-view payload with one cumulative series per supplied name. */
function makeByCategory(names: string[]) {
  return {
    view: 'byCategory' as const,
    series: names.map((categoryName, ci) => ({
      categoryId: `cat-${ci}`,
      categoryName,
      points: Array.from({ length: 2 }, (_, i) => ({
        periodEnd: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
        cumulativeBalance: (i + 1) * (ci + 1) * 100,
      })),
    })),
  };
}

/**
 * Route `api.get` by URL so the settings and timeseries fetches resolve
 * independently. The timeseries payload is chosen by the requested `view`.
 */
function routeGet(opts: {
  settings?: SettingsPayload;
  total?: ReturnType<typeof makePoints> | { view?: 'total'; points: unknown[] };
  byCategory?: ReturnType<typeof makeByCategory>;
}) {
  const settings = opts.settings ?? { enabled: true, enabledAt: null, pinSet: false };
  mockGet.mockImplementation((url: string, config?: Cfg) => {
    if (url === '/savings/settings') return Promise.resolve({ data: settings });
    if (url === '/savings/timeseries') {
      const view = config?.params?.view ?? 'total';
      if (view === 'byCategory') {
        return Promise.resolve({ data: opts.byCategory ?? { view: 'byCategory', series: [] } });
      }
      return Promise.resolve({ data: opts.total ?? makePoints(0) });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

/** All `view=timeseries` calls' `view` params, in call order. */
function timeseriesViews(): (string | undefined)[] {
  return mockGet.mock.calls
    .filter((c) => c[0] === '/savings/timeseries')
    .map((c) => (c[1] as Cfg | undefined)?.params?.view);
}

describe('SavingsGraph', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 11.1 Loading, no stale data ────────────────────────────────────
  it('shows a loading indicator with no chart data while the request is in flight (Req 11.1)', () => {
    mockGet.mockReturnValue(pendingResponse());

    render(<SavingsGraph />);

    // A busy status indicator is present immediately.
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(/loading your savings/i)).toBeInTheDocument();

    // No stale/previously-loaded data (chart, markers, or total) is shown.
    expect(screen.queryByTestId('savings-latest')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('savings-point')).toHaveLength(0);
  });

  // ── 11.2 Error state with enabled retry, no corrupted values ────────
  it('shows an error message and an enabled retry control on failure (Req 11.2)', async () => {
    // Both parallel fetches reject → the combined load fails.
    mockGet.mockRejectedValue(new Error('network down'));

    render(<SavingsGraph />);

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();

    const retry = screen.getByRole('button', { name: /retry/i });
    expect(retry).toBeInTheDocument();
    expect(retry).toBeEnabled();

    // With no prior successful load there is no data to retain, so no chart
    // markers are rendered.
    expect(screen.queryAllByTestId('savings-point')).toHaveLength(0);
  });

  // ── 11.2 Error retains previously displayed data ────────────────────
  it('retains previously displayed chart data when a later request fails (Req 11.2)', async () => {
    // First load succeeds with an enabled account + 3 points.
    routeGet({ settings: { enabled: true, enabledAt: null, pinSet: false }, total: makePoints(3) });

    render(<SavingsGraph />);

    // Wait for the populated chart, then confirm 3 plotted points.
    const latest = await screen.findByTestId('savings-latest');
    expect(latest).toBeInTheDocument();
    expect(screen.getAllByTestId('savings-point')).toHaveLength(3);

    // A subsequent range-change refetch fails.
    mockGet.mockImplementation(() => Promise.reject(new Error('later failure')));
    fireEvent.click(screen.getByRole('button', { name: /^3M$/i }));

    // Error state appears, and prior data is retained on screen (Req 11.2).
    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeEnabled();
    expect(screen.getAllByTestId('savings-point')).toHaveLength(3);
  });

  // ── 11.3 30 s timeout → error (fake timers) ─────────────────────────
  it('treats a request exceeding 30 seconds as a failure and shows the error state (Req 11.3)', async () => {
    vi.useFakeTimers();
    try {
      // Both requests only settle when their shared abort signal fires (on timeout).
      mockGet.mockImplementation((_url: string, config?: Cfg) => abortableResponse(config));

      render(<SavingsGraph />);

      // Still loading before the ceiling is reached.
      expect(screen.getByRole('status')).toBeInTheDocument();

      // Advance past the 30 s timeout; the component aborts and fails. Wrapped
      // in act(...) so the resulting state update is flushed before asserting.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  // ── 11.4 Retry re-issues the request and returns to loading ─────────
  it('re-issues the request and returns to the loading state when retry is activated (Req 11.4)', async () => {
    // First attempt: both parallel calls reject. Retry attempt: both stay in
    // flight so the loading state can be observed.
    mockGet
      .mockImplementationOnce(() => Promise.reject(new Error('first failure')))
      .mockImplementationOnce(() => Promise.reject(new Error('first failure')))
      .mockImplementation(() => pendingResponse());

    render(<SavingsGraph />);

    const retry = await screen.findByRole('button', { name: /retry/i });
    fireEvent.click(retry);

    // Back to the loading indicator, and a fresh settings+timeseries pair was requested.
    const status = await screen.findByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-busy', 'true');
    // 2 calls per attempt (settings + timeseries) × 2 attempts.
    expect(mockGet).toHaveBeenCalledTimes(4);
  });

  // ── 11.6 Empty state when the series has 0 points ───────────────────
  it('shows an empty-state message instead of a chart when the series has 0 points (Req 11.6)', async () => {
    routeGet({ total: makePoints(0) });

    render(<SavingsGraph />);

    expect(await screen.findByTestId('savings-empty')).toBeInTheDocument();
    expect(screen.getByText(/no savings data available/i)).toBeInTheDocument();

    // No chart markers are plotted in the empty state.
    expect(screen.queryAllByTestId('savings-point')).toHaveLength(0);
    expect(screen.queryByTestId('savings-latest')).not.toBeInTheDocument();
  });

  // ── 11.10 Disabled state instead of a line ──────────────────────────
  it('shows a disabled state and plots no line when settings report enabled=false (Req 11.10)', async () => {
    // Even with a non-empty series, a disabled account must not plot a line.
    routeGet({ settings: { enabled: false, enabledAt: null, pinSet: false }, total: makePoints(3) });

    render(<SavingsGraph />);

    expect(await screen.findByTestId('savings-disabled')).toBeInTheDocument();
    expect(screen.getByText(/savings is turned off/i)).toBeInTheDocument();

    // No line and no plotted markers in the disabled state.
    expect(screen.queryByTestId('savings-line')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('savings-point')).toHaveLength(0);
    expect(screen.queryByTestId('savings-empty')).not.toBeInTheDocument();
  });

  // ── 6.3 / 11.8 Populated plots one marker per data point ────────────
  it('plots exactly one point per returned data point (Req 6.3, 11.8)', async () => {
    const payload = makePoints(5);
    routeGet({ total: payload });

    render(<SavingsGraph />);

    // Latest cumulative balance is surfaced, peso-formatted.
    const latest = await screen.findByTestId('savings-latest');
    expect(latest).toHaveTextContent('₱500.00');

    // One marker per data point (Requirements 6.3, 11.8).
    const markers = screen.getAllByTestId('savings-point');
    expect(markers).toHaveLength(payload.points.length);
  });

  // ── 6.3 / 11.8 Single data point still plots exactly one marker ─────
  it('plots a single marker for a one-point series (Req 6.3, 11.8)', async () => {
    routeGet({ total: makePoints(1) });

    render(<SavingsGraph />);

    await screen.findByTestId('savings-latest');
    expect(screen.getAllByTestId('savings-point')).toHaveLength(1);
  });

  // ── 11.8 Chart accessible label reflects the plotted point count ────
  it('exposes an accessible chart label describing the plotted points (Req 11.8)', async () => {
    routeGet({ total: makePoints(4) });

    render(<SavingsGraph />);

    const chart = await screen.findByRole('img', { name: /cumulative savings line chart/i });
    expect(within(chart.parentElement as HTMLElement).getAllByTestId('savings-point')).toHaveLength(4);
    expect(chart).toHaveAttribute('aria-label', expect.stringMatching(/4 data points/i));
  });

  // ── 6.9 Plotting-area height capped at ≤ 260px on a desktop viewport ─
  it('caps the plotting-area height at ≤ 260px at a ≥ 1024px viewport (Req 6.9)', async () => {
    // Simulate a desktop-width viewport.
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
    try {
      routeGet({ total: makePoints(5) });

      render(<SavingsGraph />);
      await screen.findByTestId('savings-latest');

      // The plotting-area wrapper caps its height so the SVG never exceeds 260px.
      const plotArea = screen.getByTestId('savings-plot-area');
      const capPx = parseFloat(plotArea.style.maxHeight);
      expect(Number.isNaN(capPx)).toBe(false);
      expect(capPx).toBeLessThanOrEqual(260);

      // The SVG itself carries the same ceiling.
      const chart = screen.getByRole('img', { name: /cumulative savings line chart/i });
      expect(parseFloat((chart as unknown as HTMLElement).style.maxHeight)).toBeLessThanOrEqual(260);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalWidth });
    }
  });

  // ── 6.11 / 6.12 Total ⇄ by-category toggle re-fetches per view ──────
  it('fetches view=total initially and re-fetches view=byCategory with one line per category on toggle (Req 6.11, 6.12)', async () => {
    routeGet({
      settings: { enabled: true, enabledAt: null, pinSet: false },
      total: makePoints(2),
      byCategory: makeByCategory(['Food', 'Transport', 'Bills']),
    });

    render(<SavingsGraph />);

    // Total view loads first and requests view=total (Req 6.11).
    await screen.findByTestId('savings-latest');
    expect(timeseriesViews()).toContain('total');
    expect(screen.queryAllByTestId('savings-category-line')).toHaveLength(0);

    // Switch to the by-category view.
    fireEvent.click(screen.getByTestId('savings-view-byCategory'));

    // It re-fetches with view=byCategory (Req 6.12) …
    await screen.findAllByTestId('savings-category-line');
    expect(timeseriesViews()).toContain('byCategory');

    // … and renders exactly one line per returned category (Req 6.12).
    const lines = screen.getAllByTestId('savings-category-line');
    expect(lines).toHaveLength(3);
    const legend = screen.getByTestId('savings-legend');
    expect(within(legend).getByText('Food')).toBeInTheDocument();
    expect(within(legend).getByText('Transport')).toBeInTheDocument();
    expect(within(legend).getByText('Bills')).toBeInTheDocument();

    // The total-view single-series marker is no longer shown.
    expect(screen.queryByTestId('savings-latest')).not.toBeInTheDocument();
  });

  // ── 6.11 By-category empty state when no category has points ────────
  it('shows the empty state in the by-category view when no category has data (Req 6.11, 11.6)', async () => {
    routeGet({
      total: makePoints(2),
      byCategory: { view: 'byCategory', series: [] },
    });

    render(<SavingsGraph />);
    await screen.findByTestId('savings-latest');

    fireEvent.click(screen.getByTestId('savings-view-byCategory'));

    expect(await screen.findByTestId('savings-empty')).toBeInTheDocument();
    expect(screen.queryAllByTestId('savings-category-line')).toHaveLength(0);
  });
});
