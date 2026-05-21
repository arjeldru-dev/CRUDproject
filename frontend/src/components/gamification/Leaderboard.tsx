import React, { useEffect } from 'react';
import { Trophy, Medal, Flame, Star, Award, AlertCircle } from 'lucide-react';
import { useGamificationStore } from '../../store/gamificationStore';
import Avatar from '../ui/Avatar';

const Leaderboard: React.FC = () => {
  const { leaderboard, isLoading, error, fetchLeaderboard } = useGamificationStore();

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  if (isLoading && leaderboard.length === 0) {
    return (
      <div className="space-y-4">
        {/* Skeleton Leaderboard */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-background-card border border-border-subtle rounded-3xl p-6 h-48 animate-pulse flex flex-col items-center justify-end space-y-3">
              <div className="w-12 h-12 rounded-xl bg-surface-hover" />
              <div className="h-4 w-16 bg-surface-hover rounded" />
              <div className="h-6 w-12 bg-surface-hover rounded" />
            </div>
          ))}
        </div>
        <div className="bg-background-card border border-border-subtle rounded-[32px] overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between p-4 border-b border-border-subtle animate-pulse">
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
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-error/10 border border-error/20 rounded-[32px] text-error text-center space-y-3">
        <AlertCircle className="w-12 h-12" />
        <h3 className="font-display font-semibold text-lg">Error loading leaderboard</h3>
        <p className="text-sm max-w-md">{error}</p>
        <button
          onClick={() => fetchLeaderboard()}
          className="mt-2 px-4 py-2 bg-error text-white font-semibold rounded-xl text-sm hover:bg-error-hover transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-background-card border border-border-subtle rounded-[32px] text-center space-y-4">
        <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center text-muted">
          <Trophy className="w-8 h-8" />
        </div>
        <h3 className="font-display font-semibold text-xl text-foreground">No standings available yet</h3>
        <p className="text-muted text-sm max-w-sm">
          Add some friends and start tracking your budget under limit to build points and climb the rankings!
        </p>
      </div>
    );
  }

  // Split into top 3 (podium) and the rest
  const topThree = leaderboard.slice(0, 3);
  const remaining = leaderboard.slice(3);
  const showPodium = leaderboard.length >= 3;
  const listEntries = showPodium ? remaining : leaderboard;

  // Re-order podium for standard display: [2nd, 1st, 3rd] if we have at least 3
  const podiumOrder = topThree.length === 3 
    ? [topThree[1], topThree[0], topThree[2]] 
    : topThree;

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-6 h-6 text-yellow-500" />;
      case 2:
        return <Medal className="w-6 h-6 text-slate-400" />;
      case 3:
        return <Medal className="w-6 h-6 text-amber-700" />;
      default:
        return <span className="font-display font-bold text-muted-foreground w-6 text-center">{rank}</span>;
    }
  };

  const getPodiumBadgeColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-500/20 text-yellow-600 border border-yellow-500/30';
      case 2:
        return 'bg-slate-300/25 text-slate-600 border border-slate-300/40';
      case 3:
        return 'bg-amber-700/10 text-amber-800 border border-amber-700/20';
      default:
        return 'bg-surface text-muted border border-border-subtle';
    }
  };

  return (
    <div className="space-y-6">
      {/* Visual Podium (Only show if at least 3 entries) */}
      {showPodium && (
        <div className="grid grid-cols-3 gap-3 md:gap-6 items-end justify-center mb-4 mt-6">
          {podiumOrder.map((entry) => {
            const isFirst = entry.rank === 1;
            const isSecond = entry.rank === 2;
            const isThird = entry.rank === 3;
            const heightClass = isFirst ? 'h-56 bg-gradient-to-b from-yellow-500/5 to-yellow-500/20 border-yellow-400/40 shadow-yellow-500/5' : isSecond ? 'h-48 bg-gradient-to-b from-slate-300/5 to-slate-300/15 border-slate-400/30 shadow-slate-500/5' : 'h-44 bg-gradient-to-b from-amber-700/5 to-amber-700/15 border-amber-600/30 shadow-amber-700/5';
            
            return (
              <div 
                key={entry.userId}
                className={`relative flex flex-col items-center justify-end rounded-3xl border p-4 text-center transition-all duration-300 hover:scale-[1.02] shadow-sm ${heightClass} ${
                  entry.isCurrentUser ? 'ring-2 ring-primary/40' : ''
                }`}
              >
                {/* Crown/Trophy Icon Over Avatar */}
                <div className="absolute -top-6 flex justify-center">
                  {isFirst && <Trophy className="w-10 h-10 text-yellow-500 drop-shadow-md animate-bounce" style={{ animationDuration: '3s' }} />}
                  {isSecond && <Medal className="w-8 h-8 text-slate-400 drop-shadow-md" />}
                  {isThird && <Medal className="w-8 h-8 text-amber-700 drop-shadow-md" />}
                </div>

                <div className="mb-2">
                  <Avatar
                    src={entry.avatarUrl}
                    name={entry.displayName || entry.username || 'User'}
                    size={isFirst ? 'lg' : 'md'}
                    frameClass={entry.activeFrame?.cssClass || undefined}
                  />
                </div>

                <span className="font-display font-bold text-sm block truncate max-w-full text-foreground">
                  {entry.displayName || entry.username || 'User'}
                </span>
                <span className="text-[10px] text-muted block truncate max-w-full mb-2">
                  @{entry.username}
                </span>

                <div className="flex items-center justify-center gap-1.5 bg-background/60 backdrop-blur-sm rounded-full py-1 px-3 border border-border-subtle">
                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                  <span className="font-display font-bold text-xs text-foreground">
                    {entry.totalPoints.toLocaleString()}
                  </span>
                </div>

                {/* Rank Badge */}
                <div className={`absolute -bottom-3 rounded-full px-3 py-0.5 text-[10px] font-display font-black tracking-wider uppercase ${getPodiumBadgeColor(entry.rank)}`}>
                  {entry.rank === 1 ? '1st' : entry.rank === 2 ? '2nd' : '3rd'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Leaderboard Table List */}
      <div className="bg-background-card border border-border-subtle rounded-[32px] overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border-subtle flex items-center justify-between">
          <h3 className="font-display font-bold text-lg text-foreground">Standings</h3>
          <span className="text-xs text-muted font-medium bg-surface py-1 px-2.5 rounded-full border border-border-subtle">
            {leaderboard.length} competitors
          </span>
        </div>

        <div className="divide-y divide-border-subtle">
          {listEntries.map((entry) => (
            <div
              key={entry.userId}
              className={`flex items-center justify-between p-4 md:px-6 transition-colors hover:bg-surface/50 ${
                entry.isCurrentUser ? 'bg-primary/5 border-l-4 border-l-primary' : ''
              }`}
            >
              <div className="flex items-center gap-4 min-w-0">
                {/* Rank */}
                <div className="w-8 flex items-center justify-center">
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
                  <div className="flex items-center gap-1 text-orange-500" title="Current streak">
                    <Flame className="w-4 h-4 fill-orange-500/20" />
                    <span className="font-display font-bold text-xs md:text-sm">{entry.currentStreak}d</span>
                  </div>
                )}

                {/* Badges */}
                {entry.badgeCount > 0 && (
                  <div className="flex items-center gap-1 text-purple-500" title="Badges earned">
                    <Award className="w-4 h-4" />
                    <span className="font-display font-bold text-xs md:text-sm">{entry.badgeCount}</span>
                  </div>
                )}

                {/* Points */}
                <div className="flex items-center gap-1.5 bg-surface border border-border-subtle rounded-full py-1 px-3">
                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                  <span className="font-display font-extrabold text-sm text-foreground">
                    {entry.totalPoints.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
