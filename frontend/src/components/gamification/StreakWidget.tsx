import React from 'react';
import { Flame, Star, TrendingUp } from 'lucide-react';
import { useGamificationStore } from '../../store/gamificationStore';

export const StreakWidget: React.FC = () => {
  const { profile, isLoading } = useGamificationStore();

  const fmtPoints = (n: number) => {
    return new Intl.NumberFormat('en-PH').format(n);
  };

  // ── Loading state ───────────────────────────────────────────────────────
  if (isLoading || !profile) {
    return (
      <div className="container-card p-6 md:p-8 hover:border-secondary/30 transition-all duration-300">
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
        <div className="h-3 w-48 bg-surface-hover rounded animate-pulse mt-3" />
      </div>
    );
  }

  const { currentStreak, longestStreak, totalPoints } = profile;

  // Determine state messaging and colors
  let flameColor = 'text-muted/40';
  let flameBg = 'bg-surface-hover';
  let flamePulse = '';
  let statusMessage = 'Log an expense under budget to start your streak!';
  let streakLabelClass = 'text-muted';

  if (currentStreak > 0) {
    flameColor = 'text-orange-500';
    flameBg = 'bg-orange-500/10';
    flamePulse = 'animate-subtle-glow';
    statusMessage = 'Keep going! Maintain your daily under-budget status.';
    streakLabelClass = 'text-foreground font-semibold';
    
    if (currentStreak >= 7) {
      flamePulse = 'animate-bounce';
      statusMessage = "You're on fire! Keep the legendary saver streak alive! 🔥";
      flameBg = 'bg-orange-500/20 shadow-lg shadow-orange-500/10 border border-orange-500/30';
    }
  }

  return (
    <div className="container-card p-6 md:p-8 hover:border-secondary/30 transition-all duration-300 flex flex-col justify-between">
      <div>
        {/* Header section */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl ${flameBg} flex items-center justify-center transition-all duration-300`}>
              <Flame className={`w-6 h-6 ${flameColor} ${flamePulse}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Under-Budget Streak</p>
              <p className="text-xs text-muted">Consecutive disciplined days</p>
            </div>
          </div>

          {/* Points display */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warning/10 border border-warning/20 text-warning text-xs font-bold font-display">
            <Star className="w-3.5 h-3.5 fill-warning" />
            <span>{fmtPoints(totalPoints)} pts</span>
          </div>
        </div>

        {/* Large count */}
        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-5xl font-display font-extrabold text-foreground tracking-tight">
            {currentStreak}
          </span>
          <span className={`text-base font-semibold ${streakLabelClass}`}>
            {currentStreak === 1 ? 'day' : 'days'} streak
          </span>
        </div>
      </div>

      {/* Footer details */}
      <div className="mt-5 pt-4 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted leading-relaxed">
          {statusMessage}
        </p>
        <div className="flex items-center gap-1 text-xs text-muted shrink-0">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Longest: {longestStreak} days</span>
        </div>
      </div>
    </div>
  );
};
