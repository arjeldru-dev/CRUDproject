import React, { useEffect, useMemo } from 'react';
import { Trophy, Medal, Flame, Star, Award, AlertCircle } from 'lucide-react';
import { useGamificationStore } from '../../store/gamificationStore';
import Avatar from '../ui/Avatar';

const Leaderboard: React.FC = () => {
  const { leaderboard, isLoading, error, fetchLeaderboard } = useGamificationStore();

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Split into top 3 (podium) and the rest
  const topThree = useMemo(() => leaderboard.slice(0, 3), [leaderboard]);
  const remaining = useMemo(() => leaderboard.slice(3), [leaderboard]);
  const showPodium = useMemo(() => leaderboard.length >= 3, [leaderboard]);
  const listEntries = useMemo(() => (showPodium ? remaining : leaderboard), [showPodium, remaining, leaderboard]);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return (
          <div className="flex items-center justify-center" title="1st Place">
            <span className="sr-only">1st Place</span>
            <Trophy className="w-5 h-5 text-warning" />
          </div>
        );
      case 2:
        return (
          <div className="flex items-center justify-center" title="2nd Place">
            <span className="sr-only">2nd Place</span>
            <Medal className="w-5 h-5 text-slate-400" />
          </div>
        );
      case 3:
        return (
          <div className="flex items-center justify-center" title="3rd Place">
            <span className="sr-only">3rd Place</span>
            <Medal className="w-5 h-5 text-orange-500" />
          </div>
        );
      default:
        return <span className="font-display font-bold text-muted w-6 text-center">{rank}</span>;
    }
  };

  if (isLoading && leaderboard.length === 0) {
    return (
      <div className="flex flex-col lg:flex-row gap-2 items-start w-full">
        {/* Left: Standings list skeleton (50% on desktop) */}
        <div style={{ padding: '24px' }} className="bg-surface rounded-[var(--radius-lg)] flex flex-col gap-2 w-full lg:flex-1 order-2 lg:order-1">
          <div className="h-6 w-32 bg-surface-hover rounded mb-4 animate-pulse" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-[var(--radius-md)] animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-6 h-6 bg-surface-hover rounded-full" />
                <div className="w-10 h-10 bg-surface-hover rounded-xl" />
                <div className="space-y-2">
                  <div className="h-4 w-24 bg-surface-hover rounded" />
                  <div className="h-3 w-16 bg-surface-hover rounded" />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="h-4 w-12 bg-surface-hover rounded" />
                <div className="h-4 w-8 bg-surface-hover rounded" />
              </div>
            </div>
          ))}
        </div>

        {/* Right: Podium skeleton (50% on desktop) */}
        <div className="w-full lg:flex-1 grid grid-cols-1 lg:grid-cols-3 gap-2 items-end shrink-0 order-1 lg:order-2">
          {[1, 2, 3].map((i) => {
            const isFirst = i === 1;
            const isSecond = i === 2;
            const heightClass = isFirst
              ? 'h-24 lg:h-96'
              : isSecond
                ? 'h-20 lg:h-80'
                : 'h-16 lg:h-72';
            const padding = isFirst
              ? '24px'
              : isSecond
                ? '18px 20px'
                : '12px 16px';
            const orderClass = isFirst
              ? 'order-1 lg:order-2'
              : isSecond
                ? 'order-2 lg:order-1'
                : 'order-3 lg:order-3';
            return (
              <div 
                key={i} 
                style={{ padding }} 
                className={`bg-surface rounded-[var(--radius-lg)] ${heightClass} ${orderClass} animate-pulse flex flex-row lg:flex-col items-center justify-between lg:justify-center gap-3`}
              >
                <div className="flex items-center gap-3 lg:flex-col lg:w-full">
                  <div className="w-6 h-6 bg-surface-hover rounded-full shrink-0" />
                  <div className="w-10 h-10 bg-surface-hover rounded-full shrink-0" />
                  <div className="space-y-2 lg:text-center">
                    <div className="h-3.5 w-20 bg-surface-hover rounded mx-auto" />
                    <div className="h-2.5 w-12 bg-surface-hover rounded mx-auto" />
                  </div>
                </div>
                <div className="flex items-center gap-2 lg:flex-col lg:w-full lg:items-center">
                  <div className="h-6 w-16 bg-surface-hover rounded-full" />
                  <div className="h-4 w-8 bg-surface-hover rounded-full" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '32px' }} className="flex flex-col items-center justify-center bg-error/10 rounded-[var(--radius-lg)] text-error text-center space-y-3">
        <AlertCircle className="w-12 h-12" />
        <h3 className="font-display font-semibold text-lg">Error loading leaderboard</h3>
        <p className="text-sm max-w-md">{error}</p>
        <button
          onClick={() => fetchLeaderboard()}
          className="mt-2 px-4 py-2 bg-error text-white font-semibold rounded-xl text-sm hover:bg-error-hover transition-colors btn-active-tactile cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div style={{ padding: '48px' }} className="flex flex-col items-center justify-center bg-surface rounded-[var(--radius-lg)] text-center space-y-4">
        <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center text-muted">
          <Trophy className="w-8 h-8" />
        </div>
        <h3 className="font-display font-semibold text-xl text-foreground">No standings available yet</h3>
        <p className="text-muted text-sm max-w-sm">
          Add some friends and start tracking your budget under limit to build points and climb the rankings!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-2 items-start w-full">
      {/* Leaderboard Table List (Left on desktop, Bottom on mobile) */}
      <div 
        style={{ padding: '24px' }} 
        className="bg-surface rounded-[var(--radius-lg)] shadow-sm animate-fadeInFast w-full lg:flex-1 order-2 lg:order-1"
      >
        <div className="pb-4 flex items-center justify-between">
          <h3 className="font-display font-bold text-lg text-foreground">Standings</h3>
          <span className="text-xs text-muted font-medium bg-surface-hover py-1 px-2.5 rounded-[var(--radius-pill)]">
            {leaderboard.length} competitors
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {listEntries.map((entry, i) => (
            <div
              key={entry.userId}
              style={{ animationDelay: `${i * 30}ms` }}
              className={`flex items-center justify-between p-4 rounded-[var(--radius-md)] transition-colors duration-150 hover:bg-surface-hover/80 active:scale-[0.99] animate-slideUpIn opacity-0 ${
                entry.isCurrentUser ? 'bg-primary/10' : ''
              }`}
            >
              <div className="flex items-center gap-4 min-w-0">
                {/* Rank */}
                <div className="w-8 flex items-center justify-center shrink-0">
                  {getRankIcon(entry.rank)}
                </div>

                {/* User Info */}
                <Avatar
                  src={entry.avatarUrl}
                  name={entry.displayName || entry.username || 'User'}
                  size="md"
                  frameClass={entry.activeFrame?.cssClass || undefined}
                />

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground truncate text-sm md:text-base">
                      {entry.displayName || entry.username || 'User'}
                    </span>
                    {entry.isCurrentUser && (
                      <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 rounded px-1.5 font-bold uppercase tracking-wider shrink-0">
                        You
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted block truncate">
                    @{entry.username}
                  </span>
                </div>
              </div>

              {/* Stats Columns */}
              <div className="flex items-center gap-4 md:gap-8 shrink-0">
                {/* Streak */}
                {entry.currentStreak > 0 && (
                  <div className="flex items-center gap-1 text-streak" title="Current streak">
                    <Flame className="w-4 h-4 fill-streak/20" />
                    <span className="font-display font-bold text-xs md:text-sm font-mono">{entry.currentStreak}d</span>
                  </div>
                )}

                {/* Badges */}
                {entry.badgeCount > 0 && (
                  <div className="flex items-center gap-1 text-secondary" title="Badges earned">
                    <Award className="w-4 h-4" />
                    <span className="font-display font-bold text-xs md:text-sm font-mono">{entry.badgeCount}</span>
                  </div>
                )}

                {/* Points */}
                <div className="flex items-center gap-1.5 bg-surface-hover rounded-[var(--radius-pill)] py-1 px-3">
                  <Star className="w-3.5 h-3.5 text-warning fill-warning" />
                  <span className="font-display font-extrabold text-sm text-foreground font-mono">
                    {entry.totalPoints.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Visual Podium (Right on desktop, Top on mobile) */}
      {showPodium && (
        <div className="w-full lg:flex-1 grid grid-cols-1 lg:grid-cols-3 gap-2 items-end shrink-0 order-1 lg:order-2">
          {topThree.map((entry) => {
            const isFirst = entry.rank === 1;
            const isSecond = entry.rank === 2;
            const isThird = entry.rank === 3;
            
            const borderClass = isFirst
              ? 'bg-warning/5 dark:bg-warning/10 shadow-sm'
              : isSecond
                ? 'bg-slate-400/5 dark:bg-slate-400/10 shadow-sm'
                : 'bg-orange-500/5 dark:bg-orange-500/10 shadow-sm';
                
            const heightClass = isFirst
              ? 'min-h-[96px] lg:h-96'
              : isSecond
                ? 'min-h-[80px] lg:h-80'
                : 'min-h-[68px] lg:h-72';

            const padding = isFirst
              ? '24px'
              : isSecond
                ? '18px 20px'
                : '12px 16px';

            const animationDelay = `${(3 - entry.rank) * 80}ms`;

            return (
              <div 
                key={entry.userId}
                style={{ padding, animationDelay }}
                className={`relative flex flex-row lg:flex-col items-center justify-between lg:justify-between text-left lg:text-center animate-scaleIn opacity-0 ${heightClass} ${borderClass} rounded-[var(--radius-lg)] ${
                  entry.isCurrentUser ? 'bg-primary/10' : ''
                } ${
                  isFirst
                    ? 'order-1 lg:order-2'
                    : isSecond
                      ? 'order-2 lg:order-1'
                      : 'order-3 lg:order-3'
                }`}
              >
                {/* Left side on mobile, Top side on desktop */}
                <div className="flex items-center gap-3 min-w-0 lg:flex-col lg:w-full">
                  {/* Rank Icon (Trophy/Medal) inside the card */}
                  <div className="flex items-center justify-center shrink-0 lg:mb-1">
                    {isFirst && (
                      <div className="flex items-center justify-center">
                        <span className="sr-only">1st Place</span>
                        <Trophy className="w-6 h-6 lg:w-8 lg:h-8 text-warning drop-shadow-md animate-bounce" style={{ animationDuration: '3s' }} />
                      </div>
                    )}
                    {isSecond && (
                      <div className="flex items-center justify-center">
                        <span className="sr-only">2nd Place</span>
                        <Medal className="w-6 h-6 lg:w-8 lg:h-8 text-slate-400 drop-shadow-md" />
                      </div>
                    )}
                    {isThird && (
                      <div className="flex items-center justify-center">
                        <span className="sr-only">3rd Place</span>
                        <Medal className="w-6 h-6 lg:w-8 lg:h-8 text-orange-500 drop-shadow-md" />
                      </div>
                    )}
                  </div>

                  {/* Avatar */}
                  <div className="shrink-0 lg:mb-1">
                    <Avatar
                      src={entry.avatarUrl}
                      name={entry.displayName || entry.username || 'User'}
                      size={isFirst ? 'lg' : isSecond ? 'md' : 'sm'}
                      frameClass={entry.activeFrame?.cssClass || undefined}
                    />
                  </div>

                  {/* Names */}
                  <div className="min-w-0 text-left lg:text-center lg:w-full">
                    <span className="font-display font-bold text-sm block truncate text-foreground leading-tight">
                      {entry.displayName || entry.username || 'User'}
                    </span>
                    <span className="text-[10px] text-muted block truncate mt-0.5">
                      @{entry.username}
                    </span>
                  </div>
                </div>

                {/* Right side on mobile, Bottom side on desktop */}
                <div className="flex items-center gap-2 lg:gap-1.5 shrink-0 lg:flex-col lg:w-full lg:items-center lg:mt-2">
                  {/* Points Display */}
                  <div className="flex items-center gap-1 bg-surface-hover rounded-[var(--radius-pill)] py-1 px-2.5">
                    <Star className="w-3.5 h-3.5 text-warning fill-warning" />
                    <span className="font-display font-bold text-[11px] text-foreground font-mono">
                      {entry.totalPoints.toLocaleString()}
                    </span>
                  </div>

                  {/* Rank Badge inside the card */}
                  <div className={`rounded-[var(--radius-pill)] px-2 py-0.5 text-[9px] font-display font-black tracking-wider uppercase ${
                    isFirst
                      ? 'bg-warning/20 text-warning'
                      : isSecond
                        ? 'bg-slate-400/20 text-slate-700 dark:text-slate-300'
                        : 'bg-orange-500/20 text-orange-600 dark:text-orange-400'
                  }`}>
                    {isFirst ? '1st' : isSecond ? '2nd' : '3rd'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
