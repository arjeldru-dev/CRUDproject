import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

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
}

interface DonutSlice {
  categoryId: string;
  categoryName: string;
  spent: number;
  percentage: number;
  color: string;
  angle: number;
}

const PREDEFINED_COLORS: Record<string, string> = {
  food: 'var(--color-accent-secondary)', // Warm Ivory / Orange
  dining: 'var(--color-accent-secondary)',
  groceries: 'var(--color-accent-secondary)',
  transport: 'var(--color-primary)', // Accent Primary / Indigo-Blue
  travel: 'var(--color-primary)',
  commute: 'var(--color-primary)',
  rent: 'var(--color-success)', // Success / Green
  housing: 'var(--color-success)',
  utilities: 'var(--color-warning)', // Warning / Amber
  bills: 'var(--color-warning)',
  shopping: '#8B5CF6', // Violet
  entertainment: 'var(--color-error)', // Error / Coral
  leisure: 'var(--color-error)',
  health: '#10B981', // Emerald
  fitness: '#10B981',
  education: '#EC4899', // Pink
  personal: '#EC4899',
};

const getCategoryColor = (name: string): string => {
  const norm = name.toLowerCase().trim();
  if (PREDEFINED_COLORS[norm]) return PREDEFINED_COLORS[norm];

  for (const key of Object.keys(PREDEFINED_COLORS)) {
    if (norm.includes(key)) return PREDEFINED_COLORS[key];
  }

  const BEAUTIFUL_COLORS = [
    '#A855F7', // purple-500
    '#06B6D4', // cyan-500
    '#F43F5E', // rose-500
    '#14B8A6', // teal-500
    '#F59E0B', // amber-500
    '#6366F1', // indigo-500
    '#84CC16', // lime-500
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % BEAUTIFUL_COLORS.length;
  return BEAUTIFUL_COLORS[index];
};

export const SpendingDonutChart: React.FC<SpendingDonutChartProps> = ({
  budgetStatuses,
  loading = false,
  error = false,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [animateProgress, setAnimateProgress] = useState(0);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  // Filter out items with no spending (spent !== 0 to support negative spending i.e. refunds/surpluses)
  const activeBudgets = budgetStatuses.filter((b) => b.spent !== 0);
  const totalAbsoluteSpent = activeBudgets.reduce((sum, b) => sum + Math.abs(b.spent), 0);
  const signedTotalSpent = activeBudgets.reduce((sum, b) => sum + b.spent, 0);

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

  // Compute slices using absolute values for geometry
  let accumulatedPercentage = 0;
  const slices: DonutSlice[] = activeBudgets.map((b) => {
    const percentage = totalAbsoluteSpent > 0 ? Math.abs(b.spent) / totalAbsoluteSpent : 0;
    const color = getCategoryColor(b.categoryName);
    const angle = accumulatedPercentage * 360 - 90;
    accumulatedPercentage += percentage;

    return {
      categoryId: b.categoryId,
      categoryName: b.categoryName,
      spent: b.spent, // Keep the signed spent value for visual display
      percentage,
      color,
      angle,
    };
  });

  const activeSlice = slices.find((s) => s.categoryId === hoveredId);

  // Center display values
  const displayText = activeSlice
    ? {
        label: activeSlice.categoryName,
        value: fmt(activeSlice.spent),
        subtext: `${(activeSlice.percentage * 100).toFixed(1)}% of total volume`,
      }
    : {
        label: 'Total Spent',
        value: fmt(signedTotalSpent),
        subtext: `${activeBudgets.length} ${activeBudgets.length === 1 ? 'category' : 'categories'}`,
      };

  // SVG parameters
  const R = 60;
  const C = 2 * Math.PI * R; // ~376.99

  // Loading state
  if (loading) {
    return (
      <div className="container-card p-6 md:p-8 animate-pulse flex flex-col h-full justify-between">
        <div>
          <div className="h-6 bg-surface-hover rounded w-1/3 mb-6" />
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 my-auto py-4">
            <div className="relative w-[160px] h-[160px] flex-shrink-0 bg-surface-hover rounded-full flex items-center justify-center">
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

  // Error state
  if (error) {
    return (
      <div className="container-card p-6 md:p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
        <div className="relative w-[160px] h-[160px] flex-shrink-0 flex items-center justify-center mb-4">
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
          <AlertCircle className="w-10 h-10 text-error" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Visualization Failed</h3>
        <p className="text-sm text-muted mt-1">Failed to load category spending distribution.</p>
      </div>
    );
  }

  // Empty state
  if (totalAbsoluteSpent === 0) {
    return (
      <div className="container-card p-6 md:p-8 flex flex-col h-full justify-between">
        <h3 className="text-lg font-display font-semibold text-foreground mb-4">Spending Breakdown</h3>
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 my-auto py-4">
          <div className="relative w-[160px] h-[160px] flex-shrink-0">
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
          <div className="flex-1 text-center md:text-left">
            <h4 className="text-sm font-semibold text-foreground">No data available</h4>
            <p className="text-xs text-muted mt-1 leading-relaxed max-w-[240px]">
              Categories will show up here as soon as you start logging transactions under your budgets.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-card p-6 md:p-8 flex flex-col h-full justify-between">
      <h3 className="text-lg font-display font-semibold text-foreground mb-6">Spending Breakdown</h3>
      
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 my-auto py-4">
        {/* SVG Donut */}
        <div className="relative w-[160px] h-[160px] flex-shrink-0">
          <svg viewBox="0 0 160 160" className="w-full h-full">
            {slices.map((slice) => {
              const isHovered = hoveredId === slice.categoryId;
              return (
                <circle
                  key={slice.categoryId}
                  cx="80"
                  cy="80"
                  r={R}
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth={isHovered ? 18 : 14}
                  strokeDasharray={`${slice.percentage * C * animateProgress} ${C}`}
                  strokeDashoffset={0}
                  transform={`rotate(${slice.angle} 80 80)`}
                  onMouseEnter={() => setHoveredId(slice.categoryId)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="transition-all duration-300 origin-center cursor-pointer"
                  style={{
                    filter: isHovered ? `drop-shadow(0 0 6px ${slice.color}44)` : 'none',
                  }}
                />
              );
            })}
          </svg>
          
          {/* Central Panel */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-4 select-none">
            <span className="text-[10px] font-semibold text-muted uppercase tracking-wider truncate max-w-[110px]">
              {displayText.label}
            </span>
            <span className="text-lg font-bold text-foreground mt-0.5 leading-none truncate max-w-[120px]">
              {displayText.value}
            </span>
            <span className="text-[9px] text-muted font-medium mt-1 truncate max-w-[110px]">
              {displayText.subtext}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[160px] overflow-y-auto pr-1">
          {slices.map((slice) => {
            const isHovered = hoveredId === slice.categoryId;
            return (
              <div
                key={slice.categoryId}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl border border-transparent transition-all cursor-pointer ${
                  isHovered ? 'bg-surface-hover border-border' : 'hover:bg-surface-hover/50'
                }`}
                onMouseEnter={() => setHoveredId(slice.categoryId)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform duration-200"
                  style={{
                    backgroundColor: slice.color,
                    transform: isHovered ? 'scale(1.25)' : 'none',
                    boxShadow: isHovered ? `0 0 8px ${slice.color}` : 'none',
                  }}
                />
                <div className="min-w-0 flex-1 flex flex-col">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {slice.categoryName}
                  </span>
                  <span className="text-[10px] text-muted font-medium">
                    {fmt(slice.spent)} ({(slice.percentage * 100).toFixed(0)}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
