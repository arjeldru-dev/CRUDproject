import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGamificationStore } from '../store/gamificationStore';
import type { ChallengeWithDetails } from '../store/gamificationStore';
import FramePicker from '../components/gamification/FramePicker';
import CreateChallengeModal from '../components/gamification/CreateChallengeModal';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import api from '../lib/api';
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
  Plus,
  Trash2,
  Lock,
  Shield,
  Check,
  AlertCircle,
  Swords,
  Star,
  X,
  Footprints,
  Handshake,
  Sprout,
  Flame,
  Zap,
  Crown,
  Gem,
  Coins,
  Sparkles,
  Map,
  Wrench,
  Mountain,
  Medal,
  Heart,
  CreditCard,
  Landmark,
  LineChart,
} from 'lucide-react';

const typeIcons: Record<string, React.FC<{ className?: string }>> = {
  NO_OVERSPEND_WEEK: Trophy,
  NO_OVERSPEND_MONTH: Trophy,
  COFFEE_FREE_WEEK: Coffee,
  TRANSPORT_SAVER: Car,
  CUSTOM: Trophy,
};

const badgeIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  first_expense: Footprints,
  first_settle: Handshake,
  streak_3: Sprout,
  streak_7: Flame,
  streak_14: Zap,
  streak_30: Crown,
  streak_100: Gem,
  budget_under_50: Coins,
  challenge_creator_1: Sparkles,
  challenge_creator_5: Map,
  challenge_creator_10: Landmark,
  challenge_no_overspend_week: Calendar,
  challenge_coffee_free: Coffee,
  challenge_transport_saver: Car,
  challenge_custom_complete: Wrench,
  challenge_no_overspend_month: Mountain,
  challenge_complete: Trophy,
  challenge_3: Medal,
  challenge_5: Award,
  challenge_10: Zap,
  challenge_25: Shield,
  challenge_last_standing: Swords,
  challenge_perfect_group: Users,
  social_butterfly: Heart,
  social_champion: Crown,
  top_up_master: CreditCard,
  top_up_grandmaster: Landmark,
  peacemaker_elite: Handshake,
  expense_veteran: LineChart,
  streak_60: Star,
};

const getIconColorClass = (rarity: string) => {
  switch (rarity) {
    case 'COMMON':
      return 'text-zinc-500 dark:text-white';
    case 'UNCOMMON':
      return 'text-success';
    case 'RARE':
      return 'text-primary';
    case 'EPIC':
      return 'text-indigo-600 dark:text-indigo-400';
    case 'LEGENDARY':
      return 'text-warning';
    default:
      return 'text-muted';
  }
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
    border: 'border-border',
    bg: 'bg-surface-hover/30',
    text: 'text-muted',
    textDark: 'text-muted',
    shadow: 'hover:shadow-sm',
  },
  UNCOMMON: {
    border: 'border-success/20 dark:border-success/15',
    bg: 'bg-success/5',
    text: 'text-success',
    textDark: 'text-success',
    shadow: 'hover:shadow-success/5',
  },
  RARE: {
    border: 'border-primary/20 dark:border-primary/15',
    bg: 'bg-primary/5',
    text: 'text-primary',
    textDark: 'text-primary',
    shadow: 'hover:shadow-primary/5',
  },
  EPIC: {
    border: 'border-indigo-500/20 dark:border-indigo-400/15',
    bg: 'bg-indigo-500/5 dark:bg-indigo-400/5',
    text: 'text-indigo-600 dark:text-indigo-400',
    textDark: 'text-indigo-600 dark:text-indigo-400',
    shadow: 'hover:shadow-indigo-500/5',
  },
  LEGENDARY: {
    border: 'border-warning/20 dark:border-warning/15',
    bg: 'bg-warning/5',
    text: 'text-warning',
    textDark: 'text-warning',
    shadow: 'hover:shadow-warning/5',
  },
};

interface Friend {
  friendId: string;
  friendUserId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

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
    leaderboard,
    fetchProfile,
    fetchChallenges,
    fetchLeaderboard,
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

  // Friends for sidebar & dueling
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [selectedDuelFriendId, setSelectedDuelFriendId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

  // Mount status for animation transitions
  const [isMounted, setIsMounted] = useState(false);

  const getChallengePercentage = (challenge: ChallengeWithDetails) => {
    const start = new Date(challenge.startDate);
    const end = new Date(challenge.endDate);
    const now = new Date();
    const total = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const elapsed = Math.max(0, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const current = Math.min(elapsed, total);
    return Math.min((current / total) * 100, 100);
  };

  const loadData = useCallback(async () => {
    try {
      setLocalError(null);
      await Promise.all([fetchProfile(), fetchChallenges(), fetchLeaderboard()]);
    } catch {
      setLocalError('Failed to synchronize challenge data.');
    }
  }, [fetchProfile, fetchChallenges, fetchLeaderboard]);

  const fetchFriends = useCallback(async () => {
    setFriendsLoading(true);
    try {
      const res = await api.get('/friends/list');
      if (res.data?.friends) {
        setFriends(res.data.friends);
      }
    } catch (err) {
      console.error('Failed to load friends list', err);
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    fetchFriends();
    setIsMounted(true);
  }, [loadData, fetchFriends]);

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
  const activeChallenges = useMemo(() => challenges.filter(
    (c) => c.status === 'ACTIVE' && c.myStatus !== 'pending'
  ), [challenges]);
  const pendingChallenges = useMemo(() => challenges.filter(
    (c) => c.status === 'ACTIVE' && c.myStatus === 'pending'
  ), [challenges]);
  const pastChallenges = useMemo(() => challenges.filter(
    (c) => c.status === 'COMPLETED' || c.status === 'CANCELLED'
  ), [challenges]);

  const renderBadgeRarity = (rarity: string) => {
    return (
      <span className="text-[9px] font-bold tracking-wider uppercase opacity-85">
        {rarity}
      </span>
    );
  };

  // Level & XP math
  const totalPoints = profile?.totalPoints || 0;
  const computedLevel = Math.floor(totalPoints / 100) + 1;
  const currentXP = totalPoints % 100;
  const nextLevelXP = 100;

  const renderSidebar = (isMobile = false) => {
    const cardPadding = isMobile ? '16px' : '24px';
    return (
      <div className="flex flex-col gap-4">
        {/* Gamification Level & XP Card */}
        <div 
          className="bg-surface rounded-2xl shadow-sm animate-slideUpIn" 
          style={{ padding: cardPadding, animationDelay: '160ms' }}
        >
          {/* Header Section */}
          <div className={`flex items-center justify-between gap-4 ${isMobile ? 'mb-4' : 'mb-5'}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Star className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h4 className="font-display text-sm font-bold text-foreground">Pro Saver</h4>
                <p className="font-mono text-[9px] text-primary font-black uppercase tracking-widest mt-0.5">
                  Streak: {profile?.currentStreak || 0} days
                </p>
              </div>
            </div>
            
            <div className="bg-primary/5 border border-primary/15 rounded-lg px-2.5 py-1 text-[10px] font-black text-primary uppercase tracking-wider font-mono shrink-0">
              {leaderboard.find(e => e.isCurrentUser)?.rank 
                ? `Rank #${leaderboard.find(e => e.isCurrentUser)?.rank}` 
                : 'Unranked'}
            </div>
          </div>

          <div className={isMobile ? 'space-y-4' : 'space-y-5'}>
            {/* XP progress inside level */}
            <div className="bg-background p-3.5 rounded-none">
              <div className="flex justify-between items-center mb-2">
                <p className="font-display text-xs font-semibold text-foreground">Level <span className="font-mono">{computedLevel}</span></p>
                <p className="font-mono text-[11px] text-muted">{currentXP} / {nextLevelXP} XP</p>
              </div>
              <div className="w-full h-2 bg-surface rounded-none border border-border-subtle overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-1000 rounded-none"
                  style={{ width: `${(currentXP / nextLevelXP) * 100}%` }}
                />
              </div>
            </div>

            {/* Achievements summary list */}
            <div className="space-y-2.5">
              <h5 className="font-display text-[11px] font-black text-muted uppercase tracking-wider">Recent achievements</h5>
              <div className="flex gap-2">
                {allBadges.filter(b => b.unlocked).slice(0, 4).map((badge) => {
                  const IconComponent = badgeIconMap[badge.slug] || Award;
                  const colorClass = getIconColorClass(badge.rarity);
                  return (
                    <div
                      key={badge.id}
                      className={`w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center shadow-sm ${colorClass}`}
                      title={badge.name}
                    >
                      <IconComponent className="w-5 h-5" />
                    </div>
                  );
                })}
                {/* Empty state slots */}
                {[...Array(Math.max(0, 4 - allBadges.filter(b => b.unlocked).length))].map((_, i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded-xl border border-dashed border-border flex items-center justify-center text-muted opacity-45"
                    title="Locked badge slot"
                  >
                    <Lock className="w-4 h-4" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Active Barkadas / Friends List Sidebar widget */}
        <div 
          className="bg-surface rounded-2xl shadow-sm animate-slideUpIn" 
          style={{ padding: cardPadding, animationDelay: '220ms' }}
        >
          <h4 className="font-display text-sm font-bold text-foreground mb-4">Active Barkadas</h4>
          
          {friendsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-surface-hover" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-24 bg-surface-hover rounded" />
                    <div className="h-2.5 w-16 bg-surface-hover rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : friends.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted font-sans">
              No active friends. Go to the Friends page to connect!
            </div>
          ) : (
            <div className="space-y-4">
              {friends.slice(0, 5).map((friend) => {
                const leaderboardFriend = leaderboard.find(
                  (entry) => entry.userId === (friend.friendUserId || friend.friendId)
                );
                const isStreak = leaderboardFriend ? leaderboardFriend.currentStreak > 0 : false;
                const name = friend.displayName || friend.username || 'Friend';
                return (
                  <div key={friend.friendId} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <Avatar
                          src={friend.avatarUrl}
                          name={name}
                          size="sm"
                          className="border border-white dark:border-background"
                        />
                        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border border-white dark:border-background ${
                          isStreak ? 'bg-success' : 'bg-muted'
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-display text-xs font-semibold text-foreground truncate">{name}</p>
                        <p className={`font-display text-[9px] font-black uppercase tracking-wider mt-0.5 ${
                          isStreak ? 'text-success' : 'text-muted'
                        }`}>
                          {isStreak ? `${leaderboardFriend?.currentStreak}d Streak` : 'Idle'}
                        </p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        setSelectedDuelFriendId(friend.friendUserId || friend.friendId);
                        setIsCreateOpen(true);
                        if (isMobile) setIsSidebarOpen(false);
                      }}
                      className="w-11 h-11 flex items-center justify-center text-muted hover:text-primary hover:bg-primary/5 dark:hover:bg-primary/10 rounded-xl transition-all cursor-pointer shrink-0 btn-active-tactile"
                      title={`Duel ${name}`}
                      aria-label={`Duel ${name}`}
                    >
                      <Swords className="w-4 h-4 shrink-0" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => {
              handleTabChange('badges');
              if (isMobile) setIsSidebarOpen(false);
            }}
            className="w-full mt-4 py-2.5 text-center font-display text-xs font-bold text-primary border border-primary/20 rounded-xl hover:bg-primary/5 cursor-pointer btn-active-tactile transition-[transform,background-color,border-color] duration-160 ease-out"
          >
            Unlock Avatar Frames
          </button>
        </div>

        {/* Desktop-Only Challenge Friends Button */}
        {!isMobile && (
          <Button
            onClick={() => {
              setSelectedDuelFriendId(null);
              setIsCreateOpen(true);
            }}
            size="md"
            className="w-full h-11 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary-hover btn-press transition-colors shrink-0 animate-slideUpIn"
            style={{ animationDelay: '280ms' }}
          >
            <Plus className="w-4 h-4 shrink-0 mr-1.5 inline-block" />
            <span>Challenge Friends</span>
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className={`w-full flex flex-col gap-2 animate-fadeIn ${isSidebarOpen ? 'relative z-[60]' : ''}`}>
      {/* ── Page Header ── */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-6 animate-slideUpIn" style={{ animationDelay: '0ms' }}>
        <div>
          <h1 className="font-display text-fluid-h1 font-bold tracking-tight text-foreground">
            Challenges & Rewards
          </h1>
          <p className="text-muted text-sm mt-1">
            Build saving habits, challenge your friends, and collect rare achievements.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full md:w-auto">
          {/* Mobile-Only Score Summary Strip */}
          <div className="flex lg:hidden w-full items-center justify-between bg-surface border border-border p-4.5 rounded-2xl shadow-sm">
            <div className="flex flex-col items-center justify-center flex-1">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Score</span>
              <span className="font-mono font-bold text-primary text-base">
                {profile?.totalPoints || 0} <span className="text-[10px] text-muted font-sans font-medium">pts</span>
              </span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex flex-col items-center justify-center flex-1">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Streak</span>
              <span className="font-mono font-bold text-success text-base">
                {profile?.currentStreak || 0} <span className="text-[10px] text-muted font-sans font-medium">days</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              onClick={() => setIsSidebarOpen(true)}
              variant="outline"
              size="md"
              className="flex-1 sm:flex-none h-11 border-border rounded-lg font-semibold text-sm hover:bg-surface-hover btn-press transition-colors shrink-0 px-4 lg:hidden"
            >
              <Star className="w-4 h-4 shrink-0 text-warning mr-1.5" />
              <span>Stats</span>
            </Button>

            <Button
              onClick={() => {
                setSelectedDuelFriendId(null);
                setIsCreateOpen(true);
              }}
              size="md"
              className="flex-1 sm:flex-none h-11 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary-hover btn-press transition-colors shrink-0 px-4 lg:hidden"
            >
              <Plus className="w-5 h-5 shrink-0" />
              <span className="hidden sm:inline">Challenge Friends</span>
              <span className="sm:hidden">Challenge</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="w-full flex flex-col">
        {/* ── Feedback Alerts ── */}
      {localError && (
        <div className="mb-3 flex items-center justify-between gap-3 p-4 bg-error/10 border border-error/20 text-error rounded-2xl text-sm max-w-2xl animate-slideDownIn">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{localError}</span>
          </div>
          <button
            onClick={() => setLocalError(null)}
            className="p-1 hover:bg-error/10 rounded-full transition-colors cursor-pointer shrink-0"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {localSuccess && (
        <div className="mb-3 flex items-center justify-between gap-3 p-4 bg-success/10 border border-success/20 text-success rounded-2xl text-sm max-w-2xl animate-slideDownIn">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span>{localSuccess}</span>
          </div>
          <button
            onClick={() => setLocalSuccess(null)}
            className="p-1 hover:bg-success/10 rounded-full transition-colors cursor-pointer shrink-0"
            aria-label="Dismiss success"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Tabs selector pill row ── */}
      <div className="bg-surface rounded-[var(--radius-lg)] p-1 flex overflow-x-auto no-scrollbar flex-nowrap gap-1 w-full sm:w-auto shadow-sm animate-slideUpIn" role="tablist" aria-label="Challenges sections" style={{ animationDelay: '40ms' }}>
        <button
          onClick={() => handleTabChange('active')}
          id="tab-active"
          role="tab"
          aria-selected={activeTab === 'active'}
          aria-controls="panel-active"
          className={`
            px-4 py-2 rounded-[var(--radius-md)] flex items-center gap-2 text-sm font-semibold transition-colors duration-150 cursor-pointer select-none btn-press shrink-0
            ${activeTab === 'active'
              ? 'bg-primary text-white'
              : 'text-muted hover:text-foreground hover:bg-surface-hover'
            }
          `}
        >
          <span>Active Challenges</span>
          {pendingChallenges.length > 0 && (
            <span className={`
              min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center font-mono
              ${activeTab === 'active' ? 'bg-white/20 text-white' : 'bg-error text-white'}
            `}>
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
          className={`
            px-4 py-2 rounded-[var(--radius-md)] flex items-center gap-2 text-sm font-semibold transition-colors duration-150 cursor-pointer select-none btn-press shrink-0
            ${activeTab === 'past'
              ? 'bg-primary text-white'
              : 'text-muted hover:text-foreground hover:bg-surface-hover'
            }
          `}
        >
          <span>Past History</span>
        </button>

        <button
          onClick={() => handleTabChange('badges')}
          id="tab-badges"
          role="tab"
          aria-selected={activeTab === 'badges'}
          aria-controls="panel-badges"
          className={`
            px-4 py-2 rounded-[var(--radius-md)] flex items-center gap-2 text-sm font-semibold transition-colors duration-150 cursor-pointer select-none btn-press shrink-0
            ${activeTab === 'badges'
              ? 'bg-primary text-white'
              : 'text-muted hover:text-foreground hover:bg-surface-hover'
            }
          `}
        >
          <span>Badges & Frames</span>
        </button>
      </div>

      {/* ── Grid Container ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 items-start" style={{ marginTop: '12px' }}>
        {/* Left main content block */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {storeLoading && challenges.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="bg-surface border border-border p-6 rounded-lg space-y-4 animate-pulse">
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-24 bg-surface-hover rounded" />
                    <div className="h-6 w-16 bg-surface-hover rounded-full" />
                  </div>
                  <div className="h-6 w-48 bg-surface-hover rounded" />
                  <div className="h-2 w-full bg-surface-hover rounded-full" />
                  <div className="h-10 bg-surface-hover rounded-xl" />
                </div>
              ))}
            </div>
          ) : (
            <div>
              {/* ACTIVE TAB */}
              {activeTab === 'active' && (
                <div className="flex flex-col gap-4" role="tabpanel" id="panel-active" aria-labelledby="tab-active">
                  {/* ── Pending Invitations Segment ── */}
                  {pendingChallenges.length > 0 && (
                    <div className="space-y-4">
                      <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                        <Clock className="w-5 h-5 text-warning" />
                        Pending Invitations
                      </h2>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                        {pendingChallenges.map((challenge, index) => {
                          const Icon = typeIcons[challenge.type] || Trophy;
                          return (
                            <div
                              key={challenge.id}
                              className="bg-surface rounded-2xl shadow-sm hover:shadow-md transition-[transform,shadow,background-color] duration-200 ease-out relative group animate-slideUpIn hover:-translate-y-0.5 active:scale-[0.99]"
                              style={{ padding: '24px', animationDelay: `${index * 60 + 100}ms` }}
                            >
                              <div className="absolute top-6 right-6 bg-primary/10 text-primary text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                                Invite
                              </div>
                              
                              <div className="flex gap-4 mb-4">
                                <div className="w-14 h-14 rounded-2xl bg-background flex items-center justify-center shrink-0 border border-border">
                                  <Icon className="w-7 h-7 text-primary" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h3 className="font-display text-base font-bold text-foreground truncate">
                                    {challenge.name || typeLabels[challenge.type]}
                                  </h3>
                                  <p className="font-sans text-xs text-muted mt-1 leading-relaxed line-clamp-2">
                                    {challenge.description || `Budget challenge: ${typeLabels[challenge.type]}`}
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 p-3 bg-background rounded-xl text-xs text-muted mb-6">
                                <div className="flex items-center gap-1.5 font-medium">
                                  <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                                  <span className="truncate font-mono">
                                    {new Date(challenge.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    {' - '}
                                    {new Date(challenge.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 font-medium">
                                  <Users className="w-3.5 h-3.5 text-secondary shrink-0" />
                                  <span className="truncate font-mono">{challenge.participantCount} users</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <button
                                  disabled={localLoadingId === challenge.id}
                                  onClick={() => handleJoin(challenge.id, challenge.name || typeLabels[challenge.type])}
                                  className="flex-1 py-2.5 bg-primary hover:bg-primary/95 text-white text-xs font-bold rounded-xl shadow-sm shadow-primary/10 hover:shadow-md btn-active-tactile transition-[transform,background-color] duration-160 ease-out"
                                >
                                  Accept Invite
                                </button>
                                <button
                                  disabled={localLoadingId === challenge.id}
                                  onClick={() => setCancellingId(challenge.id)}
                                  className="px-4 py-2.5 border border-border text-muted hover:bg-error/5 hover:text-error hover:border-error/25 text-xs font-bold rounded-xl btn-active-tactile transition-[transform,background-color,border-color] duration-160 ease-out"
                                >
                                  Decline
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Active & Ongoing Segment ── */}
                  <div className="space-y-4">
                    <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                      <Shield className="w-5 h-5 text-secondary" />
                      Ongoing Challenges
                    </h2>

                    {activeChallenges.length === 0 ? (
                      <div 
                        className="bg-surface rounded-2xl text-center flex flex-col items-center space-y-4 shadow-sm animate-fadeInFast"
                        style={{ padding: '24px' }}
                      >
                        <div className="w-16 h-16 rounded-2xl bg-background flex items-center justify-center border border-border">
                          <Trophy className="w-8 h-8 text-muted" />
                        </div>
                        <div>
                          <h3 className="font-display text-base font-bold text-foreground">No Ongoing Challenges</h3>
                          <p className="font-sans text-xs text-muted mt-1.5 leading-relaxed max-w-xs">
                            You don't have any active saving challenges running right now. Invite friends to keep budgets together!
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            setSelectedDuelFriendId(null);
                            setIsCreateOpen(true);
                          }}
                          size="sm"
                          className="mt-2 text-xs font-bold"
                        >
                          <Plus className="w-4 h-4" />
                          Challenge Friends
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 md:gap-6">
                        {activeChallenges.map((challenge, index) => {
                          const Icon = typeIcons[challenge.type] || Trophy;

                          const percentageValue = isMounted ? getChallengePercentage(challenge) : 0;

                          const isFailed = challenge.myStatus === 'failed';
                          const isCreator = challenge.isCreator;

                          let statusBg = 'bg-success/10 text-success border-success/20 dark:bg-success/10 dark:text-success dark:border-success/20';
                          let statusText = 'On Track';
                          let barColorClass = 'bg-gradient-to-r from-success to-success/60';

                          if (isFailed) {
                            statusBg = 'bg-error/10 text-error border-error/20 dark:bg-error/10 dark:text-error dark:border-error/20';
                            statusText = 'Failed';
                            barColorClass = 'bg-error';
                          } else if (challenge.daysRemaining === 0) {
                            statusBg = 'bg-warning/10 text-warning border-warning/20 dark:bg-warning/10 dark:text-warning dark:border-warning/20';
                            statusText = 'Ending Today';
                            barColorClass = 'bg-warning';
                          } else {
                            barColorClass = 'bg-primary';
                          }

                          return (
                            <div
                              key={challenge.id}
                              className={`bg-surface rounded-2xl shadow-sm border border-transparent transition-[transform,shadow,background-color] duration-200 ease-out flex flex-col justify-between animate-slideUpIn hover:-translate-y-0.5 active:scale-[0.99] hover:shadow-md ${
                                isFailed 
                                  ? 'bg-error/5 border-error/10' 
                                  : ''
                              }`}
                              style={{ padding: '24px', animationDelay: `${index * 60 + 100}ms` }}
                            >
                              <div>
                                {/* Header */}
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-1.5 text-muted font-bold text-[10px] tracking-wider uppercase font-display">
                                    <Trophy className="w-3.5 h-3.5 text-primary animate-scaleIn" />
                                    <span>{challenge.type === 'CUSTOM' ? 'Custom' : 'Standard'}</span>
                                  </div>

                                  <div className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusBg}`}>
                                    {statusText}
                                  </div>
                                </div>

                                {/* Title Info */}
                                <div className="flex items-start gap-4">
                                  <div className="w-12 h-12 rounded-xl bg-background border border-border flex items-center justify-center shrink-0">
                                    <Icon className="w-6 h-6 text-foreground" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h3 className="font-display text-base font-bold text-foreground truncate">
                                      {challenge.name || typeLabels[challenge.type]}
                                    </h3>
                                    <p className="font-sans text-xs text-muted mt-1 leading-snug line-clamp-2">
                                      {challenge.description || `Stay within budget limits.`}
                                    </p>
                                  </div>
                                </div>

                                {/* Progress bar */}
                                <div className="mt-6">
                                  <div
                                    className="w-full h-[5px] bg-background rounded-full overflow-hidden"
                                    role="progressbar"
                                    aria-valuenow={Math.round(percentageValue)}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-label="Challenge progress"
                                  >
                                    <div
                                      className={`h-full w-full rounded-full transition-transform duration-1000 ${barColorClass}`}
                                      style={{ transform: `scaleX(${Math.min(percentageValue, 100) / 100})`, transformOrigin: 'left' }}
                                    />
                                  </div>

                                  <div className="flex justify-between mt-2 text-xs font-semibold text-foreground">
                                    <span>
                                      Progress: <span className="font-mono">{Math.round(percentageValue)}%</span>
                                    </span>
                                    <span className="text-muted flex items-center gap-1 text-[11px] font-medium font-sans">
                                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                                      <span className="font-mono">{challenge.daysRemaining}</span> {challenge.daysRemaining === 1 ? 'day' : 'days'} left
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Footer / Participants */}
                              <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                                <div className="flex items-center -space-x-2">
                                  {challenge.participants.filter(p => p.accepted).slice(0, 4).map((p) => {
                                    const name = p.displayName || p.username || 'User';
                                    return (
                                      <div
                                        key={p.userId}
                                        className="relative group/avatar"
                                        title={`${name}${p.failedAt ? ' (Failed)' : ' (On Track)'}`}
                                      >
                                        <Avatar
                                          src={p.avatarUrl}
                                          name={name}
                                          size="xs"
                                          className={`border-2 border-white dark:border-surface shadow-sm shrink-0 ${
                                            p.failedAt ? 'ring-1 ring-error opacity-60' : 'ring-1 ring-success'
                                          }`}
                                        />
                                      </div>
                                    );
                                  })}
                                  {challenge.participants.filter(p => p.accepted).length > 4 && (
                                    <div className="w-7 h-7 rounded-full bg-background border-2 border-white dark:border-surface flex items-center justify-center text-[10px] font-black text-muted shadow-sm select-none z-10 font-mono">
                                      +{challenge.participants.filter(p => p.accepted).length - 4}
                                    </div>
                                  )}
                                </div>

                                {isCreator && (
                                  <button
                                    type="button"
                                    onClick={() => setCancellingId(challenge.id)}
                                    disabled={localLoadingId === challenge.id}
                                    className="text-xs text-muted hover:text-error transition-colors flex items-center gap-1 font-semibold cursor-pointer py-1.5 px-2.5 rounded-lg hover:bg-error/5 btn-active-tactile"
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
                  
                  {/* Tips Card */}
                  <section>
                    <div 
                      className="bg-surface rounded-2xl shadow-sm"
                      style={{ padding: '24px' }}
                    >
                      <h3 className="text-sm font-semibold text-foreground mb-2">Keep going</h3>
                      <p className="text-xs text-muted leading-relaxed">
                        Complete 3 challenges this week to unlock the "Budget Master" limited edition avatar frame.
                      </p>
                      <button
                        onClick={() => handleTabChange('badges')}
                        className="mt-3 px-4 py-2 bg-primary text-white rounded-md text-xs font-semibold hover:bg-primary-hover transition-colors cursor-pointer btn-press"
                      >
                        View Frames
                      </button>
                    </div>
                  </section>
                </div>
              )}

              {/* PAST TAB */}
              {activeTab === 'past' && (
                <div className="flex flex-col gap-4" role="tabpanel" id="panel-past" aria-labelledby="tab-past">
                  <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-muted" />
                    Past Challenges History
                  </h2>

                  {pastChallenges.length === 0 ? (
                    <div 
                      className="bg-surface rounded-2xl text-center flex flex-col items-center space-y-4 shadow-sm animate-fadeInFast"
                      style={{ padding: '24px' }}
                    >
                      <div className="w-16 h-16 rounded-2xl bg-background flex items-center justify-center border border-border">
                        <Calendar className="w-8 h-8 text-muted" />
                      </div>
                      <div>
                        <h3 className="font-display text-base font-bold text-foreground">No Historical Data</h3>
                        <p className="font-sans text-xs text-muted mt-1.5 leading-relaxed">
                          You haven't completed or cancelled any challenges yet. Keep budgeting!
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 md:gap-6 opacity-90">
                      {pastChallenges.map((challenge, index) => {
                        const Icon = typeIcons[challenge.type] || Trophy;
                        const isCancelled = challenge.status === 'CANCELLED';
                        const myStatus = challenge.myStatus;

                        let statusBadge = (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-border bg-background text-muted">
                            Cancelled
                          </span>
                        );

                        if (!isCancelled) {
                          statusBadge =
                            myStatus === 'completed' ? (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-success/20 bg-success/10 text-success">
                                Success
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-error/20 bg-error/10 text-error">
                                Failed
                              </span>
                            );
                        }

                        return (
                          <div
                            key={challenge.id}
                            className="bg-surface rounded-2xl shadow-sm transition-[transform,shadow,background-color] duration-200 ease-out animate-slideUpIn hover:-translate-y-0.5 active:scale-[0.99] hover:shadow-md"
                            style={{ padding: '24px', animationDelay: `${index * 60 + 100}ms` }}
                          >
                            <div className="flex items-center justify-between mb-4">
                              <span className="text-[10px] font-bold text-muted uppercase tracking-wider font-display">
                                {typeLabels[challenge.type]}
                              </span>
                              {statusBadge}
                            </div>

                            <div className="flex items-start gap-4">
                              <div className="w-11 h-11 rounded-xl bg-background border border-border flex items-center justify-center shrink-0">
                                <Icon className="w-5 h-5 text-muted" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="font-display text-sm font-semibold text-foreground truncate">
                                  {challenge.name}
                                </h4>
                                <p className="font-sans text-xs text-muted mt-1 truncate">
                                  {challenge.description}
                                </p>
                              </div>
                            </div>

                            <div className="mt-5 pt-3 border-t border-border flex items-center justify-between text-xs text-muted font-medium">
                              <span className="font-mono">
                                Ended:{' '}
                                {new Date(challenge.endDate).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                              
                              <div className="flex items-center -space-x-1.5">
                                {challenge.participants.slice(0, 4).map((p) => {
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
                                        className={`border-2 border-white dark:border-surface ${
                                          p.completedAt ? 'ring-1 ring-success' : p.failedAt ? 'ring-1 ring-error opacity-60' : ''
                                        }`}
                                      />
                                    </div>
                                  );
                                })}
                                {challenge.participants.length > 4 && (
                                  <div className="w-7 h-7 rounded-full bg-background border-2 border-white dark:border-surface flex items-center justify-center text-[10px] font-black text-muted shadow-sm select-none z-10 font-mono">
                                    +{challenge.participants.length - 4}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* BADGES & FRAMES TAB */}
              {activeTab === 'badges' && (
                <div className="flex flex-col gap-4" role="tabpanel" id="panel-badges" aria-labelledby="tab-badges">
                  {/* Badges Grid */}
                  <div className="space-y-4">
                    <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                      <Award className="w-5 h-5 text-primary" />
                      Unlocked Badges
                    </h2>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                      {allBadges.map((badge, index) => {
                        const colors = rarityColors[badge.rarity] || rarityColors.COMMON;
                        
                        return (
                          <div
                            key={badge.id}
                            className={`
                              bg-surface rounded-2xl flex flex-col items-center text-center transition-[transform,opacity,border-color,background-color] duration-200 ease-out relative group border animate-slideUpIn
                              ${colors.border} ${colors.shadow}
                              ${badge.unlocked ? 'opacity-100 scale-100 hover:scale-[1.02] active:scale-[0.99]' : 'opacity-65 dark:opacity-40'}
                            `}
                            style={{ padding: '20px', animationDelay: `${index * 40 + 100}ms` }}
                          >
                            {/* Locked Cover overlay */}
                            {!badge.unlocked && (
                              <div className="absolute inset-0 bg-background/40 dark:bg-background/60 backdrop-blur-[0.5px] rounded-2xl flex items-center justify-center z-10 font-sans">
                                <div className="p-2 bg-surface border border-border rounded-2xl text-muted shadow-sm">
                                  <Lock className="w-4 h-4 text-muted shrink-0" />
                                </div>
                              </div>
                            )}

                            {/* Badge Icon */}
                            <div className={`
                              w-14 h-14 rounded-2xl flex items-center justify-center mb-3.5 border border-border shadow-sm select-none shrink-0
                              ${badge.unlocked ? `bg-background ${getIconColorClass(badge.rarity)}` : 'bg-surface text-muted filter grayscale'}
                            `}>
                              {(() => {
                                const IconComponent = badgeIconMap[badge.slug] || Award;
                                return <IconComponent className="w-7 h-7" />;
                              })()}
                            </div>

                            {/* Badge Name & Info */}
                            <p className="font-display text-sm font-semibold text-foreground mb-0.5 truncate w-full">
                              {badge.name}
                            </p>

                            <div className={`mt-1 mb-2 px-2.5 py-0.5 rounded-md inline-block text-[9px] font-black ${
                              badge.unlocked ? `${colors.bg} ${colors.text}` : 'bg-background text-muted'
                            }`}>
                              {renderBadgeRarity(badge.rarity)}
                            </div>

                            <p className="font-sans text-[11px] text-muted leading-snug w-full line-clamp-2 px-1">
                              {badge.description}
                            </p>

                            {badge.unlocked && badge.unlockedAt && (
                              <p className="text-[10px] text-success font-semibold mt-3 flex items-center gap-1 leading-none font-sans">
                                <Check className="w-3 h-3 text-primary" />
                                Unlocked{' '}
                                <span className="font-mono">
                                  {new Date(badge.unlockedAt).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                              </p>
                            )}

                            {!badge.unlocked && (
                              <p className="text-[10px] text-muted font-bold mt-3 leading-none font-mono">
                                +{badge.pointsAwarded} points
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Avatar Frame Selection Segment */}
                  <div>
                    <FramePicker />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right Column (Sidebar) - Desktop Only ── */}
        <aside className="hidden lg:block lg:col-span-4">
          {renderSidebar(false)}
        </aside>
      </div>

      {/* ── Mobile Sidebar Drawer ── */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fadeInFast"
            onClick={() => setIsSidebarOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="relative w-full max-w-[320px] h-full bg-surface border-l border-border p-4 pb-safe shadow-2xl animate-slideLeft flex flex-col">
            <div className="flex items-center justify-between mb-6 shrink-0">
              <h3 className="font-display text-base font-bold text-foreground">Stats & Barkadas</h3>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors cursor-pointer"
                aria-label="Close panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar -mx-2 px-2 pb-6">
              {renderSidebar(true)}
            </div>
          </div>
        </div>
      )}
      </div>

      {/* ── Confirmation Modal for cancelling ── */}
      {cancellingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeInFast">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCancellingId(null)} />
          <div className="relative w-full max-w-sm bg-surface border border-border p-6 rounded-2xl shadow-lg animate-scaleIn">
            <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-error shrink-0" />
              Cancel Challenge?
            </h3>
            <p className="font-sans text-xs text-muted mt-2 leading-relaxed">
              Are you sure you want to cancel this challenge? Doing so will cancel the challenge for all participating friends as well. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setCancellingId(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-muted hover:bg-surface-hover hover:text-foreground transition-all cursor-pointer btn-active-tactile"
              >
                Keep Challenge
              </button>
              <button
                onClick={handleCancelConfirm}
                className="px-4 py-2.5 bg-error hover:bg-error/95 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-error/10 hover:shadow-md cursor-pointer btn-active-tactile"
              >
                Cancel Challenge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Creation Modal ── */}
      <CreateChallengeModal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setSelectedDuelFriendId(null);
        }}
        initialFriendUserId={selectedDuelFriendId}
        onSuccess={() => {
          setIsCreateOpen(false);
          setSelectedDuelFriendId(null);
          setLocalSuccess('Challenge launched');
          loadData();
          setTimeout(() => setLocalSuccess(null), 4000);
        }}
      />
    </div>
  );
};

export default Challenges;
