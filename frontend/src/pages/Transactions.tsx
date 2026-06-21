import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../store/uiStore';
import { useFeedStore } from '../store/feedStore';
import {
  Handshake,
  Wallet,
  Lightbulb,
  ArrowRight,
  ShoppingBag,
  AlertCircle,
} from 'lucide-react';

/**
 * Transactions Page — Redesigned according to Stitch specifications.
 * Provides entry-points for recording expenses, settlements, and top-ups,
 * displays real-time recent transactions, and presents premium promo sections.
 */
const Transactions: React.FC = () => {
  const navigate = useNavigate();
  const { openTransactionForm } = useUiStore();
  const { posts, fetchFeed, isLoading, error } = useFeedStore();
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  // Load feed on mount to populate recent activities
  useEffect(() => {
    fetchFeed(true);
  }, [fetchFeed]);

  // Filter recent activities to get the top 3 transaction events (expense and settlement)
  const recentTransactions = useMemo(() => {
    return posts
      .filter((post) => post.type === 'EXPENSE_ADDED' || post.type === 'SETTLEMENT_COMPLETED')
      .slice(0, 3);
  }, [posts]);

  // Currency Formatter matching dashboard (PHP)
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);  return (
    <div className="animate-fadeInFast w-full transactions-page">
      {/* ── Page Header ────────────────────────────────────────── */}
      <header className="mb-2">
        <h1 className="font-display text-fluid-h1 font-semibold text-foreground tracking-tight">
          Transactions
        </h1>
        <p className="font-sans text-base text-muted mt-1">
          Record expenses, split costs, and settle debts
        </p>
      </header>

      {/* ── Action Cards Grid ────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 transactions-action-grid">
        {/* Card 1: Log an Expense */}
        <button
          onClick={() => openTransactionForm('expense')}
          id="quick-expense"
          className="group md:col-span-2 bg-surface rounded-2xl text-left flex flex-col items-start shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 btn-press cursor-pointer"
          style={{ padding: '24px' }}
        >
          <div className="flex items-center gap-3.5 mb-4 w-full">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <h3 className="font-display text-xl font-semibold text-foreground leading-none">
              Log an Expense
            </h3>
          </div>
          <p className="text-sm text-muted mb-4 flex-grow leading-relaxed">
            Record a purchase, assign it to a category, and optionally split the cost with friends or ghosts.
          </p>
          <span className="flex items-center gap-1.5 font-semibold text-sm text-primary mt-auto">
            Get started
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </span>
        </button>

        {/* Card 2: Settle Balances */}
        <button
          onClick={() => openTransactionForm('settlement')}
          id="quick-settlement"
          className="group bg-surface rounded-2xl text-left flex flex-col items-start shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 btn-press cursor-pointer"
          style={{ padding: '24px' }}
        >
          <div className="flex items-center gap-3.5 mb-4 w-full">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center text-success shrink-0">
              <Handshake className="w-5 h-5" />
            </div>
            <h3 className="font-display text-xl font-semibold text-foreground leading-none">
              Settle Balances
            </h3>
          </div>
          <p className="font-sans text-sm text-muted mb-6 flex-grow leading-relaxed">
            Record a payment to or from a friend to reduce an outstanding balance quickly.
          </p>
          <span className="flex items-center gap-1.5 font-semibold text-sm text-success mt-auto">
            Settle now
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </span>
        </button>

        {/* Card 3: Add Funds */}
        <button
          onClick={() => openTransactionForm('topup')}
          id="quick-topup"
          className="group bg-surface rounded-2xl text-left flex flex-col items-start shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 btn-press cursor-pointer"
          style={{ padding: '24px' }}
        >
          <div className="flex items-center gap-3.5 mb-4 w-full">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center text-warning shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <h3 className="font-display text-xl font-semibold text-foreground leading-none">
              Add Funds
            </h3>
          </div>
          <p className="font-sans text-sm text-muted mb-6 flex-grow leading-relaxed">
            Manually top-up a budget category to replenish your available spending limit.
          </p>
          <span className="flex items-center gap-1.5 font-semibold text-sm text-warning mt-auto">
            Top up
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </span>
        </button>
      </section>

      {/* ── Info Note Banner ─────────────────────────────────────────── */}
      <section className="bg-warning/5 rounded-2xl flex items-center gap-4 animate-slideDownIn transactions-note-banner" style={{ padding: '24px' }}>
        <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center text-warning shrink-0">
          <Lightbulb className="w-5 h-5 animate-fadeInFast" fill="currentColor" />
        </div>
        <p className="font-sans text-sm text-muted leading-relaxed font-medium">
          All transactions create atomic dual-entry ledger records. Your balances and budget limits update automatically.
        </p>
      </section>

      {/* ── Bento Grid: Recent Activity & Pro Analytics ────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-8 transactions-bento-grid">
        {/* Recent Activity (Left Col - Span 8) */}
        <div className="md:col-span-8 bg-surface rounded-2xl shadow-sm flex flex-col" style={{ padding: '24px' }}>
          <h4 className="font-display text-lg font-semibold text-foreground mb-6">
            Recent Activity
          </h4>

          {error ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 gap-4 text-center border border-error/20 bg-error/5 rounded-2xl animate-fadeIn">
              <AlertCircle className="w-8 h-8 text-error" />
              <div>
                <p className="text-sm font-semibold text-foreground font-display">Failed to load transactions</p>
                <p className="text-xs text-muted mt-1 max-w-xs mx-auto leading-relaxed">{error}</p>
              </div>
              <button
                onClick={() => fetchFeed(true)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-error/10 text-error border border-error/20 hover:bg-error/20 active:scale-95 transition-all duration-100 cursor-pointer"
              >
                Retry loading
              </button>
            </div>
          ) : isLoading && recentTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full" style={{ animation: 'spin 0.6s linear infinite' }}></div>
              <p className="text-sm text-muted font-medium font-sans animate-pulse">Loading transaction logs...</p>
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="text-center text-muted text-sm font-sans bg-background/30 rounded-2xl flex flex-col items-center justify-center gap-3" style={{ padding: '40px' }}>
              <span>No recent transactions recorded.</span>
              <button
                onClick={() => openTransactionForm('expense')}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 active:scale-95 transition-all duration-100 cursor-pointer"
              >
                Record your first expense
              </button>
            </div>
          ) : (
            <div className="flex flex-col flex-1 justify-between">
              <div className="flex flex-col">
                {recentTransactions.map((post, index) => {
                  const isExpense = post.type === 'EXPENSE_ADDED';
                  const dateString = new Date(post.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  });
                  const isExpanded = expandedPostId === post.id;
                  
                  return (
                    <div
                      key={post.id}
                      className="flex flex-col transition-all duration-200 animate-stagger-card min-w-0 w-full overflow-hidden border-b border-border-subtle/50 last:border-b-0"
                      style={{ animationDelay: `${index * 60}ms` }}
                    >
                      <button
                        onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                        className="w-full text-left flex items-center justify-between gap-3 cursor-pointer p-4 hover:bg-surface-hover/50 active:bg-surface-hover/80 focus-visible:bg-surface-hover focus-visible:outline-none transition-colors duration-150"
                        aria-expanded={isExpanded}
                        aria-controls={`activity-details-${post.id}`}
                      >
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isExpense ? 'bg-error/10 text-error' : 'bg-success/10 text-success'}`}>
                            {isExpense ? <ShoppingBag className="w-5 h-5" /> : <Handshake className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-sans font-semibold text-sm text-foreground truncate">
                              {post.content.description || (isExpense ? 'Expense logged' : 'Settlement Completed')}
                            </p>
                            <div className="flex flex-row items-center justify-between sm:justify-start gap-2 mt-0.5">
                              <p className="font-sans text-xs text-muted truncate flex-1 min-w-0">
                                {isExpense 
                                  ? `Category: ${post.content.categoryName || 'General'} • ${dateString}`
                                  : `Settled with ${post.content.friendName || 'Friend'} • ${dateString}`}
                              </p>
                              <span className={`block sm:hidden font-mono font-bold text-sm tracking-tight shrink-0 ${isExpense ? 'text-error' : 'text-success'}`}>
                                {isExpense ? '-' : '+'}{fmt(post.content.amount || 0)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span className={`hidden sm:block font-mono font-bold text-sm sm:text-base tracking-tight shrink-0 ${isExpense ? 'text-error' : 'text-success'}`}>
                          {isExpense ? '-' : '+'}{fmt(post.content.amount || 0)}
                        </span>
                      </button>
                      {isExpanded && (
                        <div 
                          id={`activity-details-${post.id}`}
                          className="px-4 pb-4 pt-1 border-t border-border-subtle/50 animate-slideDownIn"
                        >
                          {/* Receipt Details Separator */}
                          <div className="border-t border-dashed border-border-subtle my-2" />
                          <div className="space-y-3 mt-3 text-xs text-muted">
                            {/* Full Description Block */}
                            <div className="p-1">
                              <span className="text-[10px] uppercase font-bold tracking-wider text-muted block mb-1">
                                Full Description
                              </span>
                              <p className="font-sans text-sm font-semibold text-foreground leading-relaxed break-words whitespace-pre-wrap">
                                {post.content.description || (isExpense ? 'Expense logged' : 'Settlement Completed')}
                              </p>
                            </div>
                            {/* Metadata Grid */}
                            <div className="grid grid-cols-2 gap-3 p-1">
                              <div>
                                <span className="text-[9px] uppercase font-bold tracking-wider text-muted block">Logged By</span>
                                <span className="text-sm font-medium text-foreground mt-0.5 block truncate">
                                  {post.user.displayName || post.user.username || 'System'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[9px] uppercase font-bold tracking-wider text-muted block">Date & Time</span>
                                <span className="text-sm font-medium text-foreground mt-0.5 block">
                                  {new Date(post.createdAt).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                              {isExpense && (
                                <div>
                                  <span className="text-[9px] uppercase font-bold tracking-wider text-muted block">Category</span>
                                  <span className="text-sm font-medium text-foreground mt-0.5 block truncate">
                                    {post.content.categoryName || 'General'}
                                  </span>
                                </div>
                              )}
                              {!isExpense && post.content.friendName && (
                                <div>
                                  <span className="text-[9px] uppercase font-bold tracking-wider text-muted block">Friend</span>
                                  <span className="text-sm font-medium text-foreground mt-0.5 block truncate">
                                    {post.content.friendName}
                                  </span>
                                </div>
                              )}
                              <div>
                                <span className="text-[9px] uppercase font-bold tracking-wider text-muted block">Full Amount</span>
                                <span className={`text-sm font-bold mt-0.5 block font-mono ${isExpense ? 'text-error' : 'text-success'}`}>
                                  {isExpense ? '-' : '+'}{fmt(post.content.amount || 0)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                <p className="text-xs text-muted font-semibold">Showing 3 most recent activities</p>
                <button
                  onClick={() => navigate('/feed')}
                  className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-1.5 cursor-pointer transition-colors duration-150 group"
                >
                  View Full History
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pro Analytics Promo (Right Col - Span 4) */}
        <div className="md:col-span-4 bg-surface rounded-2xl shadow-sm flex flex-col justify-between relative overflow-hidden group" style={{ padding: '24px' }}>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-display text-base font-semibold text-foreground">
                Pro Analytics
              </h4>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                PRO
              </span>
            </div>
            <p className="text-sm text-muted leading-relaxed mb-6">
              See exactly where your group spending goes every month with advanced insights.
            </p>

            {/* Abstract Mock Mini Chart (Visually stunning overlay) */}
            <div className="space-y-3 bg-background/50 rounded-xl select-none filter blur-[1px] opacity-60" style={{ padding: '16px' }}>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono font-semibold text-muted">
                  <span>Food & Dining</span>
                  <span>45%</span>
                </div>
                <div className="w-full h-2 bg-border-subtle rounded-full overflow-hidden">
                  <div className="h-full bg-secondary rounded-full" style={{ width: '45%' }} />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono font-semibold text-muted">
                  <span>Travel & Transit</span>
                  <span>30%</span>
                </div>
                <div className="w-full h-2 bg-border-subtle rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: '30%' }} />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono font-semibold text-muted">
                  <span>Utilities</span>
                  <span>25%</span>
                </div>
                <div className="w-full h-2 bg-border-subtle rounded-full overflow-hidden">
                  <div className="h-full bg-success rounded-full" style={{ width: '25%' }} />
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between relative z-10">
            <p className="text-xs font-semibold text-muted">Coming soon</p>
            <div className="w-6 h-6 rounded-full bg-muted/10 flex items-center justify-center text-muted">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Transactions;
