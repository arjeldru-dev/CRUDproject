import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { Wallet, AlertCircle, ShoppingBag, Utensils, Plane, Zap, PiggyBank, Film, Activity } from 'lucide-react';
import { getCategoryColor } from '../ui/categoryColor';
import { periodName, type BudgetPeriod } from '../../lib/budgetPeriod';

interface CategoryBudget {
  categoryId: string;
  categoryName: string;
  limitAmount: number;
  spent: number;
  remaining: number;
  period?: BudgetPeriod;
}

const getCategoryMeta = (categoryName: string) => {
  const name = categoryName.toLowerCase();
  const color = getCategoryColor(categoryName);

  let icon = Wallet;
  if (name.includes('grocer') || name.includes('shop') || name.includes('market')) {
    icon = ShoppingBag;
  } else if (name.includes('dining') || name.includes('eat') || name.includes('drink') || name.includes('food') || name.includes('restau') || name.includes('cafe')) {
    icon = Utensils;
  } else if (name.includes('travel') || name.includes('transport') || name.includes('car') || name.includes('flight') || name.includes('taxi') || name.includes('gas')) {
    icon = Plane;
  } else if (name.includes('utilit') || name.includes('bill') || name.includes('cloud') || name.includes('power') || name.includes('internet') || name.includes('bolt') || name.includes('electricity')) {
    icon = Zap;
  } else if (name.includes('save') || name.includes('saving') || name.includes('invest') || name.includes('piggy')) {
    icon = PiggyBank;
  } else if (name.includes('entertain') || name.includes('movie') || name.includes('show') || name.includes('play') || name.includes('game') || name.includes('stream')) {
    icon = Film;
  } else if (name.includes('health') || name.includes('well') || name.includes('fit') || name.includes('gym') || name.includes('medical')) {
    icon = Activity;
  }
  return { icon, color };
};

/** Circular progress ring element with smooth animations and center status */
const ProgressRing: React.FC<{ percent: number; color: string; isOver: boolean; size?: 'sm' | 'md' }> = ({ percent, color, isOver, size = 'sm' }) => {
  const isSm = size === 'sm';
  const r = isSm ? 20 : 34;
  const strokeWidth = isSm ? 4 : 6;
  const c = 2 * Math.PI * r;
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const offset = c - (clampedPercent / 100) * c;
  const svgSize = isSm ? 52 : 80;
  const center = svgSize / 2;

  return (
    <div className={`relative ${isSm ? 'w-13 h-13' : 'w-20 h-20'} flex-shrink-0 flex items-center justify-center`}>
      <svg className={`${isSm ? 'w-13 h-13' : 'w-20 h-20'}`}>
        <circle
          cx={center}
          cy={center}
          fill="transparent"
          r={r}
          className="stroke-border dark:stroke-border-subtle"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          fill="transparent"
          r={r}
          stroke={isOver ? 'var(--color-error)' : color}
          className="transition-all duration-700 ease-out"
          strokeWidth={strokeWidth}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center select-none">
        <span className={`font-mono font-bold ${isSm ? 'text-[10px]' : 'text-sm'} ${isOver ? 'text-error' : 'text-foreground'}`}>
          {isOver ? '!' : `${Math.round(percent)}%`}
        </span>
      </div>
    </div>
  );
};

const FeedBudgetSidebar: React.FC = () => {
  const [categories, setCategories] = useState<CategoryBudget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCategories = useCallback(async () => {
    try {
      setError('');
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await api.get(`/transactions/budget?timezone=${encodeURIComponent(timezone)}`);
      setCategories(res.data.budgetStatuses || []);
    } catch (err) {
      console.error('Failed to load categories sidebar:', err);
      setError('Could not load budget.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <aside className="w-full">
      <div className="flex items-center gap-2.5 mb-7 px-1">
        <Wallet className="w-5 h-5 text-primary" />
        <h2 className="font-display font-bold text-lg sm:text-xl text-foreground uppercase tracking-wider">
          Budget Targets
        </h2>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface-hover/20 dark:bg-surface-hover/10 rounded-2xl p-3.5 flex flex-col items-center justify-center h-48 gap-2">
              <div className="h-3 bg-surface-hover rounded w-16" />
              <div className="w-20 h-20 rounded-full bg-surface-hover" />
              <div className="h-3.5 bg-surface-hover rounded w-12" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-error/5 border border-error/10 text-error text-xs font-sans">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={fetchCategories}
            className="text-[10px] font-bold underline hover:text-error/80 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-6 px-4">
          <p className="text-xs text-muted font-sans leading-relaxed">
            No budget categories defined yet.
          </p>
          <Link
            to="/categories"
            className="mt-3.5 inline-block text-[11px] font-bold text-primary hover:underline font-display"
          >
            Define Budgets &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {categories.slice(0, 4).map((cat) => {
              const meta = getCategoryMeta(cat.categoryName);
              const percent = cat.limitAmount > 0 ? (cat.spent / cat.limitAmount) * 100 : 0;
              const isOver = cat.spent > cat.limitAmount;

              return (
                <div
                  key={cat.categoryId}
                  className="bg-surface-hover/20 dark:bg-surface-hover/10 rounded-2xl p-3.5 flex flex-col items-center justify-center text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm h-48 gap-2"
                >
                  <div className="w-full flex flex-col items-center gap-1 px-1">
                    <span className="text-xs sm:text-sm font-semibold text-foreground leading-tight line-clamp-2 w-full" title={cat.categoryName}>
                      {cat.categoryName}
                    </span>
                    {cat.period && (
                      <span className="text-[9px] font-bold uppercase tracking-wide text-muted/70">
                        {periodName(cat.period)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-center">
                    <ProgressRing percent={percent} color={meta.color} isOver={isOver} size="md" />
                  </div>

                  <div 
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      isOver ? 'bg-error/10 text-error' : ''
                    }`}
                    style={{
                      backgroundColor: isOver ? undefined : `color-mix(in srgb, ${meta.color} 10%, transparent)`,
                      color: isOver ? undefined : meta.color,
                    }}
                  >
                    {isOver 
                      ? `${fmt(Math.abs(cat.remaining))} over` 
                      : `${fmt(cat.remaining)} left`}
                  </div>
                </div>
              );
            })}
          </div>

          {categories.length > 4 && (
            <div className="pt-3 text-center border-t border-border-subtle">
              <Link
                to="/categories"
                className="text-[11px] font-bold text-muted hover:text-primary transition-colors font-display"
              >
                View all budgets ({categories.length})
              </Link>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};

export default FeedBudgetSidebar;
