import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { useUiStore } from '../store/uiStore';
import Button from '../components/ui/Button';
import {
  Wallet,
  Users,
  TrendingUp,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
} from 'lucide-react';

/** Shape of a balance entry from GET /api/transactions/balances */
interface Balance {
  friendProfileId: string;
  friendName: string;
  netBalance: number;
}

/** Shape of a budget status entry from GET /api/transactions/budget */
interface BudgetStatus {
  categoryId: string;
  categoryName: string;
  monthlyLimit: number;
  spent: number;
  remaining: number;
}

/**
 * Dashboard — Phase 7, Step 7.2 + partial Phase 8 preview.
 * Integrates the TransactionForm modal and shows live balance
 * / budget data from the backend.
 */
const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const { openTransactionForm, transactionTimestamp } = useUiStore();

  // ── Data State ────────────────────────────────────────────────────────
  const [balances, setBalances] = useState<Balance[]>([]);
  const [budgetStatuses, setBudgetStatuses] = useState<BudgetStatus[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // ── Fetch Dashboard Data ──────────────────────────────────────────────
  const fetchDashboardData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [balancesRes, budgetRes] = await Promise.all([
        api.get('/transactions/balances'),
        api.get('/transactions/budget'),
      ]);
      setBalances(balancesRes.data.balances || []);
      setBudgetStatuses(budgetRes.data.budgetStatuses || []);
    } catch {
      // Silently fail — pages will show empty states
    } finally {
      setDataLoading(false);
    }
  }, []);

  // ── Auto-Refresh on Global Transaction Complete ───────────────────────
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData, transactionTimestamp]);

  // ── Utility ───────────────────────────────────────────────────────────
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const featureCards = [
    {
      icon: Wallet,
      title: 'Budget Tracker',
      description: 'Monitor your spending categories and limits in real-time.',
    },
    {
      icon: Users,
      title: 'Split Expenses',
      description: 'Track shared costs and settle debts with friends.',
    },
    {
      icon: TrendingUp,
      title: 'Balance Overview',
      description: 'See who owes you and what you owe at a glance.',
    },
  ];

  // ── Derived Data ──────────────────────────────────────────────────────
  const positiveBalances = balances.filter((b) => b.netBalance > 0);
  const negativeBalances = balances.filter((b) => b.netBalance < 0);
  const totalOwed = positiveBalances.reduce((s, b) => s + b.netBalance, 0);
  const totalOwe = Math.abs(
    negativeBalances.reduce((s, b) => s + b.netBalance, 0),
  );

  return (
    <div className="animate-fadeInFast">
      {/* ── Welcome Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-fluid-h1 text-foreground font-display font-semibold tracking-tight">
            Overview
          </h1>
          <p className="text-muted text-base font-medium mt-1">
            {user?.email ? `${user.email.split('@')[0]}'s ` : ''}financial activity
          </p>
        </div>
        <Button
          onClick={openTransactionForm}
          size="md"
          id="add-transaction-btn"
        >
          <Plus className="w-4 h-4" />
          Add Log
        </Button>
      </div>

      <div className="divider mb-8" />

      {/* ── Summary Grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {/* Total Owed To You */}
        <div className="md:col-span-2 container-card p-6 md:p-8 hover:border-success/30 transition-colors duration-300">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-success/10 flex items-center justify-center">
              <ArrowDownRight className="w-6 h-6 text-success" />
            </div>
            <p className="text-base font-medium text-muted">
              Owed to You
            </p>
          </div>
          <p className="text-fluid-hero text-success font-display font-semibold tracking-tight">
            {dataLoading ? (
              <span className="inline-block h-14 w-40 bg-surface-hover rounded-lg animate-pulse" />
            ) : (
              `+${fmt(totalOwed)}`
            )}
          </p>
          <p className="text-sm font-medium text-muted mt-3">
            From {positiveBalances.length} friend{positiveBalances.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Right Column — You Owe + Active Budgets */}
        <div className="flex flex-col gap-4">
          <div className="container-card p-6 hover:border-error/30 transition-colors duration-300 flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-error/10 flex items-center justify-center">
                <ArrowUpRight className="w-6 h-6 text-error" />
              </div>
              <p className="text-base font-medium text-muted">
                You Owe
              </p>
            </div>
            <p className="text-fluid-h2 text-error font-display font-semibold tracking-tight">
              {dataLoading ? (
                <span className="inline-block h-8 w-28 bg-surface-hover rounded-lg animate-pulse" />
              ) : (
                `-${fmt(totalOwe)}`
              )}
            </p>
            <p className="text-sm font-medium text-muted mt-2">
              To {negativeBalances.length} friend{negativeBalances.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="container-card p-6 hover:border-primary/30 transition-colors duration-300 flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <Receipt className="w-6 h-6 text-primary" />
              </div>
              <p className="text-base font-medium text-muted">
                Active Budgets
              </p>
            </div>
            <p className="text-fluid-h2 text-foreground font-display font-semibold tracking-tight">
              {dataLoading ? (
                <span className="inline-block h-8 w-12 bg-surface-hover rounded-lg animate-pulse" />
              ) : (
                budgetStatuses.length
              )}
            </p>
            <p className="text-sm font-medium text-muted mt-2">
              {budgetStatuses.filter((b) => b.remaining > 0).length} within limit
            </p>
          </div>
        </div>
      </div>

      {/* ── Two-Column Layout for Desktop ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* ── Budget Status Section ────────────────────────────────────── */}
        {budgetStatuses.length > 0 && (
          <div>
            <h2 className="text-2xl font-display font-semibold text-foreground tracking-tight mb-5">
              Budget Status
            </h2>
            <div className="flex flex-col gap-3">
            {budgetStatuses.map((bs) => {
              const pct =
                bs.monthlyLimit > 0
                  ? Math.min((bs.spent / bs.monthlyLimit) * 100, 100)
                  : 0;
              const isOverBudget = bs.remaining <= 0;

              return (
                <div
                  key={bs.categoryId}
                  className="container-card p-4 hover:border-border transition-colors duration-200"
                >
                  <div className="flex items-end justify-between mb-3">
                    <p className="text-sm font-semibold text-foreground">
                      {bs.categoryName}
                    </p>
                    <p
                      className={`text-xs font-semibold ${
                        isOverBudget ? 'text-error' : 'text-success'
                      }`}
                    >
                      {bs.remaining >= 0 ? '+' : ''}{fmt(bs.remaining)} left
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOverBudget
                          ? 'bg-error'
                          : pct > 75
                            ? 'bg-secondary'
                            : 'bg-primary'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-muted">
                      Spent: {fmt(bs.spent)}
                    </p>
                    <p className="text-xs text-muted">
                      Limit: {fmt(bs.monthlyLimit)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* ── Balances Section ──────────────────────────────────────────── */}
        {balances.length > 0 && (
          <div>
            <h2 className="text-2xl font-display font-semibold text-foreground tracking-tight mb-5">
              Friend Balances
            </h2>
            <div className="flex flex-col gap-3">
            {balances.map((b) => (
              <div
                key={b.friendProfileId}
                className="container-card container-card-interactive p-4 flex items-center gap-4"
              >
                <div
                  className={`w-10 h-10 flex items-center justify-center shrink-0 rounded-xl ${
                    b.netBalance >= 0
                      ? 'bg-success/10 text-success'
                      : 'bg-error/10 text-error'
                  }`}
                >
                  {b.netBalance >= 0 ? (
                    <ArrowDownRight className="w-5 h-5" />
                  ) : (
                    <ArrowUpRight className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {b.friendName}
                  </p>
                  <p
                    className={`text-xs font-medium mt-0.5 ${
                      b.netBalance >= 0 ? 'text-success' : 'text-error'
                    }`}
                  >
                    {b.netBalance >= 0
                      ? `Owes you +${fmt(b.netBalance)}`
                      : `You owe -${fmt(Math.abs(b.netBalance))}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* ── Feature Cards (Shown when no data) ────────────────────────── */}
      {balances.length === 0 && budgetStatuses.length === 0 && !dataLoading && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {featureCards.map((card) => (
              <div
                key={card.title}
                className="container-card p-6 group"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors duration-200">
                  <card.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-base font-display font-semibold text-foreground mb-1.5">
                  {card.title}
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {card.description}
                </p>
              </div>
            ))}
          </div>
          <div className="container-subtle text-center py-12 px-6 rounded-2xl">
            <p className="text-muted text-sm font-medium mb-5">
              No history yet. Log an expense or create a budget to get started.
            </p>
            <Button
              onClick={openTransactionForm}
              size="lg"
              id="add-transaction-empty"
            >
              <Plus className="w-4 h-4" />
              Log First Transaction
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
