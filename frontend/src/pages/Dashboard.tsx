import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { useUiStore } from '../store/uiStore';
import Button from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  Wallet,
  TrendingUp,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Handshake,
  AlertTriangle,
  Trophy,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useGamificationStore } from '../store/gamificationStore';
import { StreakWidget } from '../components/gamification/StreakWidget';
import { ActiveChallengeCard } from '../components/gamification/ActiveChallengeCard';
import { FinancialOverviewPanel } from '../components/ui/FinancialOverviewPanel';
import { BudgetForecastBarChart } from '../components/ui/BudgetForecastBarChart';
import { periodName, type BudgetPeriod } from '../lib/budgetPeriod';

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
  limitAmount: number;
  spent: number;
  remaining: number;
  projectedSpend?: number;
  status?: string;
  insightText?: string;
  alertText?: string;
  lowConfidence?: boolean;
  confidence?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  pctUsed?: number;
  projectedPct?: number;
  projectedOverage?: number;
  recommendedDailySpend?: number | null;
  period?: BudgetPeriod;
  periodLabel?: string;
}

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
  type?: 'EXPENSE' | 'SETTLEMENT';
  payerId?: string;
  splits?: Array<{ profileId: string; amount: number }>;
  friendProfileId?: string | null;
  categoryRequired?: boolean;
  userShare?: number;
}

const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const { openTransactionForm, transactionTimestamp } = useUiStore();
  const { challenges } = useGamificationStore();
  const navigate = useNavigate();

  // ── Data State ────────────────────────────────────────────────────────
  const [balances, setBalances] = useState<Balance[]>([]);
  const [budgetStatuses, setBudgetStatuses] = useState<BudgetStatus[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});
  const [resolvingIds, setResolvingIds] = useState<Record<string, boolean>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'danger';
    type?: 'alert' | 'confirm' | 'prompt';
    onConfirm: (val?: string) => void;
  } | null>(null);

  // ── Fetch Dashboard Data ──────────────────────────────────────────────
  const fetchDashboardData = useCallback(async () => {
    setDataLoading(true);
    setDataError(false);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const [balancesRes, budgetRes, pendingRes] = await Promise.all([
        api.get('/transactions/balances'),
        api.get(`/transactions/budget?timezone=${encodeURIComponent(timezone)}`),
        api.get('/transactions/pending'),
      ]);
      setBalances(balancesRes.data.balances || []);
      setBudgetStatuses(budgetRes.data.budgetStatuses || []);
      setPendingTransactions(pendingRes.data.pendingTransactions || []);

      // Non-blocking gamification updates
      Promise.allSettled([
        useGamificationStore.getState().fetchProfile(),
        useGamificationStore.getState().fetchChallenges('ACTIVE'),
      ]).catch(err => {
        console.error('Failed to load gamification data:', err);
      });
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setDataError(true);
    } finally {
      setDataLoading(false);
    }
  }, []);

  // ── Handle Pending Response ───────────────────────────────────────────
  const handleRespondPending = async (id: string, action: 'APPROVE' | 'REJECT', categoryRequired: boolean) => {
    const categoryId = selectedCategories[id];
    if (action === 'APPROVE' && categoryRequired && !categoryId) return;

    setResolvingIds(prev => ({ ...prev, [id]: true }));
    try {
      await api.post(`/transactions/pending/${id}/respond`, {
        action,
        categoryId: (action === 'APPROVE' && categoryRequired) ? categoryId : undefined,
      });
      // Success! Refresh dashboard data
      fetchDashboardData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setDialogConfig({
        isOpen: true,
        title: 'Error',
        message: error.response?.data?.error || 'Failed to respond to transaction request',
        type: 'alert',
        onConfirm: () => setDialogConfig(null),
      });
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

  // ── Derived Data ──────────────────────────────────────────────────────
  const positiveBalances = balances.filter((b) => b.receivableBalance > 0);
  const negativeBalances = balances.filter((b) => b.payableBalance > 0);

  return (
    <div className="animate-fadeInFast w-full">
      {/* ── Welcome Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-1.5 sm:mb-2 lg:mb-3">
        <div>
          <h1 className="text-fluid-h1 text-foreground font-display font-semibold tracking-tight">
            Overview
          </h1>
          <p className="text-muted text-base font-medium mt-1">
            {user?.displayName || user?.username || 'Your'} Financial Activity
          </p>
        </div>
      </div>

      {/* ── Mobile Action Buttons ── */}
      <div className="flex items-center gap-2 w-full lg:hidden">
        {/* Swapped action weight: Log Expense is now filled primary, Settle is outline */}
        <Button
          onClick={() => openTransactionForm('expense')}
          variant="primary"
          size="md"
          id="add-expense-btn"
          className="flex-1 min-w-0 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Log Expense
        </Button>
        <Button
          onClick={() => openTransactionForm('settlement')}
          variant="outline"
          size="md"
          id="add-settlement-btn"
          className="flex-1 min-w-0 whitespace-nowrap"
        >
          <Handshake className="w-4 h-4" aria-hidden="true" />
          Settle Balance
        </Button>
      </div>

      {/* Spacing below header/buttons */}
      <div className="h-1.5 sm:h-2 lg:hidden" aria-hidden="true" />

      {/* ── Global Network Error Indicator Banner ── */}
      {dataError && (
        <div className="container-card border-error/30 bg-error/5 p-4.5 mb-2 flex flex-col sm:flex-row items-center justify-between gap-4 animate-slideDownIn shrink-0">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-error shrink-0" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Failed to sync financial data</h3>
              <p className="text-xs text-muted mt-0.5">Please check your connection and try again.</p>
            </div>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={fetchDashboardData} 
            className="w-full sm:w-auto text-xs py-1.5 border-error/20 hover:bg-error/5 hover:text-error hover:border-error/30 font-medium shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Retry Sync
          </Button>
        </div>
      )}

      {/* ── Pending Approvals ─────────────────────────────────────────── */}
      {pendingTransactions.length > 0 && (
        <>
          <div className="animate-fadeInFast">
            <div className="mb-1">
              <h2 className="text-2xl font-display font-semibold text-foreground tracking-tight">
                Pending Approvals
              </h2>
            </div>
            <div className="flex flex-col gap-2.5">
            {pendingTransactions.map((tx) => {
              const creatorName = tx.creator?.displayName || tx.creator?.username || 'Friend';
              const selectedCat = selectedCategories[tx.id] || '';
              const isResolving = resolvingIds[tx.id] || false;
              const categoryRequired = tx.categoryRequired ?? false;

              // Determine primary display amount and subtext
              let primaryAmount = Number(tx.amount);
              let amountSubtext = `on ${new Date(tx.createdAt).toLocaleDateString()}`;

              if ((tx.type ?? 'EXPENSE') === 'EXPENSE') {
                if (tx.userShare !== undefined) {
                  if (categoryRequired) {
                    primaryAmount = Number(tx.amount);
                    amountSubtext = `Total paid • on ${new Date(tx.createdAt).toLocaleDateString()}`;
                  } else {
                    primaryAmount = tx.userShare;
                    amountSubtext = `Your share (Total: ${fmt(Number(tx.amount))}) • on ${new Date(tx.createdAt).toLocaleDateString()}`;
                  }
                } else if (tx.payerId === 'self' && tx.splits) {
                  const friendSplit = tx.splits.find((s) => s.profileId !== 'self');
                  if (friendSplit) {
                    primaryAmount = friendSplit.amount;
                    amountSubtext = `Your share (Total: ${fmt(Number(tx.amount))}) • on ${new Date(tx.createdAt).toLocaleDateString()}`;
                  }
                }
              }

              return (
                <div
                  key={tx.id}
                  className="bg-surface rounded-2xl bg-warning/5 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 transition-all duration-200 ease-out animate-slideDownIn"
                  style={{ padding: '24px' }}
                >
                  <div className="flex-1">
                    <p className="text-[0.95rem] text-foreground font-medium">
                      {tx.type === 'SETTLEMENT' ? (
                        <>
                          <span className="font-semibold text-warning">{creatorName}</span> logged a settlement where {tx.payerId === 'self' ? 'they paid you' : 'you paid them'}.
                        </>
                      ) : tx.payerId !== 'self' ? (
                        categoryRequired ? (
                          <>
                            <span className="font-semibold text-warning">{creatorName}</span> requested split verification for <span className="font-semibold">{fmt(Number(tx.amount))}</span> (you paid).
                          </>
                        ) : (
                          <>
                            <span className="font-semibold text-warning">{creatorName}</span> logged a shared expense of <span className="font-semibold">{fmt(Number(tx.amount))}</span> (friend paid).
                          </>
                        )
                      ) : (
                        <>
                          <span className="font-semibold text-warning">{creatorName}</span> requested split verification where they paid.
                        </>
                      )}
                    </p>
                    {tx.message && (
                      <p className="text-sm text-muted mt-1 italic">
                        &ldquo;{tx.message}&rdquo;
                      </p>
                    )}
                    <div className="flex items-baseline gap-2 mt-3">
                      <span className="text-3xl font-display font-bold text-foreground">
                        {fmt(primaryAmount)}
                      </span>
                      <span className="text-xs text-muted">
                        {amountSubtext}
                      </span>
                    </div>
                  </div>

                  {/* Layout aligned to md:flex-row to prevent text crowding on vertical tablets */}
                  <div className="flex flex-col md:flex-row md:items-end gap-3 shrink-0">
                    {categoryRequired && (
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
                          className="w-full bg-surface border border-border text-foreground rounded-xl px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer hover:bg-surface-hover transition-[background-color,border-color] duration-160 ease-out"
                        >
                          <option value="">Select a budget category</option>
                          {budgetStatuses.map((cat) => (
                            <option key={cat.categoryId} value={cat.categoryId}>
                              {cat.categoryName} ({fmt(cat.remaining)} left)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleRespondPending(tx.id, 'REJECT', categoryRequired)}
                        isLoading={isResolving}
                        variant="outline"
                        size="md"
                        className="px-10 py-2.5 hover:bg-error/10 hover:text-error hover:border-error/30 min-w-[130px] whitespace-nowrap text-center"
                      >
                        Reject
                      </Button>
                      <Button
                        onClick={() => handleRespondPending(tx.id, 'APPROVE', categoryRequired)}
                        disabled={categoryRequired && !selectedCat}
                        isLoading={isResolving}
                        size="md"
                        variant="primary"
                        className="px-10 py-2.5 min-w-[130px] whitespace-nowrap text-center"
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
        <div className="h-1.5 lg:h-2" aria-hidden="true" />
        </>
      )}

      {/* ── Asymmetric Bento Grid ──────────────────────────────── */}
      {(() => {
        const hasActiveChallenge = challenges.some(
          (c) => c.status === 'ACTIVE' && c.myStatus !== 'pending'
        );
        return (
          <div className="space-y-2 lg:space-y-3 mb-2 lg:mb-3">
            <div className="animate-slideUpIn" style={{ animationDelay: '0ms' }}>
              <FinancialOverviewPanel
                budgetStatuses={budgetStatuses}
                balances={balances}
                loading={dataLoading}
                error={dataError}
                onRetry={fetchDashboardData}
                onLogTransaction={() => openTransactionForm('expense')}
              />
            </div>

            {/* Row 2: Gamification Widgets & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-[1px] lg:gap-3 items-stretch">
              {/* Streak Widget */}
              <div 
                className="lg:col-span-4 flex flex-col gap-[1px] animate-slideUpIn"
                style={{ animationDelay: '120ms' }}
              >
                <h2 className="text-2xl font-display font-semibold text-foreground tracking-tight">
                  Streak
                </h2>
                <StreakWidget />
              </div>
              
              {/* Active Challenge Card or Empty State */}
              <div 
                className="lg:col-span-5 flex flex-col gap-[1px] animate-slideUpIn" 
                style={{ animationDelay: '180ms' }}
              >
                <h2 className="text-2xl font-display font-semibold text-foreground tracking-tight">
                  Challenges
                </h2>
                {hasActiveChallenge ? (
                  <ActiveChallengeCard />
                ) : (
                  <div 
                    className="bg-surface rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between group flex-1 h-full"
                    style={{ padding: '24px' }}
                  >
                    <div>
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 rounded-xl bg-warning/10 flex items-center justify-center shrink-0 transition-colors duration-200">
                          <Trophy className="w-5 h-5 text-warning transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[6deg]" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-display font-semibold text-foreground">
                            Join a Saving Challenge
                          </h3>
                          <p className="text-xs text-muted mt-1 leading-relaxed">
                            Compete with friends to stay under budget! Reach saving streaks together and unlock exclusive avatar frames.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 pt-4 flex items-center justify-between">
                      <span className="text-xs text-muted font-medium">No Active Challenges</span>
                      <Button
                        size="md"
                        variant="outline"
                        onClick={() => navigate('/challenges')}
                        className="px-12 py-2.5 text-center min-w-[210px] whitespace-nowrap"
                      >
                        Browse Challenges
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Actions Card (Desktop only) */}
              <div 
                className="hidden lg:flex lg:col-span-3 flex-col gap-[1px] animate-slideUpIn"
                style={{ animationDelay: '240ms' }}
              >
                <h2 className="text-2xl font-display font-semibold text-foreground tracking-tight">
                  Quick Actions
                </h2>
                <div 
                  className="bg-surface rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md flex flex-col group flex-1 h-full"
                  style={{ padding: '24px' }}
                >
                  <div className="flex-1 flex flex-col justify-center gap-3">
                    <Button
                      onClick={() => openTransactionForm('expense')}
                      variant="primary"
                      size="lg"
                      id="desktop-add-expense-btn"
                      className="w-full flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      Log Expense
                    </Button>
                    <Button
                      onClick={() => openTransactionForm('settlement')}
                      variant="outline"
                      size="lg"
                      id="desktop-add-settlement-btn"
                      className="w-full flex items-center justify-center gap-2"
                    >
                      <Handshake className="w-4 h-4" aria-hidden="true" />
                      Settle Balance
                    </Button>
                  </div>
                  <div className="text-[11px] text-muted leading-relaxed select-none mt-6 pt-4 shrink-0">
                    Log shared expenses or settle outstanding balances directly with friends.
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── AI Spending Forecasting ──────────────────────────────────── */}
      {budgetStatuses.length > 0 && budgetStatuses.some(bs => bs.insightText) && (
        <div className="mb-2 lg:mb-3">
          <div className="mb-1 lg:mb-2">
            <h2 className="text-2xl font-display font-semibold text-foreground tracking-tight">
              Spending Forecast & Insights
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {budgetStatuses.map((bs, i) => {
              if (!bs.insightText) return null;
              
              const isOverBudget = bs.status === 'OVER_BUDGET';
              const isAtRisk = bs.status === 'AT_RISK';
              const isNew = bs.status === 'NEW';
              const isSurplus = bs.status === 'SURPLUS';
              // Early period with a concerning projection: cautionary, not alarming.
              const isTrendingHigh = !isAtRisk && !isOverBudget && !!bs.lowConfidence;
              
              let iconColor = 'text-primary';
              let bgIconColor = 'bg-primary/10';
              
              if (isOverBudget) {
                iconColor = 'text-error';
                bgIconColor = 'bg-error/10';
              } else if (isAtRisk || isTrendingHigh) {
                iconColor = 'text-warning';
                bgIconColor = 'bg-warning/10';
              } else if (isSurplus) {
                iconColor = 'text-success';
                bgIconColor = 'bg-success/10';
              } else if (isNew) {
                iconColor = 'text-muted';
                bgIconColor = 'bg-surface-hover';
              }

              return (
                <div 
                  key={`forecast-${bs.categoryId}`} 
                  className="bg-surface rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md ease-out animate-slideUpIn"
                  style={{ padding: '24px', animationDelay: `${i * 40}ms` }}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl ${bgIconColor} flex items-center justify-center shrink-0`}>
                      {(isOverBudget || isAtRisk || isTrendingHigh) ? (
                        <AlertTriangle className={`w-5 h-5 ${iconColor}`} aria-hidden="true" />
                      ) : (
                        <TrendingUp className={`w-5 h-5 ${iconColor}`} aria-hidden="true" />
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
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
                          <p className="text-xs text-muted font-medium">
                            Projected for {bs.periodLabel ? bs.periodLabel.toLowerCase() : 'this period'}: <span className="text-foreground">{fmt(bs.projectedSpend || 0)}</span>
                          </p>
                          {isOverBudget && (bs.projectedOverage ?? 0) > 0 && (
                            <p className="text-xs text-error font-medium">
                              Projected overspend: <span className="font-semibold">{fmt(bs.projectedOverage || 0)}</span>
                            </p>
                          )}
                          {!isOverBudget && bs.recommendedDailySpend != null && bs.recommendedDailySpend > 0 && (
                            <p className="text-xs text-muted font-medium">
                              Safe daily spend: <span className="text-foreground">{fmt(bs.recommendedDailySpend)}/day</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Two-Column Layout for Desktop ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 lg:gap-4 mb-2 lg:mb-3">
        {/* ── Budget Status Section ────────────────────────────────────── */}
        {budgetStatuses.length > 0 && (
          <div>
            <h2 className="text-2xl font-display font-semibold text-foreground tracking-tight mb-1.5 lg:mb-2">
              Budget Status
            </h2>
            <div className="flex flex-col gap-2">
              {budgetStatuses.map((bs) => (
                <BudgetForecastBarChart
                  key={bs.categoryId}
                  categoryName={bs.categoryName}
                  limitAmount={bs.limitAmount}
                  spent={bs.spent}
                  remaining={bs.remaining}
                  projectedSpend={bs.projectedSpend}
                  status={bs.status}
                  lowConfidence={bs.lowConfidence}
                  periodLabel={periodName(bs.period)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Balances Section ──────────────────────────────────────────── */}
        {(positiveBalances.length > 0 || negativeBalances.length > 0) && (
          <div>
            <h2 className="text-2xl font-display font-semibold text-foreground tracking-tight mb-1.5 lg:mb-2">
              Friend Balances
            </h2>
            <div 
              className="bg-surface rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md"
              style={{ padding: '24px' }}
            >
              <div className="flex flex-col gap-2">
                {balances.flatMap((b) => {
                  const items = [];
                  if (b.receivableBalance > 0) {
                    items.push(
                      <div
                        key={`${b.friendProfileId}-rec`}
                        className="p-3.5 flex items-center justify-between gap-4 hover:bg-surface-hover/50 rounded-xl transition-all duration-150 ease-out animate-fadeInFast"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <div className="w-10 h-10 flex items-center justify-center shrink-0 rounded-xl bg-success/10 text-success border border-success/15 shadow-sm">
                            <ArrowDownRight className="w-5 h-5" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {b.friendName}
                            </p>
                            <p className="text-xs font-semibold mt-0.5 text-success">
                              Owes you <span className="font-mono font-bold">+{fmt(b.receivableBalance)}</span>
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDialogConfig({
                              isOpen: true,
                              title: 'Reminder Sent',
                              message: `Sent a reminder nudge to ${b.friendName}`,
                              type: 'alert',
                              onConfirm: () => setDialogConfig(null),
                            });
                          }}
                          className="shrink-0 text-xs px-3 py-1.5 border-border/80 hover:bg-success/5 hover:text-success hover:border-success/30 font-medium"
                        >
                          Remind
                        </Button>
                      </div>
                    );
                  }
                  if (b.payableBalance > 0) {
                    items.push(
                      <div
                        key={`${b.friendProfileId}-pay`}
                        className="p-3.5 flex items-center justify-between gap-4 hover:bg-surface-hover/50 rounded-xl transition-all duration-150 ease-out animate-fadeInFast"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <div className="w-10 h-10 flex items-center justify-center shrink-0 rounded-xl bg-error/10 text-error border border-error/15 shadow-sm">
                            <ArrowUpRight className="w-5 h-5" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {b.friendName}
                            </p>
                            <p className="text-xs font-semibold mt-0.5 text-error">
                              You owe <span className="font-mono font-bold">-{fmt(b.payableBalance)}</span>
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => openTransactionForm('settlement')}
                          className="shrink-0 text-xs px-3 py-1.5 font-medium animate-fadeInFast"
                        >
                          Pay Now
                        </Button>
                      </div>
                    );
                  }
                  return items;
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Visual Empty State ── */}
      {balances.length === 0 && budgetStatuses.length === 0 && !dataLoading && (
        <div 
          className="bg-surface rounded-2xl transition-all duration-200 shadow-sm max-w-2xl mx-auto border border-border/70 animate-slideUpIn text-center"
          style={{ padding: '48px 24px' }}
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Wallet className="w-6 h-6 text-primary" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-display font-semibold text-foreground tracking-tight mb-2">
            Start your saving journey
          </h2>
          <p className="text-muted text-sm leading-relaxed max-w-md mx-auto mb-8">
            No transactions or budgets found. Log your first expense or set up a category budget to start tracking your financial activity and streak progress.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
            <Button
              onClick={() => openTransactionForm('expense')}
              size="md"
              id="add-transaction-empty"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Log First Expense
            </Button>
            <Button
              onClick={() => navigate('/categories')}
              variant="outline"
              size="md"
            >
              <Wallet className="w-4 h-4" aria-hidden="true" />
              Set Up Budgets
            </Button>
          </div>
        </div>
      )}
      {dialogConfig && (
        <ConfirmDialog
          isOpen={dialogConfig.isOpen}
          title={dialogConfig.title}
          message={dialogConfig.message}
          confirmLabel={dialogConfig.confirmLabel}
          cancelLabel={dialogConfig.cancelLabel}
          variant={dialogConfig.variant}
          type={dialogConfig.type}
          onConfirm={dialogConfig.onConfirm}
          onCancel={() => setDialogConfig(null)}
        />
      )}
    </div>
  );
};

export default Dashboard;
