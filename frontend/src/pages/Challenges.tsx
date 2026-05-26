import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGamificationStore } from '../store/gamificationStore';
import FramePicker from '../components/gamification/FramePicker';
import CreateChallengeModal from '../components/gamification/CreateChallengeModal';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import {
  Trophy,
  Coffee,
  Car,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar,
  Users,
  Award,
  Sparkles,
  Plus,
  Trash2,
  Lock,
  Shield,
  Zap,
  Check,
  AlertCircle,
} from 'lucide-react';

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

const rarityColors: Record<string, { border: string; bg: string; text: string; textDark: string; shadow: string }> = {
  COMMON: {
    border: 'border-slate-200 dark:border-slate-800',
    bg: 'bg-slate-50 dark:bg-slate-900/50',
    text: 'text-slate-500',
    textDark: 'text-slate-600 dark:text-slate-400',
    shadow: 'hover:shadow-slate-100 dark:hover:shadow-none',
  },
  UNCOMMON: {
    border: 'border-success/20 dark:border-success/10',
    bg: 'bg-success/5 dark:bg-success/5',
    text: 'text-success',
    textDark: 'text-success-focus dark:text-success',
    shadow: 'hover:shadow-success/5',
  },
  RARE: {
    border: 'border-primary/20 dark:border-primary/10',
    bg: 'bg-primary/5 dark:bg-primary/5',
    text: 'text-primary',
    textDark: 'text-primary-focus dark:text-primary',
    shadow: 'hover:shadow-primary/5',
  },
  EPIC: {
    border: 'border-purple-200 dark:border-purple-900/30',
    bg: 'bg-purple-500/5 dark:bg-purple-500/5',
    text: 'text-purple-500',
    textDark: 'text-purple-600 dark:text-purple-400',
    shadow: 'hover:shadow-purple-500/5',
  },
  LEGENDARY: {
    border: 'border-warning/30 dark:border-warning/15',
    bg: 'bg-warning/5 dark:bg-warning/5',
    text: 'text-warning',
    textDark: 'text-warning-focus dark:text-warning',
    shadow: 'hover:shadow-warning/10',
  },
};

type ChallengeTabKey = 'active' | 'past' | 'badges';

const VALID_CHALLENGE_TABS: ChallengeTabKey[] = ['active', 'past', 'badges'];

const isValidChallengeTab = (tab: string | null): tab is ChallengeTabKey => {
  return VALID_CHALLENGE_TABS.includes(tab as ChallengeTabKey);
};

export const Challenges: React.FC = () => {
  const {
    profile,
    challenges,
    allBadges,
    fetchProfile,
    fetchChallenges,
    joinChallenge,
    cancelChallenge,
    isLoading: storeLoading,
    error: storeError,
  } = useGamificationStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<ChallengeTabKey>(
    isValidChallengeTab(tabParam) ? tabParam : 'active'
  );

  useEffect(() => {
    if (isValidChallengeTab(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (tab: ChallengeTabKey) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  
  // Local feedback states
  const [localLoadingId, setLocalLoadingId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLocalError(null);
      await Promise.all([fetchProfile(), fetchChallenges()]);
    } catch {
      setLocalError('Failed to synchronize challenge data.');
    }
  }, [fetchProfile, fetchChallenges]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Accept Invitation
  const handleJoin = async (id: string, name: string) => {
    setLocalLoadingId(id);
    setLocalError(null);
    setLocalSuccess(null);
    try {
      const success = await joinChallenge(id);
      if (success) {
        setLocalSuccess(`You joined "${name}"! Good luck!`);
        await loadData();
      } else {
        setLocalError(storeError || 'Failed to join the challenge.');
      }
    } catch {
      setLocalError('Failed to join challenge. Please try again.');
    } finally {
      setLocalLoadingId(null);
    }
  };

  // Handle Cancel Challenge
  const handleCancelConfirm = async () => {
    if (!cancellingId) return;
    const targetId = cancellingId;
    setCancellingId(null);
    setLocalLoadingId(targetId);
    setLocalError(null);
    setLocalSuccess(null);
    
    try {
      const success = await cancelChallenge(targetId);
      if (success) {
        setLocalSuccess('Challenge successfully cancelled.');
        await loadData();
      } else {
        setLocalError(storeError || 'Failed to cancel the challenge.');
      }
    } catch {
      setLocalError('Failed to cancel challenge. Please try again.');
    } finally {
      setLocalLoadingId(null);
    }
  };

  // Separate lists
  const activeChallenges = challenges.filter(
    (c) => c.status === 'ACTIVE' && c.myStatus !== 'pending'
  );
  const pendingChallenges = challenges.filter(
    (c) => c.status === 'ACTIVE' && c.myStatus === 'pending'
  );
  const pastChallenges = challenges.filter(
    (c) => c.status === 'COMPLETED' || c.status === 'CANCELLED'
  );

  const renderBadgeRarity = (rarity: string) => {
    return (
      <span className="text-[9px] font-bold tracking-wider uppercase opacity-85">
        {rarity}
      </span>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-8 animate-fadeIn">
      {/* Upper header section with points and streak summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border/40 pb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-8 h-8 text-primary" />
            Challenges & Rewards
          </h1>
          <p className="text-muted text-sm mt-1">
            Build saving habits, challenge your friends, and collect rare achievements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Quick Score card */}
          {profile && (
            <div className="flex items-center gap-6 bg-surface border border-border-subtle p-3.5 px-5 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-warning fill-warning/20 animate-pulse" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Score</p>
                  <p className="text-lg font-display font-bold text-foreground">{profile.totalPoints} pts</p>
                </div>
              </div>

              <div className="h-8 w-px bg-border/40" />

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary fill-primary/20" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Streak</p>
                  <p className="text-lg font-display font-bold text-foreground">
                    {profile.currentStreak} {profile.currentStreak === 1 ? 'day' : 'days'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <Button onClick={() => setIsCreateOpen(true)} size="md" className="h-[52px]">
            <Plus className="w-5 h-5" />
            Challenge Friends
          </Button>
        </div>
      </div>

      {/* Local Feedback Alerts */}
      {localError && (
        <div className="flex items-center gap-3 p-4 bg-error/10 border border-error/20 text-error rounded-xl text-sm max-w-2xl animate-slideDownIn">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{localError}</span>
        </div>
      )}

      {localSuccess && (
        <div className="flex items-center gap-3 p-4 bg-success/10 border border-success/20 text-success rounded-xl text-sm max-w-2xl animate-slideDownIn">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span>{localSuccess}</span>
        </div>
      )}

      {/* Tabs Layout */}
      <div className="space-y-6">
        <div className="flex border-b border-border/40 gap-6" role="tablist" aria-label="Challenges tabs">
          <button
            onClick={() => handleTabChange('active')}
            id="tab-active"
            role="tab"
            aria-selected={activeTab === 'active'}
            aria-controls="panel-active"
            className={`pb-4 text-sm font-semibold tracking-wide border-b-2 transition-all relative ${
              activeTab === 'active'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            Active Challenges
            {pendingChallenges.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-[10px] font-extrabold bg-primary text-white rounded-full">
                {pendingChallenges.length}
              </span>
            )}
          </button>
          
          <button
            onClick={() => handleTabChange('past')}
            id="tab-past"
            role="tab"
            aria-selected={activeTab === 'past'}
            aria-controls="panel-past"
            className={`pb-4 text-sm font-semibold tracking-wide border-b-2 transition-all ${
              activeTab === 'past'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            Past Challenges
          </button>

          <button
            onClick={() => handleTabChange('badges')}
            id="tab-badges"
            role="tab"
            aria-selected={activeTab === 'badges'}
            aria-controls="panel-badges"
            className={`pb-4 text-sm font-semibold tracking-wide border-b-2 transition-all ${
              activeTab === 'badges'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            Badges & Frames
          </button>
        </div>

        {/* Tab content */}
        {storeLoading && challenges.length === 0 ? (
          /* Initial loading skeletons */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="container-card p-6 space-y-4 animate-pulse">
                <div className="flex justify-between items-center">
                  <div className="h-4 w-24 bg-surface-hover rounded" />
                  <div className="h-6 w-16 bg-surface-hover rounded-full" />
                </div>
                <div className="h-6 w-48 bg-surface-hover rounded" />
                <div className="h-3 w-full bg-surface-hover rounded" />
                <div className="h-10 bg-surface-hover rounded-xl" />
              </div>
            ))}
          </div>
        ) : (
          <div>
            {/* ACTIVE TAB */}
            {activeTab === 'active' && (
              <div className="space-y-8" role="tabpanel" id="panel-active" aria-labelledby="tab-active">
                {/* ── Pending Invitations Segment ── */}
                {pendingChallenges.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Pending Invitations
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {pendingChallenges.map((challenge) => {
                        const Icon = typeIcons[challenge.type] || Trophy;
                        return (
                          <div
                            key={challenge.id}
                            className="container-card border-primary/20 bg-primary/5 p-6 flex flex-col justify-between hover:border-primary/40 transition-all duration-300 relative overflow-hidden group"
                          >
                            <div className="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                              Invite
                            </div>
                            
                            <div>
                              <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                                  <Icon className="w-6 h-6 text-primary" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h4 className="text-base font-display font-semibold text-foreground truncate">
                                    {challenge.name || typeLabels[challenge.type]}
                                  </h4>
                                  <p className="text-xs text-muted mt-1 leading-relaxed">
                                    {challenge.description || `Budget challenge: ${typeLabels[challenge.type]}`}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-5 space-y-2.5">
                                <div className="flex items-center gap-2 text-xs text-muted font-medium">
                                  <Calendar className="w-4 h-4 text-primary" />
                                  <span>
                                    Starts:{' '}
                                    {new Date(challenge.startDate).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                    })}{' '}
                                    — Ends:{' '}
                                    {new Date(challenge.endDate).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 text-xs text-muted font-medium">
                                  <Users className="w-4 h-4 text-secondary" />
                                  <span>{challenge.participantCount} invited participants</span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-6 pt-4 border-t border-border-subtle flex items-center justify-between gap-4">
                              <span className="text-[10px] font-semibold text-primary/80 bg-primary/10 px-2 py-0.5 rounded">
                                Join window open
                              </span>
                              <Button
                                size="sm"
                                isLoading={localLoadingId === challenge.id}
                                onClick={() => handleJoin(challenge.id, challenge.name || typeLabels[challenge.type])}
                              >
                                Accept Invite
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Active & Ongoing Segment ── */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Ongoing Challenges
                  </h3>

                  {activeChallenges.length === 0 ? (
                    /* Empty state */
                    <div className="container-card p-12 text-center flex flex-col items-center max-w-xl mx-auto space-y-4">
                      <div className="w-16 h-16 rounded-2xl bg-surface-hover flex items-center justify-center border border-border/30">
                        <Trophy className="w-8 h-8 text-muted" />
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold text-foreground">No Ongoing Challenges</h4>
                        <p className="text-xs text-muted mt-1.5 leading-relaxed">
                          You don't have any active saving challenges running right now. Invite friends to keep budgets together!
                        </p>
                      </div>
                      <Button onClick={() => setIsCreateOpen(true)} size="sm" className="mt-2">
                        <Plus className="w-4 h-4" />
                        Challenge Friends
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {activeChallenges.map((challenge) => {
                        const Icon = typeIcons[challenge.type] || Trophy;
                        const start = new Date(challenge.startDate);
                        const end = new Date(challenge.endDate);
                        const now = new Date();

                        // Duration calculations
                        const totalDays = Math.max(
                          1,
                          Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
                        );
                        const daysElapsed = Math.max(
                          0,
                          Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
                        );
                        const currentDay = Math.min(daysElapsed, totalDays);
                        const pct = Math.min((currentDay / totalDays) * 100, 100);

                        const isFailed = challenge.myStatus === 'failed';
                        const isCreator = challenge.isCreator;

                        let statusBg = 'bg-success/10 border-success/20 text-success';
                        let statusText = 'On Track';
                        let barColor = 'bg-success';

                        if (isFailed) {
                          statusBg = 'bg-error/10 border-error/20 text-error';
                          statusText = 'Failed';
                          barColor = 'bg-error';
                        } else if (challenge.daysRemaining === 0) {
                          statusBg = 'bg-warning/10 border-warning/20 text-warning';
                          statusText = 'Ending Today';
                          barColor = 'bg-warning';
                        }

                        return (
                          <div
                            key={challenge.id}
                            className={`container-card p-6 flex flex-col justify-between hover:border-border transition-all duration-300 ${
                              isFailed ? 'border-error/20 bg-error/5 hover:border-error/30' : ''
                            }`}
                          >
                            <div>
                              {/* Header */}
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-1.5">
                                  <Trophy className="w-4 h-4 text-primary" />
                                  <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                                    {challenge.type === 'CUSTOM' ? 'Custom' : 'Standard'}
                                  </span>
                                </div>

                                <div className={`text-[10px] font-bold px-2 py-0.5 rounded border ${statusBg}`}>
                                  {statusText}
                                </div>
                              </div>

                              {/* Title Info */}
                              <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-xl bg-surface border border-border/40 flex items-center justify-center shrink-0">
                                  <Icon className="w-6 h-6 text-foreground" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h4 className="text-base font-display font-semibold text-foreground truncate">
                                    {challenge.name || typeLabels[challenge.type]}
                                  </h4>
                                  <p className="text-xs text-muted mt-1 leading-snug">
                                    {challenge.description || `Stay within budget limits.`}
                                  </p>
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="mt-5">
                                <div className="w-full h-1.5 bg-surface-hover rounded-full overflow-hidden border border-border-subtle">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>

                                <div className="flex justify-between mt-2 text-xs font-medium text-foreground">
                                  <span>
                                    Day {currentDay} of {totalDays}
                                  </span>
                                  <span className="text-muted flex items-center gap-1 text-[11px]">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {challenge.daysRemaining} {challenge.daysRemaining === 1 ? 'day' : 'days'} left
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Footer / Participants */}
                            <div className="mt-6 pt-4 border-t border-border-subtle flex items-center justify-between">
                              <div className="flex items-center -space-x-1.5">
                                {challenge.participants.filter(p => p.accepted).slice(0, 4).map((p) => {
                                  const name = p.displayName || p.username || 'User';
                                  return (
                                    <div
                                      key={p.userId}
                                      className="relative group/avatar cursor-help"
                                      title={`${name}${p.failedAt ? ' (Failed)' : ' (On Track)'}`}
                                    >
                                      <Avatar
                                        src={p.avatarUrl}
                                        name={name}
                                        size="xs"
                                        className={`border-2 border-surface shadow-sm ${
                                          p.failedAt ? 'ring-2 ring-error opacity-60' : 'ring-2 ring-success'
                                        }`}
                                      />
                                    </div>
                                  );
                                })}
                                {challenge.participants.filter(p => p.accepted).length > 4 && (
                                  <div className="w-6 h-6 rounded-xl bg-surface border border-border-subtle flex items-center justify-center text-[10px] font-bold text-muted shadow-sm select-none z-10">
                                    +{challenge.participants.filter(p => p.accepted).length - 4}
                                  </div>
                                )}
                              </div>

                              {isCreator && (
                                <button
                                  type="button"
                                  onClick={() => setCancellingId(challenge.id)}
                                  disabled={localLoadingId === challenge.id}
                                  className="text-xs text-muted hover:text-error transition-colors flex items-center gap-1 font-semibold cursor-pointer py-1 px-2 rounded-lg hover:bg-error/5"
                                  title="Cancel challenge for everyone"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Cancel
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PAST TAB */}
            {activeTab === 'past' && (
              <div className="space-y-4" role="tabpanel" id="panel-past" aria-labelledby="tab-past">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Past Challenges History
                </h3>

                {pastChallenges.length === 0 ? (
                  <div className="container-card p-12 text-center flex flex-col items-center max-w-xl mx-auto space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-surface-hover flex items-center justify-center border border-border/30">
                      <Calendar className="w-8 h-8 text-muted" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-foreground">No Historical Data</h4>
                      <p className="text-xs text-muted mt-1.5 leading-relaxed">
                        You haven't completed or cancelled any challenges yet. Keep budgeting!
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-85">
                    {pastChallenges.map((challenge) => {
                      const Icon = typeIcons[challenge.type] || Trophy;
                      const isCancelled = challenge.status === 'CANCELLED';
                      const myStatus = challenge.myStatus;

                      let statusBadge = (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-border/30 bg-surface text-muted">
                          Cancelled
                        </span>
                      );

                      if (!isCancelled) {
                        statusBadge =
                          myStatus === 'completed' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-success/20 bg-success/10 text-success">
                              Success
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-error/20 bg-error/10 text-error">
                              Failed
                            </span>
                          );
                      }

                      return (
                        <div
                          key={challenge.id}
                          className="container-card p-6 bg-surface/50 border-border-subtle hover:border-border transition-all duration-300"
                        >
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                              {typeLabels[challenge.type]}
                            </span>
                            {statusBadge}
                          </div>

                          <div className="flex items-start gap-4">
                            <div className="w-11 h-11 rounded-xl bg-surface border border-border-subtle flex items-center justify-center shrink-0">
                              <Icon className="w-5 h-5 text-muted" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-semibold text-foreground truncate">
                                {challenge.name}
                              </h4>
                              <p className="text-xs text-muted mt-1 truncate">
                                {challenge.description}
                              </p>
                            </div>
                          </div>

                          <div className="mt-5 pt-3 border-t border-border/30 flex items-center justify-between text-xs text-muted font-medium">
                            <span>
                              Ended:{' '}
                              {new Date(challenge.endDate).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                            
                            <div className="flex items-center -space-x-1">
                              {challenge.participants.map((p) => {
                                const name = p.displayName || p.username || 'User';
                                return (
                                  <div
                                    key={p.userId}
                                    title={`${name}${p.completedAt ? ' (Completed)' : p.failedAt ? ' (Failed)' : ''}`}
                                  >
                                    <Avatar
                                      src={p.avatarUrl}
                                      name={name}
                                      size="xs"
                                      className={`border-2 border-surface ${
                                        p.completedAt ? 'ring-1 ring-success' : p.failedAt ? 'ring-1 ring-error opacity-60' : ''
                                      }`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* BADGES TAB */}
            {activeTab === 'badges' && (
              <div className="space-y-10" role="tabpanel" id="panel-badges" aria-labelledby="tab-badges">
                {/* Badges Grid */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    Unlocked Badges
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {allBadges.map((badge) => {
                      const colors = rarityColors[badge.rarity] || rarityColors.COMMON;
                      
                      return (
                        <div
                          key={badge.id}
                          className={`
                            container-card p-5 flex flex-col items-center text-center transition-all duration-300 relative group
                            ${colors.border} ${colors.bg} ${colors.shadow}
                            ${badge.unlocked ? 'opacity-100 scale-100 hover:scale-[1.02]' : 'opacity-70 dark:opacity-50'}
                          `}
                        >
                          {/* Locked Cover overlay */}
                          {!badge.unlocked && (
                            <div className="absolute inset-0 bg-background/50 dark:bg-background/60 backdrop-blur-[0.5px] rounded-xl flex items-center justify-center z-10">
                              <div className="p-2 bg-surface border border-border rounded-xl text-muted shadow-sm">
                                <Lock className="w-4 h-4" />
                              </div>
                            </div>
                          )}

                          {/* Badge Icon */}
                          <div className={`
                            w-14 h-14 rounded-2xl flex items-center justify-center mb-3.5 border shadow-sm text-2xl select-none
                            ${badge.unlocked ? 'bg-background border-border-subtle' : 'bg-surface border-border filter grayscale'}
                          `}>
                            {badge.iconUrl || '🏆'}
                          </div>

                          {/* Badge Name & Info */}
                          <p className="text-sm font-semibold text-foreground mb-0.5 truncate w-full">
                            {badge.name}
                          </p>

                          <div className={`mt-1 mb-2 px-2 py-0.5 rounded-md inline-block text-[9px] font-bold ${
                            badge.unlocked ? `${colors.bg} ${colors.textDark}` : 'bg-surface text-muted'
                          }`}>
                            {renderBadgeRarity(badge.rarity)}
                          </div>

                          <p className="text-[11px] text-muted leading-snug w-full line-clamp-2 px-1">
                            {badge.description}
                          </p>

                          {badge.unlocked && badge.unlockedAt && (
                            <p className="text-[10px] text-success font-semibold mt-3 flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Unlocked{' '}
                              {new Date(badge.unlockedAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </p>
                          )}

                          {!badge.unlocked && (
                            <p className="text-[10px] text-muted font-bold mt-3">
                              +{badge.pointsAwarded} points
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Avatar Frame Selection Segment */}
                <div className="border-t border-border/40 pt-8">
                  <FramePicker />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Dialog Modal for cancelling challenges */}
      {cancellingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCancellingId(null)} />
          <div className="relative w-full max-w-sm bg-surface border border-border p-6 rounded-2xl shadow-xl animate-scaleIn m-4">
            <h3 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-error" />
              Cancel Challenge?
            </h3>
            <p className="text-xs text-muted mt-2 leading-relaxed">
              Are you sure you want to cancel this challenge? Doing so will cancel the challenge for all participating friends as well. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <Button variant="ghost" size="sm" onClick={() => setCancellingId(null)}>
                Keep Challenge
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCancelConfirm}
                className="bg-error hover:bg-error/90 text-white"
              >
                Cancel Challenge
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Creation Modal */}
      <CreateChallengeModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => {
          setIsCreateOpen(false);
          setLocalSuccess('Challenge launched successfully!');
          loadData();
          setTimeout(() => setLocalSuccess(null), 4000);
        }}
      />
    </div>
  );
};

export default Challenges;
