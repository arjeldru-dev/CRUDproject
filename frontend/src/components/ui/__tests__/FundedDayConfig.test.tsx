import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import FundedDayConfig from '../FundedDayConfig';

// Component tests for the funded-day configuration UI (savings-piggybank task 7.7).
//
// These exercise the core behaviors of Requirements 1.3, 2.2, 2.5, 2.6:
//   - reading the current schedule + overrides on mount;
//   - toggling weekdays and saving the schedule (replace-all, Req 1.3);
//   - adding/upserting a date override (Req 2.2);
//   - removing an override (Req 2.5, 2.6);
//   - surfacing API validation errors (HTTP 400 → Req 1.4, 2.3).
//
// The component talks to the axios singleton (`src/lib/api.ts`), so that module
// is mocked and its methods driven per-test.

vi.mock('../../../lib/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import api from '../../../lib/api';
const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockPut = api.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = api.delete as unknown as ReturnType<typeof vi.fn>;

const baseConfig = {
  schedule: { fundedWeekdays: [1, 2, 3, 4, 5] },
  overrides: [{ date: '2026-07-04', funded: false }],
};

describe('FundedDayConfig', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and renders the current schedule and overrides on mount', async () => {
    mockGet.mockResolvedValueOnce({ data: baseConfig });

    render(<FundedDayConfig categoryId="cat-1" categoryName="Food" />);

    // Weekday toggles reflect the loaded schedule: Mon–Fri pressed, Sun/Sat not.
    expect(await screen.findByRole('button', { name: 'Monday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Saturday' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // The existing override is listed.
    expect(screen.getByText('2026-07-04')).toBeInTheDocument();
    expect(screen.getAllByTestId('override-row')).toHaveLength(1);
  });

  it('toggles a weekday and saves the schedule via PUT (Req 1.3)', async () => {
    mockGet.mockResolvedValueOnce({ data: baseConfig });
    mockPut.mockResolvedValueOnce({ data: { schedule: { fundedWeekdays: [0, 1, 2, 3, 4, 5] } } });

    render(<FundedDayConfig categoryId="cat-1" categoryName="Food" />);

    const sunday = await screen.findByRole('button', { name: 'Sunday' });
    fireEvent.click(sunday); // add Sunday to the funded set

    fireEvent.click(screen.getByRole('button', { name: /save schedule/i }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/savings/categories/cat-1/schedule', {
        fundedWeekdays: [0, 1, 2, 3, 4, 5],
      });
    });

    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });

  it('surfaces a validation error returned when saving the schedule (Req 1.4)', async () => {
    mockGet.mockResolvedValueOnce({ data: baseConfig });
    mockPut.mockRejectedValueOnce({
      response: { data: { error: 'fundedWeekdays must contain integers in 0..6' } },
    });

    render(<FundedDayConfig categoryId="cat-1" categoryName="Food" />);

    fireEvent.click(await screen.findByRole('button', { name: /save schedule/i }));

    expect(await screen.findByText(/must contain integers in 0\.\.6/i)).toBeInTheDocument();
  });

  it('adds a date override via PUT (Req 2.2)', async () => {
    mockGet.mockResolvedValueOnce({ data: { schedule: { fundedWeekdays: [1, 2, 3] }, overrides: [] } });
    mockPut.mockResolvedValueOnce({ data: { date: '2026-12-25', funded: false } });

    render(<FundedDayConfig categoryId="cat-1" categoryName="Food" />);

    const dateInput = await screen.findByLabelText('Date');
    fireEvent.change(dateInput, { target: { value: '2026-12-25' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/savings/categories/cat-1/overrides', {
        date: '2026-12-25',
        funded: false,
      });
    });

    expect(await screen.findByText('2026-12-25')).toBeInTheDocument();
  });

  it('removes an override via DELETE (Req 2.5, 2.6)', async () => {
    mockGet.mockResolvedValueOnce({ data: baseConfig });
    mockDelete.mockResolvedValueOnce({ data: { existed: true } });

    render(<FundedDayConfig categoryId="cat-1" categoryName="Food" />);

    const removeBtn = await screen.findByRole('button', { name: /remove override for 2026-07-04/i });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/savings/categories/cat-1/overrides/2026-07-04');
    });

    await waitFor(() => {
      expect(screen.queryByText('2026-07-04')).not.toBeInTheDocument();
    });
  });
});
