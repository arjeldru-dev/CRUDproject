import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import TransactionForm from '../components/TransactionForm';
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

  // ── Transaction Modal State ───────────────────────────────────────────
  const [showTransactionForm, setShowTransactionForm] = useState(false);

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

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // ── Success Handler ───────────────────────────────────────────────────
  const handleTransactionSuccess = () => {
    fetchDashboardData();
  };

  // ── Utility ───────────────────────────────────────────────────────────
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);

  const featureCards = [
    {
      icon: Wallet,
      title: 'Budget Tracker',
      description: 'Monitor your spending categories and limits in real-time.',
      color: 'from-indigo-500 to-blue-500',
    },
    {
      icon: Users,
      title: 'Split Expenses',
      description: 'Track shared costs and settle debts with friends.',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: TrendingUp,
      title: 'Balance Overview',
      description: 'See who owes you and what you owe at a glance.',
      color: 'from-emerald-500 to-teal-500',
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
    <div>
      {/* ── Welcome Section ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Welcome back
            {user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </h1>
          <p className="text-zinc-400 mt-1">
            Here's an overview of your financial activity.
          </p>
        </div>
        <Button
          onClick={() => setShowTransactionForm(true)}
          size="md"
          id="add-transaction-btn"
        >
          <Plus className="w-4 h-4" />
          Add Transaction
        </Button>
      </div>

      {/* ── Summary Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {/* Total Owed To You */}
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg">
              <ArrowDownRight className="w-5 h-5 text-white" />
            </div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
              Owed to You
            </p>
          </div>
          <p className="text-2xl font-bold text-emerald-400 tracking-tight">
            {dataLoading ? (
              <span className="inline-block h-7 w-24 bg-white/5 rounded animate-pulse" />
            ) : (
              fmt(totalOwed)
            )}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            From {positiveBalances.length} friend
            {positiveBalances.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Total You Owe */}
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center shadow-lg">
              <ArrowUpRight className="w-5 h-5 text-white" />
            </div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
              You Owe
            </p>
          </div>
          <p className="text-2xl font-bold text-red-400 tracking-tight">
            {dataLoading ? (
              <span className="inline-block h-7 w-24 bg-white/5 rounded animate-pulse" />
            ) : (
              fmt(totalOwe)
            )}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            To {negativeBalances.length} friend
            {negativeBalances.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Active Categories */}
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center shadow-lg">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
              Budget Categories
            </p>
          </div>
          <p className="text-2xl font-bold text-white tracking-tight">
            {dataLoading ? (
              <span className="inline-block h-7 w-12 bg-white/5 rounded animate-pulse" />
            ) : (
              budgetStatuses.length
            )}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {budgetStatuses.filter((b) => b.remaining > 0).length} within
            budget
          </p>
        </div>
      </div>

      {/* ── Two-Column Layout for Desktop ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* ── Budget Status Section ────────────────────────────────────── */}
        {budgetStatuses.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-indigo-400" />
              Budget Status — This Month
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {budgetStatuses.map((bs) => {
              const pct =
                bs.monthlyLimit > 0
                  ? Math.min((bs.spent / bs.monthlyLimit) * 100, 100)
                  : 0;
              const isOverBudget = bs.remaining <= 0;

              return (
                <div
                  key={bs.categoryId}
                  className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-white">
                      {bs.categoryName}
                    </p>
                    <p
                      className={`text-xs font-medium ${
                        isOverBudget ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {fmt(bs.remaining)} left
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOverBudget
                          ? 'bg-gradient-to-r from-red-500 to-rose-500'
                          : pct > 75
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                            : 'bg-gradient-to-r from-indigo-500 to-blue-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[10px] text-zinc-500">
                      Spent: {fmt(bs.spent)}
                    </p>
                    <p className="text-[10px] text-zinc-500">
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
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              Friend Balances
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {balances.map((b) => (
              <div
                key={b.friendProfileId}
                className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300 flex items-center gap-4"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shrink-0 ${
                    b.netBalance >= 0
                      ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                      : 'bg-gradient-to-br from-red-500 to-rose-500'
                  }`}
                >
                  {b.netBalance >= 0 ? (
                    <ArrowDownRight className="w-5 h-5 text-white" />
                  ) : (
                    <ArrowUpRight className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">
                    {b.friendName}
                  </p>
                  <p
                    className={`text-xs ${
                      b.netBalance >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {b.netBalance >= 0
                      ? `Owes you ${fmt(b.netBalance)}`
                      : `You owe ${fmt(Math.abs(b.netBalance))}`}
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
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
            {featureCards.map((card) => (
              <div
                key={card.title}
                className="group bg-white/[0.03] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300"
              >
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}
                >
                  <card.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1">
                  {card.title}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {card.description}
                </p>
              </div>
            ))}
          </div>

          <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl">
            <p className="text-zinc-500 text-sm mb-3">
              Start by adding categories and friends, then record your first
              transaction.
            </p>
            <Button
              onClick={() => setShowTransactionForm(true)}
              size="md"
              id="add-transaction-empty"
            >
              <Plus className="w-4 h-4" />
              Record your first transaction
            </Button>
          </div>
        </>
      )}

      {/* ── Transaction Form Modal ────────────────────────────────────── */}
      <TransactionForm
        isOpen={showTransactionForm}
        onClose={() => setShowTransactionForm(false)}
        onSuccess={handleTransactionSuccess}
      />
    </div>
  );
};

export default Dashboard;
