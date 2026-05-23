import React from 'react';
import { Calendar, Trophy, Coffee, Car, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { useGamificationStore } from '../../store/gamificationStore';
import type { ChallengeWithDetails } from '../../store/gamificationStore';
import Avatar from '../ui/Avatar';

const typeIcons: Record<string, React.FC<{ className?: string }>> = {
  NO_OVERSPEND_WEEK: Trophy,
  NO_OVERSPEND_MONTH: Trophy,
  COFFEE_FREE_WEEK: Coffee,
  TRANSPORT_SAVER: Car,
  CUSTOM: Trophy,
};

const typeLabels: Record<string, string> = {
  NO_OVERSPEND_WEEK: 'No Overspend Week',
  NO_OVERSPEND_MONTH: 'No Overspend Month',
  COFFEE_FREE_WEEK: 'Coffee-Free Week',
  TRANSPORT_SAVER: 'Transport Saver',
  CUSTOM: 'Custom Challenge',
};

export const ActiveChallengeCard: React.FC = () => {
  const { challenges, isLoading } = useGamificationStore();

  // If loading or challenges not fetched yet
  if (isLoading) {
    return (
      <div className="container-card p-6 md:p-8 hover:border-primary/30 transition-all duration-300">
        <div className="h-4 w-28 bg-surface-hover rounded animate-pulse mb-4" />
        <div className="h-6 w-48 bg-surface-hover rounded animate-pulse mb-3" />
        <div className="h-2 w-full bg-surface-hover rounded-full animate-pulse mt-4 mb-2" />
        <div className="flex justify-between mt-3">
          <div className="h-3 w-20 bg-surface-hover rounded animate-pulse" />
          <div className="h-3 w-16 bg-surface-hover rounded animate-pulse" />
        </div>
      </div>
    );
  }

  // Find the active challenge (where status is ACTIVE and the user has accepted or failed, but not pending/unresponded)
  // Sorted by earliest endDate (most urgent first)
  const activeChallenge: ChallengeWithDetails | undefined = challenges
    .filter((c) => c.status === 'ACTIVE' && c.myStatus !== 'pending')
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())[0];

  if (!activeChallenge) {
    return null; // Don't render anything if no active challenges
  }

  const {
    type,
    name,
    startDate,
    endDate,
    participants,
    myStatus,
    daysRemaining,
  } = activeChallenge;

  const IconComponent = typeIcons[type] || Trophy;

  // Memoize duration and progress math to prevent calculations on every render
  const { totalDays, currentDay, pct } = React.useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();
    // Calculate difference in days (ceiling)
    const total = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const elapsed = Math.max(0, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const current = Math.min(elapsed, total);
    const percentage = Math.min((current / total) * 100, 100);
    return { totalDays: total, currentDay: current, pct: percentage };
  }, [startDate, endDate]);

  // States
  const isFailed = myStatus === 'failed';
  const isEndingToday = daysRemaining === 0 && !isFailed;
  
  // Layout customization based on status
  let cardClass = 'hover:border-primary/30';
  let barColor = 'bg-primary';
  let statusText = `Day ${currentDay} of ${totalDays} — Stay under budget!`;
  let badgeEl = null;

  if (isFailed) {
    cardClass = 'border-error/40 bg-error/5 hover:border-error/60';
    barColor = 'bg-error/40';
    statusText = 'You went over budget in a category!';
    badgeEl = (
      <div className="flex items-center gap-1 text-xs text-error font-semibold bg-error/15 px-2.5 py-1 rounded-lg">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Failed</span>
      </div>
    );
  } else if (isEndingToday) {
    cardClass = 'border-warning/50 bg-warning/5 hover:border-warning/70';
    barColor = 'bg-warning animate-pulse';
    statusText = 'Final day — finish strong!';
    badgeEl = (
      <div className="flex items-center gap-1 text-xs text-warning font-semibold bg-warning/15 px-2.5 py-1 rounded-lg">
        <Clock className="w-3.5 h-3.5" />
        <span>Ending Today</span>
      </div>
    );
  } else {
    // Normal active on track
    cardClass = 'border-success/30 bg-success/5 hover:border-success/50';
    barColor = 'bg-success';
    badgeEl = (
      <div className="flex items-center gap-1 text-xs text-success font-semibold bg-success/15 px-2.5 py-1 rounded-lg">
        <CheckCircle className="w-3.5 h-3.5" />
        <span>On Track</span>
      </div>
    );
  }

  // Display max 4 participants
  const maxShownAvatars = 4;
  const acceptedParticipants = participants.filter((p) => p.accepted);
  const displayParticipants = acceptedParticipants.slice(0, maxShownAvatars);
  const overflowCount = acceptedParticipants.length - maxShownAvatars;

  return (
    <div className={`container-card p-6 md:p-8 transition-all duration-300 flex flex-col justify-between ${cardClass}`}>
      <div>
        {/* Header section */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            <span className="text-xs text-muted font-bold tracking-wider uppercase">Active Challenge</span>
          </div>
          {badgeEl}
        </div>

        {/* Challenge info */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center shrink-0 border border-border/40">
            <IconComponent className="w-6 h-6 text-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-display font-semibold text-foreground truncate">
              {name || typeLabels[type]}
            </h3>
            <p className="text-xs text-muted mt-1 leading-snug truncate">
              {activeChallenge.description || `Stay under budget for ${typeLabels[type].toLowerCase()}!`}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-6">
          <div className="w-full h-2 bg-surface rounded-full overflow-hidden border border-border/10">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2.5">
            <p className="text-xs font-semibold text-foreground">
              {statusText}
            </p>
            <p className="text-xs text-muted flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Participants section */}
      <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between">
        <span className="text-xs text-muted font-medium">Participants:</span>
        <div className="flex items-center -space-x-2">
          {displayParticipants.map((p) => {
            const displayName = p.displayName || p.username || 'User';
            // Determine if this participant failed
            const participantFailed = p.failedAt !== null;

            return (
              <div 
                key={p.userId} 
                className="relative" 
                title={`${displayName}${participantFailed ? ' (Failed)' : ' (On Track)'}`}
              >
                <Avatar
                  src={p.avatarUrl}
                  name={displayName}
                  size="sm"
                  className={`border-2 border-surface shadow-sm ${
                    participantFailed ? 'ring-2 ring-error opacity-60' : 'ring-2 ring-success'
                  }`}
                />
              </div>
            );
          })}
          {overflowCount > 0 && (
            <div className="w-8 h-8 rounded-xl bg-surface border border-border/80 flex items-center justify-center text-xs font-bold text-muted shadow-sm select-none z-10">
              +{overflowCount}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
