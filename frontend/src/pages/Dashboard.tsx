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
  Handshake,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { useGamificationStore } from '../store/gamificationStore';
import { StreakWidget } from '../components/gamification/StreakWidget';
import { ActiveChallengeCard } from '../components/gamification/ActiveChallengeCard';

/** Shape of a balance entry from GET /api/transactions/balances */
interface Balance {
  friendProfileId: string;
  friendName: string;
  receivableBalance: number;
  payableBalance: number;
}

/** Shape of a budget status entry from GET /api/transactions/budget */
interface BudgetStatus {
  categoryId: string;
  categoryName: string;
  monthlyLimit: number;
  spent: number;
  remaining: number;
  projectedSpend?: number;
  status?: string;
  insightText?: string;
  alertText?: string;
}

/**
 * Dashboard — Phase 7, Step 7.2 + partial Phase 8 preview.
 * Integrates the TransactionForm modal and shows live balance
 * / budget data from the backend.
 */
interface PendingTransaction {
  id: string;
  creatorId: string;
  creator: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  amount: number;
  message: string | null;
  createdAt: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const { openTransactionForm, transactionTimestamp } = useUiStore();
  const { challenges } = useGamificationStore();

  // ── Data State ────────────────────────────────────────────────────────
  const [balances, setBalances] = useState<Balance[]>([]);
  const [budgetStatuses, setBudgetStatuses] = useState<BudgetStatus[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});
  const [resolvingIds, setResolvingIds] = useState<Record<string, boolean>>({});
  const [dataLoading, setDataLoading] = useState(true);

  // ── Fetch Dashboard Data ──────────────────────────────────────────────
  const fetchDashboardData = useCallback(async () => {
    setDataLoading(true);
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const clientNow = now.toISOString();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

      const [balancesRes, budgetRes, pendingRes] = await Promise.all([
        api.get('/transactions/balances'),
        api.get(`/transactions/budget?monthStart=${monthStart}&monthEnd=${monthEnd}&now=${clientNow}&daysInMonth=${daysInMonth}`),
        api.get('/transactions/pending'),
        useGamificationStore.getState().fetchProfile(),
        useGamificationStore.getState().fetchChallenges('ACTIVE'),
      ]);
      setBalances(balancesRes.data.balances || []);
      setBudgetStatuses(budgetRes.data.budgetStatuses || []);
      setPendingTransactions(pendingRes.data.pendingTransactions || []);
    } catch {
      // Silently fail — pages will show empty states
    } finally {
      setDataLoading(false);
    }
  }, []);

  // ── Handle Pending Response ───────────────────────────────────────────
  const handleRespondPending = async (id: string, action: 'APPROVE' | 'REJECT') => {
    const categoryId = selectedCategories[id];
    if (action === 'APPROVE' && !categoryId) return;

    setResolvingIds(prev => ({ ...prev, [id]: true }));
    try {
      await api.post(`/transactions/pending/${id}/respond`, {
        action,
        categoryId: action === 'APPROVE' ? categoryId : undefined,
      });
      // Success! Refresh dashboard data
      fetchDashboardData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to respond to transaction request');
    } finally {
      setResolvingIds(prev => ({ ...prev, [id]: false }));
    }
  };

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
  const positiveBalances = balances.filter((b) => b.receivableBalance > 0);
  const negativeBalances = balances.filter((b) => b.payableBalance > 0);
  const totalOwed = positiveBalances.reduce((s, b) => s + b.receivableBalance, 0);
  const totalOwe = negativeBalances.reduce((s, b) => s + b.payableBalance, 0);

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
        <div className="flex items-center gap-2">
          <Button
            onClick={() => openTransactionForm('expense')}
            variant="outline"
            size="md"
            id="add-expense-btn"
            className="flex-1 sm:flex-none"
          >
            <Plus className="w-4 h-4" />
            Log Expense
          </Button>
          <Button
            onClick={() => openTransactionForm('settlement')}
            size="md"
            id="add-settlement-btn"
            className="flex-1 sm:flex-none"
          >
            <Handshake className="w-4 h-4" />
            Settle Balance
          </Button>
        </div>
      </div>

      <div className="divider mb-8" />

      {/* ── Pending Approvals ─────────────────────────────────────────── */}
      {pendingTransactions.length > 0 && (
        <div className="mb-8 animate-fadeInFast">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-warning" />
            <h2 className="text-2xl font-display font-semibold text-foreground tracking-tight">
              Pending Approvals
            </h2>
          </div>
          <div className="flex flex-col gap-4">
            {pendingTransactions.map((tx) => {
              const creatorName = tx.creator?.displayName || tx.creator?.username || 'Friend';
              const selectedCat = selectedCategories[tx.id] || '';
              const isResolving = resolvingIds[tx.id] || false;

              return (
                <div
                  key={tx.id}
                  className="container-card border-warning/30 bg-warning/5 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-warning/50 transition-colors duration-300"
                >
                  <div className="flex-1">
                    <p className="text-[0.95rem] text-foreground font-medium">
                      <span className="font-semibold text-warning">{creatorName}</span> logged a shared expense where you paid.
                    </p>
                    {tx.message && (
                      <p className="text-sm text-muted mt-1 italic">
                        &ldquo;{tx.message}&rdquo;
                      </p>
                    )}
                    <div className="flex items-baseline gap-2 mt-3">
                      <span className="text-3xl font-display font-bold text-foreground">
                        {fmt(Number(tx.amount))}
                      </span>
                      <span className="text-xs text-muted">
                        on {new Date(tx.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-end gap-3 shrink-0">
                    <div className="flex flex-col gap-1.5 min-w-[220px]">
                      <label htmlFor={`category-select-${tx.id}`} className="text-xs text-muted font-semibold tracking-wider uppercase">
                        Select Budget Category
                      </label>
                      <select
                        id={`category-select-${tx.id}`}
                        value={selectedCat}
                        onChange={(e) =>
                          setSelectedCategories((prev) => ({ ...prev, [tx.id]: e.target.value }))
                        }
                        className="w-full bg-surface border border-border-subtle text-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer hover:bg-surface-hover transition-colors"
                      >
                        <option value="">-- Choose Category --</option>
                        {budgetStatuses.map((cat) => (
                          <option key={cat.categoryId} value={cat.categoryId}>
                            {cat.categoryName} ({fmt(cat.remaining)} left)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleRespondPending(tx.id, 'REJECT')}
                        isLoading={isResolving}
                        variant="outline"
                        size="md"
                        className="py-2.5 hover:bg-error/10 hover:text-error hover:border-error/30"
                      >
                        Reject
                      </Button>
                      <Button
                        onClick={() => handleRespondPending(tx.id, 'APPROVE')}
                        disabled={!selectedCat}
                        isLoading={isResolving}
                        size="md"
                        variant="primary"
                        className="py-2.5"
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {/* ── AI Spending Forecasting ──────────────────────────────────── */}
      {budgetStatuses.length > 0 && budgetStatuses.some(bs => bs.insightText) && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-5">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-display font-semibold text-foreground tracking-tight">
              Spending Forecast & Insights
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {budgetStatuses.map((bs) => {
              if (!bs.insightText) return null;
              
              const isOverBudget = bs.status === 'OVER_BUDGET';
              const isAtRisk = bs.status === 'AT_RISK';
              const isNew = bs.status === 'NEW';
              const isSurplus = bs.status === 'SURPLUS';
              
              let borderColor = 'border-border';
              let iconColor = 'text-primary';
              let bgIconColor = 'bg-primary/10';
              
              if (isOverBudget) {
                borderColor = 'border-error/50';
                iconColor = 'text-error';
                bgIconColor = 'bg-error/10';
              } else if (isAtRisk) {
                borderColor = 'border-warning/50';
                iconColor = 'text-warning';
                bgIconColor = 'bg-warning/10';
              } else if (isSurplus) {
                borderColor = 'border-success/50';
                iconColor = 'text-success';
                bgIconColor = 'bg-success/10';
              } else if (isNew) {
                borderColor = 'border-border';
                iconColor = 'text-muted';
                bgIconColor = 'bg-surface-hover';
              }

              return (
                <div key={`forecast-${bs.categoryId}`} className={`container-card p-5 border ${borderColor} transition-colors`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl ${bgIconColor} flex items-center justify-center shrink-0`}>
                      {(isOverBudget || isAtRisk) ? (
                        <AlertTriangle className={`w-5 h-5 ${iconColor}`} />
                      ) : (
                        <Sparkles className={`w-5 h-5 ${iconColor}`} />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{bs.categoryName}</h3>
                      {bs.alertText && (
                        <p className={`text-xs font-medium mt-0.5 ${iconColor}`}>
                          {bs.alertText}
                        </p>
                      )}
                      <p className="text-sm text-muted mt-2 leading-relaxed">
                        {bs.insightText}
                      </p>
                      {!isNew && (
                        <p className="text-xs text-muted font-medium mt-3 pt-3 border-t border-border/50">
                          Projected end of month: <span className="text-foreground">{fmt(bs.projectedSpend || 0)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Gamification Streak & Challenge Widgets ───────────────────── */}
      {(() => {
        const hasActiveChallenge = challenges.some(
          (c) => c.status === 'ACTIVE' && c.myStatus !== 'pending'
        );
        return (
          <div className={`grid grid-cols-1 ${hasActiveChallenge ? 'md:grid-cols-2' : ''} gap-4 mb-8`}>
            <StreakWidget />
            <ActiveChallengeCard />
          </div>
        );
      })()}

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
        {(positiveBalances.length > 0 || negativeBalances.length > 0) && (
          <div>
            <h2 className="text-2xl font-display font-semibold text-foreground tracking-tight mb-5">
              Friend Balances
            </h2>
            <div className="flex flex-col gap-3">
            {balances.flatMap((b) => {
              const items = [];
              if (b.receivableBalance > 0) {
                items.push(
                  <div
                    key={`${b.friendProfileId}-rec`}
                    className="container-card container-card-interactive p-4 flex items-center gap-4"
                  >
                    <div className="w-10 h-10 flex items-center justify-center shrink-0 rounded-xl bg-success/10 text-success">
                      <ArrowDownRight className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {b.friendName}
                      </p>
                      <p className="text-xs font-medium mt-0.5 text-success">
                        Owes you +{fmt(b.receivableBalance)}
                      </p>
                    </div>
                  </div>
                );
              }
              if (b.payableBalance > 0) {
                items.push(
                  <div
                    key={`${b.friendProfileId}-pay`}
                    className="container-card container-card-interactive p-4 flex items-center gap-4"
                  >
                    <div className="w-10 h-10 flex items-center justify-center shrink-0 rounded-xl bg-error/10 text-error">
                      <ArrowUpRight className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {b.friendName}
                      </p>
                      <p className="text-xs font-medium mt-0.5 text-error">
                        You owe -{fmt(b.payableBalance)}
                      </p>
                    </div>
                  </div>
                );
              }
              return items;
            })}
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
              onClick={() => openTransactionForm()}
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
