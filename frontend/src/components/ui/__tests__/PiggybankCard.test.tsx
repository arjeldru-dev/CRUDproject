import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PiggybankCard from '../PiggybankCard';
import Categories from '../../../pages/Categories';

// Component tests for the Piggybank_Card (savings-piggybank task 8.7).
//
// The card fetches BOTH `GET /api/savings/piggybank` and
// `GET /api/savings/settings` in parallel through the axios singleton
// (`src/lib/api.ts`), and drives the enable / set-PIN / use-savings writes via
// `api.put` and `api.post`. That module is mocked and driven per-test.
//
// Coverage (Requirement references in each `it`):
//   Read-only display states
//     - 11.1 loading    — a loading indicator with no stale data.
//     - 11.2 error       — an error message + an enabled retry control.
//     - 11.3 timeout     — a request exceeding 30 s falls into the error state.
//     - 11.4 retry       — retry re-issues the requests and returns to loading.
//     - 11.5 empty       — enabled-but-nothing-accrued shows explanatory copy.
//     - 11.7 / 11.9      — every category's accrued + available balance, peso-formatted.
//     - 11.10 disabled   — savings-off state with an enable control.
//     - 11.11            — Budget_Insight_Card renders before the card (page order).
//     - 11.12            — per-category entries use a ≥ 2-column layout at ≥ 640px.
//   Write flows
//     - 12.1 / 12.2 / 12.3 — set/change-PIN issues PUT …/settings/pin, never
//                            renders the PIN back, and rejects an invalid format
//                            client-side without a request.
//     - 12.5 / 12.6 / 12.7 / 12.17 — PIN-gated use-savings issues POST …/usage and
//                            surfaces distinct PIN-not-set / incorrect-PIN /
//                            PIN-locked outcomes while balances stay visible.

// ── Mock the axios singleton (shared by PiggybankCard and Categories) ──
vi.mock('../../../lib/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

// Imported after the mock is registered; cast to the mock for control.
import api from '../../../lib/api';
const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockPut = api.put as unknown as ReturnType<typeof vi.fn>;
const mockPost = api.post as unknown as ReturnType<typeof vi.fn>;

/** A never-settling promise — keeps a request "in flight" for loading assertions. */
function pendingResponse(): Promise<never> {
  return new Promise<never>(() => {
    /* never resolves */
  });
}

/** A promise that rejects only once its AbortController signal fires. */
function abortableResponse(config?: { signal?: AbortSignal }): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const signal = config?.signal;
    if (signal) {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }
  });
}

/** Shape an axios-style rejection so `readAxiosError` in the component can read it. */
function axiosError(status: number, message?: string) {
  return { response: { status, data: message ? { error: message } : {} } };
}

const enabledSettings = {
  enabled: true,
  enabledAt: '2026-07-01T00:00:00.000Z',
  pinSet: true,
};

const populatedPiggybank = {
  totalSavingsBalance: 1234.5,
  totalAccruedSavings: 1400,
  aggregateShortfall: 0,
  categories: [
    { categoryId: 'a', categoryName: 'Food', accruedSavings: 1000, savingsBalance: 900 },
    { categoryId: 'b', categoryName: 'Transport', accruedSavings: 400, savingsBalance: 334.5 },
  ],
  incomplete: false,
};

const emptyPiggybank = {
  totalSavingsBalance: 0,
  totalAccruedSavings: 0,
  aggregateShortfall: 0,
  categories: [],
  incomplete: false,
};

/**
 * Drive the two parallel reads by URL. `api.get` is called once for
 * `/savings/piggybank` and once for `/savings/settings`; this dispatches the
 * right payload to each and is stable across the component's refetches.
 */
function stubReads(piggybank: unknown, settings: unknown) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/savings/piggybank')) return Promise.resolve({ data: piggybank });
    if (url.includes('/savings/settings')) return Promise.resolve({ data: settings });
    // Categories page reads its own budget list.
    if (url.includes('/transactions/budget')) {
      return Promise.resolve({ data: { budgetStatuses: [] } });
    }
    return Promise.resolve({ data: {} });
  });
}

describe('PiggybankCard', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockPost.mockReset();
    // Safe default so any component POST that isn't the subject of a test still
    // resolves. The page-order test (11.11) renders the whole <Categories> page,
    // which mounts the Budget_Insight_Card's useBudgetSummary hook — it fires
    // POST /insights/budget-summary on mount. Without a resolved promise the
    // mocked api.post returns undefined and the hook's `.then` throws, crashing
    // the tree. Tests exercising the usage POST override this per-test.
    mockPost.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 11.1 Loading, no stale data ────────────────────────────────────
  it('shows a loading indicator with no savings data while requests are in flight (Req 11.1)', () => {
    mockGet.mockReturnValue(pendingResponse());

    render(<PiggybankCard />);

    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(/loading your savings/i)).toBeInTheDocument();

    // No stale/previously-loaded data is shown during loading.
    expect(screen.queryByTestId('piggybank-total')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('piggybank-category-row')).toHaveLength(0);
  });

  // ── 11.2 Error state with enabled retry ─────────────────────────────
  it('shows an error message and an enabled retry control on failure (Req 11.2)', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    render(<PiggybankCard />);

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();

    const retry = screen.getByRole('button', { name: /retry/i });
    expect(retry).toBeInTheDocument();
    expect(retry).toBeEnabled();

    // With no prior successful load, no partial figures are rendered.
    expect(screen.queryByTestId('piggybank-total')).not.toBeInTheDocument();
  });

  // ── 11.3 30 s timeout → error (fake timers) ─────────────────────────
  it('treats a request exceeding 30 seconds as a failure and shows the error state (Req 11.3)', async () => {
    vi.useFakeTimers();
    try {
      mockGet.mockImplementation((_url: string, config?: { signal?: AbortSignal }) =>
        abortableResponse(config),
      );

      render(<PiggybankCard />);

      expect(screen.getByRole('status')).toBeInTheDocument();

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

  // ── 11.4 Retry re-issues the requests and returns to loading ────────
  it('re-issues the requests and returns to the loading state when retry is activated (Req 11.4)', async () => {
    // First load fails; the retry attempt stays in flight so loading is observable.
    mockGet.mockRejectedValueOnce(new Error('first failure'));
    mockGet.mockRejectedValueOnce(new Error('first failure'));
    mockGet.mockReturnValue(pendingResponse());

    render(<PiggybankCard />);

    const retry = await screen.findByRole('button', { name: /retry/i });
    const callsBeforeRetry = mockGet.mock.calls.length;
    fireEvent.click(retry);

    const status = await screen.findByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-busy', 'true');
    // Retry issued at least one fresh read.
    expect(mockGet.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  // ── 11.5 Empty state while enabled ──────────────────────────────────
  it('shows the empty-state explanation instead of a bare figure when enabled with nothing accrued (Req 11.5)', async () => {
    stubReads(emptyPiggybank, enabledSettings);

    render(<PiggybankCard />);

    expect(await screen.findByText(/savings accrue automatically/i)).toBeInTheDocument();
    // The bare total figure must not be displayed in the empty state.
    expect(screen.queryByTestId('piggybank-total')).not.toBeInTheDocument();
  });

  // ── 11.7 / 11.9 Populated: accrued + available per category, peso-formatted ──
  it('renders every category accrued and available balance, peso-formatted (Req 11.7, 11.9)', async () => {
    stubReads(populatedPiggybank, enabledSettings);

    render(<PiggybankCard />);

    // Totals: available + accrued, peso-formatted.
    const total = await screen.findByTestId('piggybank-total');
    expect(total).toHaveTextContent('₱1,234.50');
    expect(screen.getByTestId('piggybank-total-accrued')).toHaveTextContent('₱1,400.00');

    // One row per returned category.
    const rows = screen.getAllByTestId('piggybank-category-row');
    expect(rows).toHaveLength(populatedPiggybank.categories.length);

    // Food row shows its accrued (₱1,000.00) and available (₱900.00).
    const foodRow = rows.find((r) => within(r).queryByText('Food')) as HTMLElement;
    expect(foodRow).toBeTruthy();
    expect(within(foodRow).getByTestId('piggybank-category-available')).toHaveTextContent('₱900.00');
    expect(within(foodRow).getByTestId('piggybank-category-accrued')).toHaveTextContent('₱1,000.00');

    // Transport row shows its accrued (₱400.00) and available (₱334.50).
    const transportRow = rows.find((r) => within(r).queryByText('Transport')) as HTMLElement;
    expect(transportRow).toBeTruthy();
    expect(within(transportRow).getByTestId('piggybank-category-available')).toHaveTextContent(
      '₱334.50',
    );
    expect(within(transportRow).getByTestId('piggybank-category-accrued')).toHaveTextContent(
      '₱400.00',
    );
  });

  // ── 11.12 ≥ 2-column layout at ≥ 640px ──────────────────────────────
  it('lays the per-category entries out in a ≥ 2-column grid at ≥ 640px (Req 11.12)', async () => {
    stubReads(populatedPiggybank, enabledSettings);

    render(<PiggybankCard />);

    const grid = await screen.findByTestId('piggybank-category-grid');
    // jsdom does not evaluate CSS media queries, so we assert the responsive
    // utility that yields a two-column grid at Tailwind's `sm` breakpoint (640px),
    // stacking to one column below it.
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
  });

  // ── 11.10 Disabled state with an enable control ─────────────────────
  it('shows a disabled state with an enable control and enables savings via PUT /settings (Req 11.10)', async () => {
    stubReads(emptyPiggybank, { enabled: false, enabledAt: null, pinSet: false });
    mockPut.mockResolvedValue({ data: {} });

    render(<PiggybankCard />);

    // Disabled copy + enable affordance.
    expect(await screen.findByText(/savings are turned off/i)).toBeInTheDocument();
    const enableBtn = screen.getByTestId('piggybank-enable');
    expect(enableBtn).toBeInTheDocument();
    // No spendable figure is shown while disabled.
    expect(screen.queryByTestId('piggybank-total')).not.toBeInTheDocument();

    fireEvent.click(enableBtn);

    // Activating the control turns savings on through PUT /savings/settings.
    expect(mockPut).toHaveBeenCalledWith('/savings/settings', { enabled: true });
  });

  // ── 11.11 Budget_Insight_Card renders before the card (document order) ──
  it('renders the Budget Insight card before the Piggybank card in document order (Req 11.11)', async () => {
    // Render the real Categories page so the true page composition is exercised.
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/transactions/budget')) {
        return Promise.resolve({
          data: {
            budgetStatuses: [
              {
                categoryId: 'a',
                categoryName: 'Food',
                limitAmount: 1000,
                period: 'MONTHLY',
                monthlyStartDay: null,
                weeklyStartDay: null,
                customPeriodDays: null,
                anchorDate: null,
                spent: 200,
                remaining: 800,
                insightText: 'You are pacing well this month.',
              },
            ],
          },
        });
      }
      if (url.includes('/savings/piggybank')) {
        return Promise.resolve({ data: populatedPiggybank });
      }
      if (url.includes('/savings/settings')) {
        return Promise.resolve({ data: enabledSettings });
      }
      return Promise.resolve({ data: {} });
    });

    render(<Categories />);

    const insight = await screen.findByText('Budget Insight');
    const piggybank = await screen.findByText('Savings Piggybank');

    // The insight card must precede the piggybank card in the DOM.
    const relation = insight.compareDocumentPosition(piggybank);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // ── 12.1 / 12.3 Set/change PIN issues PUT and never renders the PIN back ──
  it('submits a 6-digit PIN via PUT /settings/pin and never renders the PIN back (Req 12.1, 12.3)', async () => {
    stubReads(populatedPiggybank, { ...enabledSettings, pinSet: false });
    mockPut.mockResolvedValue({ data: { pinSet: true } });

    render(<PiggybankCard />);

    // Open the set-PIN form ("Set PIN" while none is configured).
    const openBtn = await screen.findByTestId('piggybank-pin-open');
    expect(openBtn).toHaveTextContent(/set pin/i);
    fireEvent.click(openBtn);

    const pinInput = screen.getByTestId('piggybank-pin-input');
    fireEvent.change(pinInput, { target: { value: '482913' } });
    fireEvent.click(screen.getByRole('button', { name: /save pin/i }));

    // The PIN is sent exactly once to the set/change-PIN endpoint.
    await vi.waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/savings/settings/pin', { pin: '482913' });
    });

    // A confirmation is shown and the PIN value is never rendered back anywhere.
    expect(await screen.findByText(/savings pin has been saved/i)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('482913')).not.toBeInTheDocument();
    expect(screen.queryByText('482913')).not.toBeInTheDocument();
  });

  // ── 12.2 Invalid-format PIN surfaces an error WITHOUT a request ──────
  it('rejects an invalid-format PIN client-side without issuing a request (Req 12.2)', async () => {
    stubReads(populatedPiggybank, { ...enabledSettings, pinSet: false });
    mockPut.mockResolvedValue({ data: { pinSet: true } });

    render(<PiggybankCard />);

    fireEvent.click(await screen.findByTestId('piggybank-pin-open'));

    const pinInput = screen.getByTestId('piggybank-pin-input');
    fireEvent.change(pinInput, { target: { value: '123' } }); // fewer than 6 digits
    fireEvent.click(screen.getByRole('button', { name: /save pin/i }));

    // A format error is surfaced and NO PUT request was issued.
    expect(await screen.findByText(/must be exactly 6 digits/i)).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  // ── 12.5 PIN-gated use-savings issues POST …/usage on success ───────
  it('issues POST …/usage with the collected PIN and confirms success (Req 12.5)', async () => {
    stubReads(populatedPiggybank, enabledSettings);
    mockPost.mockResolvedValue({ data: { usage: { id: 'u1' }, transaction: { id: 't1' } } });

    render(<PiggybankCard />);

    // Open the use-savings form for the first category with a balance (Food).
    const useButtons = await screen.findAllByTestId('piggybank-use-savings');
    fireEvent.click(useButtons[0]);

    fireEvent.change(screen.getByTestId('piggybank-usage-amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('piggybank-usage-pin'), { target: { value: '482913' } });
    fireEvent.click(screen.getByTestId('piggybank-usage-submit'));

    await vi.waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/savings/categories/a/usage', {
        amount: 100,
        pin: '482913',
      });
    });

    // Success confirmation reflects the release-to-budget copy.
    expect(await screen.findByText(/moved .* from savings into food/i)).toBeInTheDocument();
  });

  // ── 12.6 Incorrect PIN → distinct message, balances stay visible ────
  it('surfaces a distinct incorrect-PIN message while read-only balances stay visible (Req 12.6, 12.17)', async () => {
    stubReads(populatedPiggybank, enabledSettings);
    mockPost.mockRejectedValue(axiosError(401));

    render(<PiggybankCard />);

    const useButtons = await screen.findAllByTestId('piggybank-use-savings');
    fireEvent.click(useButtons[0]);
    fireEvent.change(screen.getByTestId('piggybank-usage-amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('piggybank-usage-pin'), { target: { value: '000000' } });
    fireEvent.click(screen.getByTestId('piggybank-usage-submit'));

    expect(await screen.findByText(/that pin is incorrect/i)).toBeInTheDocument();
    // Read-only balances remain on screen (Req 12.17).
    expect(screen.getByTestId('piggybank-total')).toHaveTextContent('₱1,234.50');
    expect(screen.getAllByTestId('piggybank-category-row').length).toBeGreaterThan(0);
  });

  // ── 12.7 PIN-not-set → distinct message, balances stay visible ──────
  it('surfaces a distinct PIN-not-set message while read-only balances stay visible (Req 12.7, 12.17)', async () => {
    stubReads(populatedPiggybank, { ...enabledSettings, pinSet: false });
    mockPost.mockRejectedValue(axiosError(400, 'A Savings PIN must be set first.'));

    render(<PiggybankCard />);

    const useButtons = await screen.findAllByTestId('piggybank-use-savings');
    fireEvent.click(useButtons[0]);
    fireEvent.change(screen.getByTestId('piggybank-usage-amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('piggybank-usage-pin'), { target: { value: '482913' } });
    fireEvent.click(screen.getByTestId('piggybank-usage-submit'));

    expect(await screen.findByText(/savings pin must be set first/i)).toBeInTheDocument();
    // Read-only balances remain on screen (Req 12.17).
    expect(screen.getByTestId('piggybank-total')).toHaveTextContent('₱1,234.50');
  });

  // ── 12.17 PIN-locked → distinct message, balances stay visible ──────
  it('surfaces a distinct PIN-locked message while read-only balances stay visible (Req 12.17)', async () => {
    stubReads(populatedPiggybank, enabledSettings);
    mockPost.mockRejectedValue(
      axiosError(423, 'Savings spending is temporarily locked after too many incorrect PIN attempts.'),
    );

    render(<PiggybankCard />);

    const useButtons = await screen.findAllByTestId('piggybank-use-savings');
    fireEvent.click(useButtons[0]);
    fireEvent.change(screen.getByTestId('piggybank-usage-amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('piggybank-usage-pin'), { target: { value: '482913' } });
    fireEvent.click(screen.getByTestId('piggybank-usage-submit'));

    expect(await screen.findByText(/temporarily locked/i)).toBeInTheDocument();
    // Read-only balances remain on screen (Req 12.17).
    expect(screen.getByTestId('piggybank-total')).toHaveTextContent('₱1,234.50');
    expect(screen.getAllByTestId('piggybank-category-row').length).toBeGreaterThan(0);
  });
});
