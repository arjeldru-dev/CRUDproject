import React from 'react';
import { AlertTriangle, TrendingUp, Lightbulb } from 'lucide-react';

interface BudgetForecastBarChartProps {
  categoryName: string;
  limitAmount: number;
  spent: number;
  remaining: number;
  projectedSpend?: number;
  status?: string;
  periodLabel?: string;
}

const BudgetForecastBarChartComponent: React.FC<BudgetForecastBarChartProps> = ({
  categoryName,
  limitAmount,
  spent,
  projectedSpend,
  status,
  periodLabel,
}) => {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const hasLimit = limitAmount > 0;

  // Percentage Calculations
  const pctSpent = hasLimit ? (spent / limitAmount) * 100 : 0;
  const pctProjected = hasLimit && projectedSpend && projectedSpend > 0
    ? (projectedSpend / limitAmount) * 100
    : 0;

  const isOverBudget = status ? status === 'OVER_BUDGET' : (hasLimit && spent > limitAmount);
  const isAtRisk = status ? status === 'AT_RISK' : (pctProjected >= 85 && pctSpent >= 30);
  const isProjectedOverBudget = status
    ? (status === 'AT_RISK' && projectedSpend && projectedSpend > limitAmount)
    : (hasLimit && projectedSpend && projectedSpend > limitAmount);

  // Determine progress colors
  let progressColorClass = 'bg-success';
  let projectionColorClass = 'bg-success/30';
  let remainingColorClass = 'text-success';

  if (isOverBudget) {
    progressColorClass = 'bg-error';
    remainingColorClass = 'text-error';
  } else if (isAtRisk || isProjectedOverBudget) {
    progressColorClass = 'bg-warning';
    projectionColorClass = 'bg-warning/40';
    remainingColorClass = 'text-warning';
  }

  // Draw projection only if projected spend is greater than spent
  const showProjection = hasLimit && projectedSpend && projectedSpend > spent;
  const widthSpent = Math.min(pctSpent, 100);
  const widthProjected = Math.min(pctProjected, 100);
  const projectionWidth = Math.max(0, widthProjected - widthSpent);

  // Hatched pattern styling for AI forecast projection
  const stripeStyle = {
    backgroundImage:
      'linear-gradient(45deg, rgba(255, 255, 255, 0.25) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.25) 50%, rgba(255, 255, 255, 0.25) 75%, transparent 75%, transparent)',
    backgroundSize: '12px 12px',
  };

  return (
    <div 
      className={`bg-surface rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md hover:bg-surface-hover/30 ease-out ${
        isOverBudget ? 'border-error/20 bg-error/[0.01]' : isAtRisk ? 'border-warning/20 bg-warning/[0.01]' : ''
      }`}
      style={{ padding: '24px' }}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isOverBudget && (
            <AlertTriangle className="w-4 h-4 text-error animate-pulse shrink-0" aria-hidden="true" />
          )}
          {!isOverBudget && isAtRisk && (
            <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
          )}
          {!isOverBudget && !isAtRisk && (
            projectedSpend && projectedSpend > 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-success shrink-0" aria-hidden="true" />
            ) : (
              <TrendingUp className="w-3.5 h-3.5 text-muted/60 shrink-0" aria-hidden="true" />
            )
          )}
          <span className="text-sm font-display font-semibold text-foreground truncate flex-1">
            {categoryName}
          </span>
        </div>

        <span className={`text-xs font-mono font-bold leading-none shrink-0 ${remainingColorClass}`}>
          {!hasLimit ? (
            'No Limit Set'
          ) : isOverBudget ? (
            `+${fmt(spent - limitAmount)} over`
          ) : (
            `+${fmt(limitAmount - spent)} left`
          )}
        </span>
      </div>

      {/* Progress Bar Container with Shadow Glow */}
      <div
        className="w-full h-2 bg-surface-hover rounded-full overflow-hidden relative border border-border/50 transition-[border-color] duration-160 ease-out"
      >
        {/* Spent Progress */}
        {spent > 0 && (
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${progressColorClass}`}
            style={{ width: `${widthSpent}%` }}
          />
        )}

        {/* Projection Overlay Segment */}
        {showProjection && (
          <div
            className={`h-full absolute top-0 animate-pulse transition-all duration-500 ease-out ${projectionColorClass}`}
            style={{
              left: `${widthSpent}%`,
              width: `${projectionWidth}%`,
              ...stripeStyle,
            }}
          />
        )}
      </div>

      {/* Footer Info & AI projection subtext */}
      <div className="flex items-center justify-between mt-3 text-[11px] text-muted font-medium">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="truncate">Spent: <span className="font-mono text-foreground">{fmt(spent)}</span></span>
          {(projectedSpend !== undefined && projectedSpend > 0) ? (
            <span className="flex items-center gap-1 mt-0.5 text-foreground/80 truncate">
              <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
              Forecast: <span className="font-mono text-foreground font-semibold">{fmt(projectedSpend)}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 mt-0.5 text-muted/60 truncate">
              <Lightbulb className="w-3.5 h-3.5 text-muted/50 shrink-0" aria-hidden="true" />
              Forecast: <span className="font-mono text-muted/70 font-semibold">{fmt(0)}</span>
            </span>
          )}
        </div>
        
        <div className="text-right flex flex-col gap-0.5 shrink-0">
          <span>Limit: <span className="font-mono">{hasLimit ? fmt(limitAmount) : '—'}</span>{periodLabel ? ` · ${periodLabel}` : ''}</span>
          {hasLimit && (
            <span className={isOverBudget ? 'text-error' : isProjectedOverBudget ? 'text-error' : isAtRisk ? 'text-warning' : 'text-success'}>
              {isOverBudget ? 'Over Budget' : isProjectedOverBudget ? 'Predicts Overspend' : isAtRisk ? 'At Risk' : 'On Track'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const BudgetForecastBarChart = React.memo(BudgetForecastBarChartComponent);
