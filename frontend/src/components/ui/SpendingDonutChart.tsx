import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, RefreshCw, Plus } from 'lucide-react';

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

interface SpendingDonutChartProps {
  budgetStatuses: BudgetStatus[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onLogTransaction?: () => void;
}

/**
 * Resolves category colors dynamically using design tokens and high-contrast
 * light/dark mode compliant colors to prevent category visualization collisions.
 */
export const getCategoryColor = (name: string): string => {
  const norm = name.toLowerCase().trim();

  // Neutral, high-contrast category mappings (decoupled from semantic status colors like error/success)
  if (norm.includes('food') || norm.includes('dining') || norm.includes('groceries')) {
    return '#f43f5e'; // Pleasant Rose
  }
  if (norm.includes('transport') || norm.includes('travel') || norm.includes('commute')) {
    return 'var(--color-primary)'; // Sky Blue
  }
  if (norm.includes('rent') || norm.includes('housing')) {
    return 'var(--color-secondary)'; // Accent Indigo
  }
  if (norm.includes('utilities') || norm.includes('bills')) {
    return '#0d9488'; // Deep Teal
  }
  if (norm.includes('entertainment') || norm.includes('leisure') || norm.includes('recreation')) {
    return '#8b5cf6'; // Violet/Purple
  }

  // Non-colliding fallbacks that are clean and visible in both light & dark themes
  if (norm.includes('shopping') || norm.includes('personal') || norm.includes('clothing')) {
    return '#ec4899'; // Pink
  }
  if (norm.includes('health') || norm.includes('fitness') || norm.includes('medical')) {
    return '#10b981'; // Emerald/Green
  }
  if (norm.includes('education') || norm.includes('books')) {
    return '#06b6d4'; // Cyan
  }

  // Deterministic HSL generator with calibrated saturation/lightness (prevents colors blending together)
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hueIndex = Math.abs(hash) % 12;
  const hue = hueIndex * 30; // 0, 30, 60, ..., 330 degrees
  return `hsl(${hue}, 60%, 50%)`;
};

const SpendingDonutChartComponent: React.FC<SpendingDonutChartProps> = ({
  budgetStatuses,
  loading = false,
  error = false,
  onRetry,
  onLogTransaction,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [animateProgress, setAnimateProgress] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Crossfade / scale text states to avoid jarring jumps when toggling active slice details
  const [transitioning, setTransitioning] = useState(false);
  const [tempDisplayText, setTempDisplayText] = useState({
    label: 'Total Spent',
    value: '₱0.00',
    subtext: '0 categories',
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  // Monitor system media preference for reduced motion animations (A11y)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  // Performance Optimization: Memoize the absolute summation and segment math
  const { slices, totalAbsoluteSpent, signedTotalSpent, activeBudgets } = useMemo(() => {
    const active = budgetStatuses.filter((b) => b.spent !== 0);
    const absoluteSum = active.reduce((sum, b) => sum + Math.abs(b.spent), 0);
    const signedSum = active.reduce((sum, b) => sum + b.spent, 0);

    let accumulatedPercentage = 0;
    const list = active.map((b) => {
      const percentage = absoluteSum > 0 ? Math.abs(b.spent) / absoluteSum : 0;
      const color = getCategoryColor(b.categoryName);
      const angle = accumulatedPercentage * 360 - 90;
      accumulatedPercentage += percentage;

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

  // Trigger entrance transition on next paint cycle
  useEffect(() => {
    if (!loading && !error && totalAbsoluteSpent > 0) {
      const timer = setTimeout(() => {
        setAnimateProgress(1);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setAnimateProgress(0);
    }
  }, [loading, error, totalAbsoluteSpent]);

  // Handle active slice state priority
  const activeId = hoveredId || selectedId;
  const activeSlice = slices.find((s) => s.categoryId === activeId);

  // Central panel information displays
  const displayText = activeSlice
    ? {
        label: activeSlice.categoryName,
        value: fmt(activeSlice.spent),
        subtext: `${(activeSlice.percentage * 100).toFixed(1)}% of volume`,
      }
    : {
        label: 'Total Spent',
        value: fmt(signedTotalSpent),
        subtext: `${activeBudgets.length} ${activeBudgets.length === 1 ? 'category' : 'categories'}`,
      };

  // Perform a smooth blur/opacity crossfade when the text details update
  useEffect(() => {
    if (prefersReducedMotion) {
      setTempDisplayText(displayText);
      return;
    }
    setTransitioning(true);
    const timer = setTimeout(() => {
      setTempDisplayText(displayText);
      setTransitioning(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [displayText.label, displayText.value, displayText.subtext, prefersReducedMotion]);

  // Toggle selection states cleanly (solves mobile sticky mouseleave events)
  const handleSliceClick = (categoryId: string) => {
    setSelectedId((prev) => (prev === categoryId ? null : categoryId));
  };

  // Key press handlers to sync focus states for keyboard users (A11y accessibility)
  const handleSliceKeyDown = (e: React.KeyboardEvent, categoryId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSliceClick(categoryId);
    }
  };

  // Dynamic font sizing based on content length to prevent layout clipping/truncation inside SVG center (Harden)
  // Optimizes size constraints for responsive container upscaling
  const valueLength = tempDisplayText.value.length;
  let valueFontSizeClass = 'text-xl lg:text-2xl xl:text-3xl font-bold';
  if (valueLength > 15) {
    valueFontSizeClass = 'text-[11px] lg:text-xs font-semibold';
  } else if (valueLength > 12) {
    valueFontSizeClass = 'text-sm lg:text-base font-bold';
  } else if (valueLength > 9) {
    valueFontSizeClass = 'text-base lg:text-lg xl:text-xl font-bold';
  }

  // Set line-clamp and variable text sizes to handle extremely long custom category names
  const labelLength = tempDisplayText.label.length;
  let labelFontSizeClass = 'text-[10px] lg:text-[11px] xl:text-xs font-semibold';
  if (labelLength > 15) {
    labelFontSizeClass = 'text-[8px] lg:text-[9px] font-semibold leading-tight';
  } else if (labelLength > 11) {
    labelFontSizeClass = 'text-[9px] lg:text-[10px] font-semibold';
  }

  // SVG parameters
  const R = 60;
  const C = 2 * Math.PI * R; // ~376.99

  // Loading state
  if (loading) {
    return (
      <div className="card p-6 md:p-8 animate-pulse flex flex-col h-full justify-between">
        <div>
          <div className="h-6 bg-surface-hover rounded w-1/3 mb-6" />
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 my-auto py-4">
            <div className="relative w-[160px] h-[160px] lg:w-[200px] lg:h-[200px] flex-shrink-0 bg-surface-hover rounded-full flex items-center justify-center">
              <div className="w-[110px] h-[110px] bg-surface rounded-full" />
            </div>
            <div className="flex-1 w-full space-y-3">
              <div className="h-5 bg-surface-hover rounded w-3/4" />
              <div className="h-5 bg-surface-hover rounded w-1/2" />
              <div className="h-5 bg-surface-hover rounded w-2/3" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state (Harden: Includes retry trigger)
  if (error) {
    return (
      <div className="card p-6 md:p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
        <div className="relative w-[160px] h-[160px] lg:w-[200px] lg:h-[200px] flex-shrink-0 flex items-center justify-center mb-4">
          <svg viewBox="0 0 160 160" className="w-full h-full absolute inset-0">
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
          <AlertCircle className="w-10 h-10 text-error animate-pulse" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Visualization Failed</h3>
        <p className="text-sm text-muted mt-1 max-w-[240px]">Failed to load category spending distribution.</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-border rounded-xl btn-press active:scale-[0.97] cursor-pointer hover:bg-surface-hover transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Again
          </button>
        )}
      </div>
    );
  }

  // Empty state (Harden: Includes dynamic logging action)
  if (totalAbsoluteSpent === 0) {
    return (
      <div className="card p-6 md:p-8 flex flex-col h-full justify-between">
        <h3 className="text-lg font-display font-semibold text-foreground mb-4">Spending Breakdown</h3>
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 my-auto py-4">
          <div className="relative w-[160px] h-[160px] lg:w-[200px] lg:h-[200px] flex-shrink-0">
            <svg viewBox="0 0 160 160" className="w-full h-full">
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
                <Plus className="w-3.5 h-3.5" />
                Log First Expense
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6 md:p-8 flex flex-col h-full justify-between">
      <h3 className="text-lg font-display font-semibold text-foreground mb-6">Spending Breakdown</h3>

      <div className="flex flex-col md:flex-row items-center justify-center gap-8 my-auto py-4">
        {/* SVG Donut */}
        <div className="relative w-[160px] h-[160px] lg:w-[200px] lg:h-[200px] flex-shrink-0">
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
                  stroke={slice.color}
                  strokeWidth={isActive ? 18 : 14}
                  strokeDasharray={C}
                  strokeDashoffset={C - slice.percentage * C * (prefersReducedMotion ? 1 : animateProgress)}
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
                  className="cursor-pointer focus:outline-none"
                  style={{
                    transition: prefersReducedMotion
                      ? 'none'
                      : 'stroke-dashoffset 600ms var(--ease-out-expo), stroke-width 180ms var(--ease-out-expo), opacity 180ms var(--ease-out-expo)',
                    opacity: (activeId === null || activeId === slice.categoryId) ? 1 : 0.45,
                  }}
                />
              );
            })}
          </svg>

          {/* Central Panel button for easy dismissal of filter states on tap/click */}
          <button
            onClick={() => setSelectedId(null)}
            disabled={!selectedId}
            className="absolute inset-0 flex flex-col items-center justify-center text-center p-3 select-none focus:outline-none btn-press active:scale-[0.97]"
            style={{
              transition: 'background-color 160ms var(--ease-out-expo), transform 160ms var(--ease-out-expo)',
            }}
            aria-label={selectedId ? 'Clear category filter and show total spend' : undefined}
          >
            <div
              className={`flex flex-col items-center justify-center w-full transition-all duration-120 ${
                transitioning ? 'opacity-0 scale-[0.96] blur-[0.5px]' : 'opacity-100 scale-100 blur-0'
              }`}
              style={{
                transitionTimingFunction: 'var(--ease-out-expo)',
              }}
            >
              {/* Clamps names to 2-lines to prevent horizontal bounds breaking (Harden) */}
              <span className={`${labelFontSizeClass} text-muted uppercase tracking-wider line-clamp-2 px-1 text-center w-full`}>
                {tempDisplayText.label}
              </span>
              <span className={`${valueFontSizeClass} font-mono text-foreground mt-1 leading-none truncate max-w-[125px] lg:max-w-[160px]`}>
                {tempDisplayText.value}
              </span>
              <span className="text-[9px] md:text-[10px] text-muted font-medium mt-1 truncate max-w-[115px] lg:max-w-[150px]">
                {tempDisplayText.subtext}
              </span>
            </div>
          </button>
        </div>

        {/* Legend flat list view with cascade entry stagger animations */}
        <div
          role="list"
          aria-label="Spending breakdown categories"
          className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] lg:max-h-[200px] overflow-y-auto pr-1"
        >
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
                className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-left w-full cursor-pointer btn-press active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary animate-slideUpIn ${
                  isActive
                    ? 'bg-surface-hover border-border shadow-sm'
                    : 'border-transparent hover:bg-surface-hover/30'
                }`}
                style={{
                  animationDelay: prefersReducedMotion ? '0ms' : `${i * 30}ms`,
                  transition: 'background-color 160ms var(--ease-out-expo), border-color 160ms var(--ease-out-expo), transform 160ms var(--ease-out-expo)',
                }}
                aria-label={`${slice.categoryName}: ${fmt(slice.spent)} (${(slice.percentage * 100).toFixed(0)}%)`}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0 transition-transform duration-200"
                  style={{
                    backgroundColor: slice.color,
                    transform: isActive ? 'scale(1.25)' : 'none',
                    boxShadow: isActive ? `0 0 0 4px ${slice.color}20` : 'none',
                  }}
                />
                <div className="min-w-0 flex-1 flex flex-col">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {slice.categoryName}
                  </span>
                  <span className="text-[10px] text-muted font-medium font-mono">
                    {fmt(slice.spent)} ({(slice.percentage * 100).toFixed(0)}%)
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Performance Optimization: Wrap the component in React.memo and write a custom comparison
// to fully bypass re-renders unless loading status or budget values actually change.
export const SpendingDonutChart = React.memo(SpendingDonutChartComponent, (prevProps, nextProps) => {
  if (prevProps.loading !== nextProps.loading) return false;
  if (prevProps.error !== nextProps.error) return false;
  if (prevProps.budgetStatuses.length !== nextProps.budgetStatuses.length) return false;

  return prevProps.budgetStatuses.every((bs, idx) => {
    const nextBs = nextProps.budgetStatuses[idx];
    return (
      bs.categoryId === nextBs.categoryId &&
      bs.categoryName === nextBs.categoryName &&
      bs.spent === nextBs.spent &&
      bs.remaining === nextBs.remaining
    );
  });
});
