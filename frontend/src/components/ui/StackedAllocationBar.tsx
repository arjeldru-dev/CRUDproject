import React from 'react';
import { getCategoryColor } from './categoryColor';

interface BudgetStatus {
  categoryId: string;
  categoryName: string;
  limitAmount: number;
  spent: number;
  remaining: number;
  projectedSpend?: number;
  status?: string;
}

interface StackedAllocationBarProps {
  budgetStatuses: BudgetStatus[];
}

export const StackedAllocationBar: React.FC<StackedAllocationBarProps> = ({ budgetStatuses }) => {
  // Filter out categories with 0 spent
  const activeBudgets = budgetStatuses.filter((b) => b.spent > 0);
  const totalSpent = activeBudgets.reduce((sum, b) => sum + b.spent, 0);

  if (totalSpent === 0 || activeBudgets.length === 0) {
    return (
      <div className="w-full bg-surface border border-border rounded-xl p-4.5 mb-5 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-xs font-semibold text-muted tracking-wider uppercase font-display">
            Spending Allocation
          </h4>
        </div>
        <div className="h-3 w-full bg-surface-hover rounded-full overflow-hidden" />
        <p className="text-[11px] text-muted font-medium mt-2 text-center">
          No spending logged yet to show allocation.
        </p>
      </div>
    );
  }

  // Calculate percentages
  const segments = activeBudgets.map((b) => {
    const percentage = (b.spent / totalSpent) * 100;
    const color = getCategoryColor(b.categoryName);
    return {
      categoryId: b.categoryId,
      categoryName: b.categoryName,
      percentage,
      spent: b.spent,
      color,
    };
  }).sort((a, b) => b.spent - a.spent); // Show largest first

  return (
    <div className="w-full bg-surface border border-border/85 rounded-xl p-4.5 mb-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
        <h4 className="text-xs font-semibold text-muted tracking-wider uppercase font-display">
          Spending Allocation
        </h4>
        <span className="text-[10px] font-medium text-muted">
          Total: <span className="font-mono text-foreground font-semibold">₱{new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalSpent)}</span>
        </span>
      </div>

      {/* The Stacked Bar */}
      <div className="w-full h-3.5 bg-surface-hover rounded-full overflow-hidden flex border border-border/40">
        {segments.map((seg) => (
          <div
            key={seg.categoryId}
            style={{
              width: `${seg.percentage}%`,
              backgroundColor: seg.color,
            }}
            title={`${seg.categoryName}: ${seg.percentage.toFixed(1)}%`}
            className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full hover:opacity-90 cursor-pointer"
          />
        ))}
      </div>

      {/* Small Inline Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {segments.map((seg) => (
          <div key={seg.categoryId} className="flex items-center gap-1.5 text-[10px] font-medium">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-muted truncate max-w-[100px]">{seg.categoryName}</span>
            <span className="font-mono font-semibold text-foreground">{seg.percentage.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};
export default StackedAllocationBar;
