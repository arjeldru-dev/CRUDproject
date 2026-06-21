import React from 'react';
import { Flame, TrendingUp } from 'lucide-react';
import { useGamificationStore } from '../../store/gamificationStore';

const StreakWidgetComponent: React.FC = () => {
  const { profile, isLoading } = useGamificationStore();


  // ── Loading state ───────────────────────────────────────────────────────
  if (isLoading || !profile) {
    return (
      <div 
        className="bg-surface rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md animate-pulse flex flex-col justify-between h-full flex-1"
        style={{ padding: '24px' }}
      >
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-surface-hover animate-pulse" />
              <div>
                <div className="h-4 w-24 bg-surface-hover rounded animate-pulse mb-2" />
                <div className="h-3 w-16 bg-surface-hover rounded animate-pulse" />
              </div>
            </div>
            <div className="h-6 w-20 bg-surface-hover rounded-full animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-surface-hover rounded-lg animate-pulse mt-4" />
        </div>
        <div className="mt-5 pt-4 flex justify-between items-center gap-2">
          <div className="h-3 w-48 bg-surface-hover rounded animate-pulse" />
          <div className="h-3 w-20 bg-surface-hover rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const { currentStreak, longestStreak } = profile;

  // Determine state messaging and colors
  let flameColor = 'text-muted/40';
  let flameBg = 'bg-surface-hover';
  let flamePulse = '';
  let statusMessage = 'Log an expense under budget to start your streak!';
  let streakLabelClass = 'text-muted';

  if (currentStreak > 0) {
    flameColor = 'text-streak';
    flameBg = 'bg-streak-muted';
    flamePulse = 'animate-subtle-glow';
    statusMessage = 'Keep going! Maintain your daily under-budget status.';
    streakLabelClass = 'text-foreground font-semibold';
    
    if (currentStreak >= 7) {
      flamePulse = 'animate-bounce';
      statusMessage = "You're on fire! Keep the legendary saver streak alive! 🔥";
      flameBg = 'bg-streak-muted/80 shadow-lg shadow-streak/5 border border-streak/25';
    }
  }

  return (
    <div 
      className="bg-surface rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between group h-full flex-1"
      style={{ padding: '24px' }}
    >
      <div>
        {/* Header section */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl ${flameBg} flex items-center justify-center transition-all duration-300`}>
              <Flame className={`w-6 h-6 ${flameColor} ${flamePulse} transition-transform duration-200 group-hover:scale-110`} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Under-Budget Streak</p>
              <p className="text-xs text-muted">Consecutive disciplined days</p>
            </div>
          </div>

        </div>

        {/* Large count */}
        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-5xl font-mono font-bold text-foreground tracking-tight">
            {currentStreak}
          </span>
          <span className={`text-base font-semibold ${streakLabelClass}`}>
            {currentStreak === 1 ? 'day' : 'days'} streak
          </span>
        </div>
      </div>

      {/* Footer details */}
      <div className="mt-5 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted leading-relaxed">
          {statusMessage}
        </p>
        <div className="flex items-center gap-1 text-xs text-muted shrink-0">
          <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Best: <span className="font-mono text-foreground font-semibold">{longestStreak}</span> days</span>
        </div>
      </div>
    </div>
  );
};

export const StreakWidget = React.memo(StreakWidgetComponent);
