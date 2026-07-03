import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, RefreshCw, Plus, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { getCategoryColor } from './categoryColor';

/* ── Shared Types ──────────────────────────────────────────────────── */

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
}

interface Balance {
  friendProfileId: string;
  friendName: string;
  receivableBalance: number;
  payableBalance: number;
}

interface FinancialOverviewPanelProps {
  budgetStatuses: BudgetStatus[];
  balances: Balance[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onLogTransaction?: () => void;
}

interface DonutSlice {
  categoryId: string;
  categoryName: string;
  spent: number;
  percentage: number;
  color: string;
  angle: number;
}

/* ── Currency Formatter ────────────────────────────────────────────── */

const fmt = (n: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

/* ══════════════════════════════════════════════════════════════════════
   SPENDING TAB VIEW
   ══════════════════════════════════════════════════════════════════════ */

const SpendingTabView: React.FC<{
  budgetStatuses: BudgetStatus[];
  onLogTransaction?: () => void;
  reducedMotion: boolean;
}> = ({ budgetStatuses, onLogTransaction, reducedMotion }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [animateProgress, setAnimateProgress] = useState(0);

  /* ── Donut math ──────────────────────────────────────────────────── */
  const { slices, totalAbsoluteSpent, signedTotalSpent, activeBudgets } = useMemo(() => {
    const active = budgetStatuses.filter((b) => b.spent !== 0);
    const absoluteSum = active.reduce((sum, b) => sum + Math.abs(b.spent), 0);
    const signedSum = active.reduce((sum, b) => sum + b.spent, 0);

    const list: DonutSlice[] = active.map((b, i) => {
      const percentage = absoluteSum > 0 ? Math.abs(b.spent) / absoluteSum : 0;
      const color = getCategoryColor(b.categoryName);
      // Cumulative share of all prior slices → start angle (no outer mutation during render).
      const priorPercentage = absoluteSum > 0
        ? active.slice(0, i).reduce((sum, x) => sum + Math.abs(x.spent), 0) / absoluteSum
        : 0;
      const angle = priorPercentage * 360 - 90;

      return {
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        spent: b.spent,
        percentage,
        color,
        angle,
      };
    });

    return {
      slices: list,
      totalAbsoluteSpent: absoluteSum,
      signedTotalSpent: signedSum,
      activeBudgets: active,
    };
  }, [budgetStatuses]);

  /* ── Entrance animation trigger (setState in timeout callback, not sync in effect) ── */
  useEffect(() => {
    const shouldAnimate = totalAbsoluteSpent > 0;
    const timer = setTimeout(() => setAnimateProgress(shouldAnimate ? 1 : 0), shouldAnimate ? 50 : 0);
    return () => clearTimeout(timer);
  }, [totalAbsoluteSpent]);

  const activeId = hoveredId || selectedId;
  const activeSlice = slices.find((s) => s.categoryId === activeId);

  const handleSliceClick = (categoryId: string) => {
    setSelectedId((prev) => (prev === categoryId ? null : categoryId));
  };

  const handleSliceKeyDown = (e: React.KeyboardEvent, categoryId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSliceClick(categoryId);
    }
  };

  /* ── Center text ─────────────────────────────────────────────────── */
  const displayText = activeSlice
    ? {
        label: activeSlice.categoryName,
        value: fmt(activeSlice.spent),
        subtext: `${(activeSlice.percentage * 100).toFixed(1)}% of total`,
      }
    : {
        label: 'Total spent',
        value: fmt(signedTotalSpent),
        subtext: `${activeBudgets.length} ${activeBudgets.length === 1 ? 'category' : 'categories'}`,
      };

  // Dynamic font sizing based on value length to prevent overflow in the center
  const valueLength = displayText.value.length;
  let valueFontSizeClass = 'text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold';
  if (valueLength > 15) {
    valueFontSizeClass = 'text-[11px] sm:text-xs lg:text-sm font-semibold';
  } else if (valueLength > 12) {
    valueFontSizeClass = 'text-sm sm:text-base lg:text-lg font-bold';
  } else if (valueLength > 9) {
    valueFontSizeClass = 'text-base sm:text-lg lg:text-xl xl:text-2xl font-bold';
  }

  const labelLength = displayText.label.length;
  let labelFontSizeClass = 'text-[10px] sm:text-xs lg:text-sm font-semibold';
  if (labelLength > 15) {
    labelFontSizeClass = 'text-[8px] sm:text-[10px] lg:text-xs font-semibold leading-tight';
  } else if (labelLength > 11) {
    labelFontSizeClass = 'text-[9px] sm:text-[11px] lg:text-xs font-semibold';
  }

  const R = 60;
  const C = 2 * Math.PI * R;

  /* ── Empty state ─────────────────────────────────────────────────── */
  if (totalAbsoluteSpent === 0) {
    return (
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 py-6">
        <div className="relative w-[180px] h-[180px] sm:w-[200px] sm:h-[200px] md:w-[220px] md:h-[220px] lg:w-[240px] lg:h-[240px] xl:w-[260px] xl:h-[260px] 2xl:w-[280px] 2xl:h-[280px] flex-shrink-0">
          <svg viewBox="0 0 160 160" className="w-full h-full" aria-hidden="true">
            <circle
              cx="80"
              cy="80"
              r="60"
              fill="transparent"
              stroke="var(--color-border)"
              strokeWidth="6"
              strokeDasharray="6 4"
              className="opacity-50"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 pointer-events-none">
            <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Spent</span>
            <span className="text-lg font-bold text-foreground mt-0.5">{fmt(0)}</span>
            <span className="text-[9px] text-muted font-medium mt-1">No spend logged</span>
          </div>
        </div>
        <div className="flex-1 text-center md:text-left flex flex-col items-center md:items-start">
          <h4 className="text-sm font-semibold text-foreground">No data available</h4>
          <p className="text-xs text-muted mt-1 leading-relaxed max-w-[240px]">
            Categories will show up here as soon as you start logging transactions under your budgets.
          </p>
          {onLogTransaction && (
            <button
              onClick={onLogTransaction}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-primary text-white rounded-xl btn-press active:scale-[0.97] cursor-pointer hover:bg-primary-hover transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Log first expense
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row lg:flex-col xl:flex-row items-center justify-center gap-6 lg:gap-10 py-2">
      {/* ── SVG Donut (scaled up dynamically) ──────────────────────── */}
      <div className="relative w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] md:w-[240px] md:h-[240px] lg:w-[250px] lg:h-[250px] xl:w-[280px] xl:h-[280px] 2xl:w-[310px] 2xl:h-[310px] flex-shrink-0">
        <svg
          viewBox="0 0 160 160"
          className="w-full h-full"
          role="img"
          aria-label="Spending breakdown chart showing total volume per category"
        >
          {slices.map((slice) => {
            const isActive = activeId === slice.categoryId;
            return (
              <circle
                key={slice.categoryId}
                cx="80"
                cy="80"
                r={R}
                fill="transparent"
                stroke={isActive ? 'var(--color-foreground)' : slice.color}
                strokeWidth={isActive ? 18 : 14}
                strokeDasharray={C}
                strokeDashoffset={C - slice.percentage * C * (reducedMotion ? 1 : animateProgress)}
                transform={`rotate(${slice.angle} 80 80)`}
                onMouseEnter={() => setHoveredId(slice.categoryId)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(slice.categoryId)}
                onBlur={() => setHoveredId(null)}
                onClick={() => handleSliceClick(slice.categoryId)}
                onKeyDown={(e) => handleSliceKeyDown(e, slice.categoryId)}
                tabIndex={0}
                role="button"
                aria-label={`${slice.categoryName}: ${fmt(slice.spent)} (${(slice.percentage * 100).toFixed(0)}%)`}
                className="cursor-pointer focus-visible:outline-none focus-visible:stroke-foreground transition-all"
                style={{
                  transition: reducedMotion
                    ? 'none'
                    : 'stroke-dashoffset 600ms var(--ease-out-expo), stroke-width 180ms var(--ease-out-expo), opacity 180ms var(--ease-out-expo), stroke 180ms var(--ease-out-expo)',
                  opacity: activeId === null || activeId === slice.categoryId ? 1 : 0.45,
                }}
              />
            );
          })}
        </svg>

        {/* Central display */}
        <button
          onClick={() => setSelectedId(null)}
          disabled={!selectedId}
          className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-full btn-press active:scale-[0.97]"
          aria-label={selectedId ? 'Clear category filter and show total spend' : undefined}
        >
          <span className={`${labelFontSizeClass} text-muted uppercase tracking-wider line-clamp-2 px-1 text-center w-full`}>
            {displayText.label}
          </span>
          <span className={`${valueFontSizeClass} font-mono text-foreground mt-1 leading-none truncate max-w-[140px] sm:max-w-[160px] md:max-w-[180px] lg:max-w-[200px] xl:max-w-[220px] 2xl:max-w-[240px]`}>
            {displayText.value}
          </span>
          <span className="text-[9px] md:text-[10px] lg:text-[11px] text-muted font-medium mt-1 truncate max-w-[130px] sm:max-w-[150px] md:max-w-[170px] lg:max-w-[190px] xl:max-w-[210px] 2xl:max-w-[230px]">
            {displayText.subtext}
          </span>
        </button>
      </div>

      {/* ── Inline horizontal bar legend ───────────────────────────── */}
      <div className="flex-1 w-full space-y-1.5 min-w-0" role="list" aria-label="Spending categories">
        {slices.map((slice, i) => {
          const isActive = activeId === slice.categoryId;
          return (
            <button
              key={slice.categoryId}
              role="listitem"
              onClick={() => handleSliceClick(slice.categoryId)}
              onMouseEnter={() => setHoveredId(slice.categoryId)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(slice.categoryId)}
              onBlur={() => setHoveredId(null)}
              className={`flex flex-col gap-2 w-full px-3 py-2.5 rounded-xl text-left cursor-pointer btn-press active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-[background-color,border-color,box-shadow] duration-150 ease-out ${
                isActive
                  ? 'bg-surface-hover border border-border shadow-sm'
                  : 'border border-transparent hover:bg-surface-hover/40'
              }`}
              style={{
                animationDelay: reducedMotion ? '0ms' : `${i * 30}ms`,
              }}
              aria-label={`${slice.categoryName}: ${fmt(slice.spent)} (${(slice.percentage * 100).toFixed(0)}%)`}
            >
              {/* Top Row: Name and Amount */}
              <div className="flex items-center justify-between w-full min-w-0 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Color dot */}
                  <div
                    className="w-2 h-2 rounded-full shrink-0 transition-transform duration-200"
                    style={{
                      backgroundColor: slice.color,
                      transform: isActive ? 'scale(1.2)' : 'none',
                      boxShadow: isActive ? `0 0 0 3px ${slice.color}20` : 'none',
                    }}
                  />
                  {/* Name */}
                  <span className="text-xs font-semibold text-foreground truncate">
                    {slice.categoryName}
                  </span>
                </div>

                {/* Amount + percentage */}
                <div className="flex items-center gap-1.5 shrink-0 text-right">
                  <span className="text-[11px] font-mono font-semibold text-foreground">
                    {fmt(slice.spent)}
                  </span>
                  <span className="text-[10px] font-mono text-muted w-[30px] text-right">
                    {(slice.percentage * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Bottom Row: Full width progress bar */}
              <div className="w-full h-1.5 bg-surface-hover rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(slice.percentage * 100 * (reducedMotion ? 1 : animateProgress)).toFixed(1)}%`,
                    backgroundColor: slice.color,
                    opacity: activeId === null || activeId === slice.categoryId ? 1 : 0.35,
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ──════════════════════════════════════════════════════════════════════
   BALANCE TAB VIEW
   ══════════════════════════════════════════════════════════════════════ */

const BalanceTabView: React.FC<{
  balances: Balance[];
  reducedMotion: boolean;
}> = ({ balances, reducedMotion }) => {
  const [barAnimated, setBarAnimated] = useState(false);

  const positiveBalances = balances.filter((b) => b.receivableBalance > 0);
  const negativeBalances = balances.filter((b) => b.payableBalance > 0);
  const totalOwed = positiveBalances.reduce((s, b) => s + b.receivableBalance, 0);
  const totalOwe = negativeBalances.reduce((s, b) => s + b.payableBalance, 0);
  const netBalance = totalOwed - totalOwe;
  const sumBalances = totalOwed + totalOwe;

  const owePercent = sumBalances > 0 ? (totalOwe / sumBalances) * 100 : 50;
  const owedPercent = sumBalances > 0 ? (totalOwed / sumBalances) * 100 : 50;

  /* ── Net balance display ─────────────────────────────────────── */
  const isNetPositive = netBalance > 0;
  const isNetNegative = netBalance < 0;
  const isEmpty = sumBalances === 0;

  useEffect(() => {
    // Reset (empty) or trigger (non-empty) the width animation. setState happens
    // inside the timeout callback to avoid a synchronous set within the effect body.
    const timer = setTimeout(() => setBarAnimated(!isEmpty), isEmpty ? 0 : 80);
    return () => clearTimeout(timer);
  }, [isEmpty, totalOwe, totalOwed]);

  let badgeText = 'Balanced';
  let badgeColorClass = 'text-muted border-border bg-surface-hover';

  if (isNetPositive) {
    badgeText = 'Net positive';
    badgeColorClass = 'text-success border-success/30 bg-success/5';
  } else if (isNetNegative) {
    badgeText = 'Net negative';
    badgeColorClass = 'text-error border-error/30 bg-error/5';
  } else if (isEmpty) {
    badgeText = 'No outstanding balances';
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2 w-full px-6 lg:px-8">
      {/* ── Tug-of-war bar ─────────────────────────────────────────── */}
      <div className="w-full max-w-[360px] sm:max-w-[420px] md:max-w-[460px]">
        {/* Labels */}
        <div className="flex items-center justify-between mb-2 px-0.5">
          <span className="text-[10px] sm:text-[11px] font-bold text-error uppercase tracking-wider">You owe</span>
          <span className="text-[10px] sm:text-[11px] font-bold text-success uppercase tracking-wider">Owed to you</span>
        </div>

        {/* Bar container */}
        <div className="relative w-full h-4 lg:h-5 xl:h-6 bg-surface-hover rounded-full overflow-hidden border border-border/50">
          {/* Owe (left, red) */}
          <div
            className="absolute inset-y-0 left-0 rounded-l-full"
            style={{
              width: barAnimated ? `${owePercent}%` : '0%',
              backgroundColor: 'var(--color-error)',
              opacity: 0.75,
              transition: reducedMotion ? 'none' : 'width 400ms var(--ease-out-expo)',
            }}
          />
          {/* Owed (right, green) */}
          <div
            className="absolute inset-y-0 right-0 rounded-r-full"
            style={{
              width: barAnimated ? `${owedPercent}%` : '0%',
              backgroundColor: 'var(--color-success)',
              opacity: 0.75,
              transition: reducedMotion ? 'none' : 'width 400ms var(--ease-out-expo) 80ms',
            }}
          />

          {/* Center divider */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-foreground/20 z-10" />
        </div>

        {/* Amounts under bar */}
        <div className="flex items-center justify-between mt-2 px-0.5">
          <span className="text-xs sm:text-sm font-mono font-bold text-error">{fmt(totalOwe)}</span>
          <span className="text-xs sm:text-sm font-mono font-bold text-success">{fmt(totalOwed)}</span>
        </div>
      </div>

      {/* ── Net balance display ─────────────────────────────────────── */}
      <div className="flex flex-col items-center text-center gap-2">
        <span
          className={`px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide border uppercase transition-all duration-300 ${badgeColorClass}`}
        >
          {badgeText}
        </span>
        <span
          className={`text-2xl md:text-3xl font-bold font-mono leading-none ${
            isNetPositive ? 'text-success' : isNetNegative ? 'text-error' : 'text-foreground'
          }`}
        >
          {isNetPositive ? '+' : ''}{fmt(netBalance)}
        </span>
      </div>

      {/* ── Stat sub-counters ──────────────────────────────────────── */}
      <div className="flex w-full items-stretch justify-center gap-3 md:gap-4 mt-1 max-w-[480px] sm:max-w-[560px] md:max-w-[640px] lg:max-w-[700px] xl:max-w-[800px] 2xl:max-w-[960px]">
        {/* Receivables */}
        <div 
          className="flex-1 flex items-start gap-2.5 sm:gap-3 p-3 sm:p-3.5 rounded-xl bg-success/[0.04] border border-success/10 min-w-0"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
            <ArrowDownRight className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-success" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] font-bold text-muted uppercase tracking-wider block leading-none">
              Owed to you
            </span>
            <span className="text-sm sm:text-base lg:text-lg font-bold text-success block leading-none font-mono mt-2 truncate">
              {fmt(totalOwed)}
            </span>
            <span className="text-[9px] text-muted mt-1 block leading-none truncate">
              {positiveBalances.length} {positiveBalances.length === 1 ? 'friend' : 'friends'}
            </span>
          </div>
        </div>

        {/* Payables */}
        <div 
          className="flex-1 flex items-start gap-2.5 sm:gap-3 p-3 sm:p-3.5 rounded-xl bg-error/[0.04] border border-error/10 min-w-0"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-error/10 flex items-center justify-center shrink-0">
            <ArrowUpRight className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-error" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] font-bold text-muted uppercase tracking-wider block leading-none">
              You owe
            </span>
            <span className="text-sm sm:text-base lg:text-lg font-bold text-error block leading-none font-mono mt-2 truncate">
              {fmt(totalOwe)}
            </span>
            <span className="text-[9px] text-muted mt-1 block leading-none truncate">
              {negativeBalances.length} {negativeBalances.length === 1 ? 'friend' : 'friends'}
            </span>
          </div>
        </div>
      </div>

      {isEmpty && (
        <p className="text-xs text-muted mt-2 text-center max-w-[280px] leading-relaxed select-none">
          Add friends and log shared expenses to see your balance overview here.
        </p>
      )}
    </div>
  );
};

/* ──════════════════════════════════════════════════════════════════════
   MAIN PANEL COMPONENT
   ══════════════════════════════════════════════════════════════════════ */

const FinancialOverviewPanelComponent: React.FC<FinancialOverviewPanelProps> = ({
  budgetStatuses,
  balances,
  loading = false,
  error = false,
  onRetry,
  onLogTransaction,
}) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Monitor reduced motion preference (initial value read lazily above)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  /* ── Loading state ───────────────────────────────────────────────── */
  if (loading) {
    return (
      <div 
        className="bg-surface rounded-2xl transition-all duration-200 shadow-sm animate-pulse"
        style={{ padding: '16px 20px' }}
      >
        <div className="mb-2">
          <div className="h-6 bg-surface-hover rounded w-[180px]" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-stretch">
          {/* Left Column Skeleton */}
          <div className="flex flex-col justify-between">
            <h4 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5 select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-surface-hover" />
              <div className="h-3 bg-surface-hover rounded w-28" />
            </h4>
            <div className="flex flex-col md:flex-row lg:flex-col xl:flex-row items-center justify-center gap-6 lg:gap-10 py-2">
              <div className="relative w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] md:w-[240px] md:h-[240px] lg:w-[250px] lg:h-[250px] xl:w-[280px] xl:h-[280px] 2xl:w-[310px] 2xl:h-[310px] flex-shrink-0 bg-surface-hover rounded-full flex items-center justify-center">
                <div className="w-[140px] h-[140px] sm:w-[150px] sm:h-[150px] md:w-[160px] md:h-[160px] lg:w-[170px] lg:h-[170px] xl:w-[190px] xl:h-[190px] 2xl:w-[210px] 2xl:h-[210px] bg-surface rounded-full" />
              </div>
              <div className="flex-1 w-full space-y-1.5 min-w-0">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex flex-col gap-2 w-full px-3 py-2.5">
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="h-3.5 bg-surface-hover rounded w-20" />
                      <div className="h-3 bg-surface-hover rounded w-16" />
                    </div>
                    <div className="w-full h-1.5 bg-surface-hover rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Right Column Skeleton */}
          <div className="flex flex-col justify-between pt-4 lg:pt-0 lg:pl-6 xl:pl-8">
            <h4 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5 select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-surface-hover" />
              <div className="h-3 bg-surface-hover rounded w-20" />
            </h4>
            <div className="flex flex-col items-center justify-center gap-6 py-2">
              <div className="w-full h-4 bg-surface-hover rounded-full" />
              <div className="w-32 h-8 bg-surface-hover rounded-lg animate-pulse" />
              <div className="flex w-full gap-4">
                <div className="flex-1 h-[76px] bg-surface-hover rounded-xl" />
                <div className="flex-1 h-[76px] bg-surface-hover rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Error state ─────────────────────────────────────────────────── */
  if (error) {
    return (
      <div 
        className="bg-surface rounded-2xl transition-all duration-200 shadow-sm flex flex-col items-center justify-center text-center min-h-[300px]"
        style={{ padding: '24px' }}
      >
        <div className="relative w-[160px] h-[160px] flex-shrink-0 flex items-center justify-center mb-4">
          <svg viewBox="0 0 160 160" className="w-full h-full absolute inset-0" aria-hidden="true">
            <circle
              cx="80"
              cy="80"
              r="60"
              fill="transparent"
              stroke="var(--color-error)"
              strokeWidth="6"
              className="opacity-20"
            />
          </svg>
          <AlertCircle className="w-10 h-10 text-error animate-pulse" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Could not load financial data</h3>
        <p className="text-sm text-muted mt-1 max-w-[280px]">
          Failed to load your spending and balance information.
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-border rounded-xl btn-press active:scale-[0.97] cursor-pointer hover:bg-surface-hover transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div 
      className="bg-surface rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md"
      style={{ padding: '16px 20px' }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="mb-2">
        <h3 className="text-lg font-display font-semibold text-foreground">Financial Overview</h3>
      </div>

      {/* ── Two-Column Layout ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-stretch">
        {/* Left Column: Spending Breakdown */}
        <div className="flex flex-col justify-between">
          <h4 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            Spending Breakdown
          </h4>
          <SpendingTabView
            budgetStatuses={budgetStatuses}
            onLogTransaction={onLogTransaction}
            reducedMotion={prefersReducedMotion}
          />
        </div>

        {/* Right Column: Net Balance */}
        <div className="flex flex-col justify-between pt-4 lg:pt-0 lg:pl-6 xl:pl-8">
          <h4 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Net Balance
          </h4>
          <BalanceTabView
            balances={balances}
            reducedMotion={prefersReducedMotion}
          />
        </div>
      </div>
    </div>
  );
};

/* ── Memoized export ─────────────────────────────────────────────── */
export const FinancialOverviewPanel = React.memo(FinancialOverviewPanelComponent, (prevProps, nextProps) => {
  if (prevProps.loading !== nextProps.loading) return false;
  if (prevProps.error !== nextProps.error) return false;
  if (prevProps.budgetStatuses.length !== nextProps.budgetStatuses.length) return false;
  if (prevProps.balances.length !== nextProps.balances.length) return false;

  const budgetsSame = prevProps.budgetStatuses.every((bs, idx) => {
    const nextBs = nextProps.budgetStatuses[idx];
    return (
      bs.categoryId === nextBs.categoryId &&
      bs.categoryName === nextBs.categoryName &&
      bs.spent === nextBs.spent &&
      bs.remaining === nextBs.remaining
    );
  });

  if (!budgetsSame) return false;

  const balancesSame = prevProps.balances.every((b, idx) => {
    const nextB = nextProps.balances[idx];
    return (
      b.friendProfileId === nextB.friendProfileId &&
      b.receivableBalance === nextB.receivableBalance &&
      b.payableBalance === nextB.payableBalance
    );
  });

  return balancesSame;
});
