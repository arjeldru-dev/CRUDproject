import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';

// Requirement 6.10 — the Dashboard positions the Savings_Graph AFTER the Financial
// Overview section in document order.
//
// This is a Dashboard-layout concern (rather than a Savings_Graph-internal one),
// so it renders the real `Dashboard` page with its data/store dependencies mocked
// and the two sibling sections replaced by lightweight markers. Asserting the
// relative document position of those markers verifies the ordering the Dashboard
// is responsible for, independent of either child component's internals.

// ── Mock stores ──────────────────────────────────────────────────────
vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { displayName: 'Tester', username: 'tester' } }),
}));

vi.mock('../../store/uiStore', () => ({
  useUiStore: () => ({ openTransactionForm: vi.fn(), transactionTimestamp: 0 }),
}));

// `useGamificationStore` is called both as a hook and via `.getState()`. The
// factory is hoisted, so everything it returns must be defined inline.
vi.mock('../../store/gamificationStore', () => {
  const store = Object.assign(() => ({ challenges: [] }), {
    getState: () => ({
      fetchProfile: vi.fn().mockResolvedValue(undefined),
      fetchChallenges: vi.fn().mockResolvedValue(undefined),
    }),
  });
  return { useGamificationStore: store };
});

// ── Mock the axios singleton (all dashboard fetches resolve to empty data) ──
vi.mock('../../lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// ── Replace the two sibling sections with markers, stub other heavy children ──
vi.mock('../../components/ui/FinancialOverviewPanel', () => ({
  FinancialOverviewPanel: () => <div data-testid="marker-financial-overview" />,
}));
vi.mock('../../components/ui/SavingsGraph', () => ({
  SavingsGraph: () => <div data-testid="marker-savings-graph" />,
}));
vi.mock('../../components/gamification/StreakWidget', () => ({ StreakWidget: () => null }));
vi.mock('../../components/gamification/ActiveChallengeCard', () => ({ ActiveChallengeCard: () => null }));
vi.mock('../../components/ui/BudgetForecastBarChart', () => ({ BudgetForecastBarChart: () => null }));

import Dashboard from '../Dashboard';

describe('Dashboard savings-graph placement', () => {
  it('renders the Savings_Graph after the Financial Overview section (Req 6.10)', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    const finOverview = await screen.findByTestId('marker-financial-overview');
    const savingsGraph = await screen.findByTestId('marker-savings-graph');

    // The Savings_Graph must FOLLOW the Financial Overview panel in document order.
    const relation = finOverview.compareDocumentPosition(savingsGraph);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(relation & Node.DOCUMENT_POSITION_PRECEDING).toBeFalsy();
  });
});
