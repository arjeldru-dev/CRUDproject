import React from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';

interface BudgetForecastBarChartProps {
  categoryName: string;
  monthlyLimit: number;
  spent: number;
  remaining: number;
  projectedSpend?: number;
  status?: string;
}

export const BudgetForecastBarChart: React.FC<BudgetForecastBarChartProps> = ({
  categoryName,
  monthlyLimit,
  spent,
  projectedSpend,
  status,
}) => {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const hasLimit = monthlyLimit > 0;

  // Percentage Calculations
  const pctSpent = hasLimit ? (spent / monthlyLimit) * 100 : 0;
  const pctProjected = hasLimit && projectedSpend && projectedSpend > 0
    ? (projectedSpend / monthlyLimit) * 100
    : 0;

  const isOverBudget = status ? status === 'OVER_BUDGET' : (hasLimit && spent > monthlyLimit);
  const isAtRisk = status ? status === 'AT_RISK' : (pctProjected >= 85 && pctSpent >= 30);
  const isProjectedOverBudget = status
    ? (status === 'AT_RISK' && projectedSpend && projectedSpend > monthlyLimit)
    : (hasLimit && projectedSpend && projectedSpend > monthlyLimit);

  // Determine progress colors
  let progressColorClass = 'bg-gradient-to-r from-success/80 to-success';
  let projectionColorClass = 'bg-success/30';
  let remainingColorClass = 'text-success';
  let glowColor = '';

  if (isOverBudget) {
    progressColorClass = 'bg-gradient-to-r from-error/80 to-error';
    remainingColorClass = 'text-error';
    glowColor = 'rgba(224, 112, 112, 0.4)'; // error shadow
  } else if (isAtRisk || isProjectedOverBudget) {
    progressColorClass = 'bg-gradient-to-r from-warning/80 to-warning';
    projectionColorClass = 'bg-warning/40';
    remainingColorClass = 'text-warning';
    glowColor = 'rgba(235, 181, 94, 0.4)'; // warning shadow
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
    <div className={`container-card p-4 hover:border-border transition-all duration-300 ${
      isOverBudget ? 'border-error/20 bg-error/[0.01]' : isAtRisk ? 'border-warning/20 bg-warning/[0.01]' : ''
    }`}>
      {/* Header Info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isOverBudget && (
            <AlertTriangle className="w-4 h-4 text-error animate-pulse shrink-0" />
          )}
          {!isOverBudget && isAtRisk && (
            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          )}
          {!isOverBudget && !isAtRisk && projectedSpend && (
            <Sparkles className="w-3.5 h-3.5 text-success shrink-0" />
          )}
          <span className="text-sm font-semibold text-foreground truncate max-w-[150px]">
            {categoryName}
          </span>
        </div>

        <span className={`text-xs font-bold leading-none ${remainingColorClass}`}>
          {!hasLimit ? (
            'No Limit Set'
          ) : isOverBudget ? (
            `+${fmt(spent - monthlyLimit)} over`
          ) : (
            `+${fmt(monthlyLimit - spent)} left`
          )}
        </span>
      </div>

      {/* Progress Bar Container with Shadow Glow */}
      <div
        className="w-full h-2.5 bg-surface-hover rounded-full overflow-hidden relative border border-border-subtle/50 transition-all duration-300"
        style={{
          boxShadow: glowColor ? `0 0 10px ${glowColor}` : 'none',
        }}
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
        <div className="flex flex-col gap-0.5">
          <span>Spent: {fmt(spent)}</span>
          {projectedSpend && projectedSpend > 0 && (
            <span className="flex items-center gap-1 mt-0.5 text-foreground/80">
              <Sparkles className="w-3 h-3 text-primary" />
              Forecast: {fmt(projectedSpend)}
            </span>
          )}
        </div>
        
        <div className="text-right flex flex-col gap-0.5">
          <span>Limit: {hasLimit ? fmt(monthlyLimit) : '—'}</span>
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
