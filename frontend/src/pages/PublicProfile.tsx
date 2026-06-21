import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  AlertCircle,
  MapPin,
  Calendar,
  Edit3,
  UserPlus,
  Clock,
  UserCheck,
  ArrowLeft,
  Users,
  Ban,
  Trophy,
  Award,
  Flame,
  Star,
  Flag,
  Receipt,
  Footprints,
  Handshake,
  Sprout,
  Zap,
  Crown,
  Gem,
  Coins,
  Sparkles,
  Map,
  Wrench,
  Mountain,
  Medal,
  Shield,
  Swords,
  Heart,
  CreditCard,
  Landmark,
  LineChart,
  Coffee,
  Car,
} from 'lucide-react';

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
      return 'text-zinc-500 dark:text-zinc-300';
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

interface PublicProfileData {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  avatarUrl: string | null;
  createdAt: string;
  friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'friends' | 'self';
  sharedSplitCount?: number;
  mutualFriendCount?: number;
  gamification?: {
    currentStreak: number;
    totalPoints: number;
    badgeCount: number;
    recentBadges: Array<{
      id: string;
      slug: string;
      name: string;
      iconUrl: string;
      rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
    }>;
    activeFrame: {
      cssClass: string;
    } | null;
  } | null;
}

/**
 * Public Profile View — /profile/:username
 * Displays a user's public profile with context-dependent action buttons.
 */
const PublicProfile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  useAuthStore(); // keeps auth context active; user data fetched via API

  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'danger';
    type?: 'alert' | 'confirm' | 'prompt';
    inputPlaceholder?: string;
    onConfirm: (val?: string) => void;
  } | null>(null);

  // ── Fetch Profile ─────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    if (!username) return;
    try {
      setError('');
      const res = await api.get(`/profile/${username}`);
      setProfile(res.data.profile);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { status?: number } };
        if (axiosErr.response?.status === 404) {
          setError('Profile not found.');
        } else {
          setError('Failed to load profile.');
        }
      } else {
        setError('Network error.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  const handleRetry = useCallback(() => {
    setIsLoading(true);
    setError('');
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ── Fetch QR Code ─────────────────────────────────────────────────
  const handleShowQR = async () => {
    if (qrDataUrl) {
      setShowQR((v) => !v);
      return;
    }
    if (!profile) return;

    try {
      const res = await api.get(`/profile/${profile.id}/qr`);
      setQrDataUrl(res.data.qrDataUrl);
      setShowQR(true);
    } catch {
      // Silently fail — QR is non-critical
    }
  };

  // ── Action Handlers ────────────────────────────────────────────────
  const handleSendRequest = async () => {
    if (!profile) return;
    setActionLoading(true);
    try {
      const res = await api.post('/friends/request', { targetUserId: profile.id });
      if (res.data.autoAccepted) {
        setProfile((p) => p ? { ...p, friendshipStatus: 'friends' } : p);
      } else {
        setProfile((p) => p ? { ...p, friendshipStatus: 'pending_sent' } : p);
      }
    } catch { /* stays in current state */ }
    finally { setActionLoading(false); }
  };

  const handleAcceptRequest = async () => {
    if (!profile) return;
    setActionLoading(true);
    try {
      // Find the pending request from this user
      const reqRes = await api.get('/friends/requests/received');
      const pending = reqRes.data.requests.find(
        (r: { senderId: string }) => r.senderId === profile.id,
      );
      if (pending) {
        await api.post(`/friends/request/${pending.id}/accept`);
        setProfile((p) => p ? { ...p, friendshipStatus: 'friends' } : p);
      }
    } catch { /* stays in current state */ }
    finally { setActionLoading(false); }
  };

  const handleBlockUser = () => {
    if (!profile) return;
    setDialogConfig({
      isOpen: true,
      title: 'Block User',
      message: `Are you sure you want to block ${profile.displayName || profile.username}? They will no longer be able to see your activity or contact you.`,
      confirmLabel: 'Block',
      cancelLabel: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await api.post(`/friends/block/${profile.id}`);
          navigate('/friends', { replace: true });
        } catch { 
          setError('Failed to block user');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleReportUser = () => {
    if (!profile) return;
    setDialogConfig({
      isOpen: true,
      title: `Report ${profile.displayName || profile.username}`,
      message: 'Reason (e.g., Spam, Harassment, Inappropriate):',
      type: 'prompt',
      inputPlaceholder: 'Type reason here...',
      confirmLabel: 'Report',
      cancelLabel: 'Cancel',
      onConfirm: async (reason) => {
        if (!reason) return;
        setActionLoading(true);
        try {
          await api.post(`/friends/report/${profile.id}`, { reason });
          setDialogConfig({
            isOpen: true,
            title: 'Report Filed',
            message: 'User reported successfully.',
            type: 'alert',
            confirmLabel: 'OK',
            onConfirm: () => {},
          });
        } catch {
          setError('Failed to report user');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  // ── Action Button Logic ───────────────────────────────────────────
  const renderActionButton = () => {
    if (!profile) return null;

    switch (profile.friendshipStatus) {
      case 'self':
        return (
          <Button
            onClick={() => navigate('/settings/profile')}
            variant="outline"
            size="md"
            id="profile-edit-btn"
            className="w-full sm:w-auto"
          >
            <Edit3 className="w-4 h-4" /> Edit Profile
          </Button>
        );
      case 'friends':
        return (
          <div className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-success/10 border border-success/20 text-success text-sm font-semibold min-h-[44px] w-full sm:w-auto">
            <UserCheck className="w-4 h-4" /> Friends
          </div>
        );
      case 'pending_sent':
        return (
          <Button variant="outline" size="md" disabled id="profile-pending-btn" className="w-full sm:w-auto">
            <Clock className="w-4 h-4" /> Request Pending...
          </Button>
        );
      case 'pending_received':
        return (
          <Button size="md" onClick={handleAcceptRequest} isLoading={actionLoading} id="profile-accept-btn" className="w-full sm:w-auto">
            <UserPlus className="w-4 h-4" /> Accept Request
          </Button>
        );
      case 'none':
      default:
        return (
          <Button size="md" onClick={handleSendRequest} isLoading={actionLoading} id="profile-add-btn" className="w-full sm:w-auto">
            <UserPlus className="w-4 h-4" /> Send Friend Request
          </Button>
        );
    }
  };

  // ── Skeleton Loader ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="w-full max-w-[680px] mx-auto px-4 animate-fadeInFast">
        {/* Back Button Placeholder */}
        <div className="h-6 w-16 bg-surface-hover/50 rounded-lg animate-pulse mb-6" />
        
        {/* Profile Card Placeholder */}
        <div className="glass-card rounded-lg overflow-hidden border border-border/10">
          <div className="h-[120px] bg-surface-hover/30 animate-pulse" />
          <div className="px-6 pb-8 flex flex-col items-center">
            <div className="w-32 h-32 rounded-full bg-surface-hover/50 animate-pulse -mt-[64px] mb-4 border-4 border-surface" />
            <div className="h-8 w-48 bg-surface-hover/50 rounded-lg animate-pulse mb-2" />
            <div className="h-4 w-32 bg-surface-hover/50 rounded animate-pulse mb-6" />
            
            {/* Action Row Placeholder */}
            <div className="h-10 w-full sm:w-40 bg-surface-hover/50 rounded-xl animate-pulse mb-6" />
            
            {/* Stats Section Placeholder */}
            <div className="w-full bg-surface-hover/20 rounded-lg p-5 h-36 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[680px] mx-auto px-4 animate-fadeInFast">
      {/* ── Back Navigation ─────────────────────────────────────────── */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 group mb-6 cursor-pointer rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 transition-[transform,color] duration-150 ease-out active:scale-95"
        aria-label="Go back to previous page"
      >
        <ArrowLeft className="w-4.5 h-4.5 text-muted group-hover:text-primary group-hover:-translate-x-0.5 transition-transform duration-150 ease-out" />
        <span className="font-sans font-semibold text-sm text-muted group-hover:text-primary transition-colors duration-150 ease-out">
          Back
        </span>
      </button>

      {/* ── Main View Switcher (Error vs Profile Card) ────────────────── */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-20 bg-surface border border-border rounded-lg text-center px-6">
          <AlertCircle className="w-12 h-12 text-error mb-4" />
          <h3 className="text-xl font-display font-bold text-foreground mb-2">{error}</h3>
          <p className="text-sm text-muted mb-6 max-w-sm font-sans">
            {error === 'Profile not found.'
              ? "The user you're looking for may not exist or has a private profile."
              : "Please check your network connection and try again."}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto justify-center">
            {error !== 'Profile not found.' && (
              <Button onClick={handleRetry} variant="primary" className="rounded-xl w-full sm:w-auto">
                Retry
              </Button>
            )}
            <Button onClick={() => navigate('/friends')} variant="outline" className="rounded-xl w-full sm:w-auto">
              Go to Friends
            </Button>
          </div>
        </div>
      ) : (
        profile && (
          <article className="bg-surface border border-border rounded-lg overflow-hidden transition-all duration-200">
            {/* Hero Banner */}
            <div className="relative h-[100px] sm:h-[120px] bg-gradient-to-br from-surface-hover to-border/40 dark:from-indigo-950/70 dark:via-[#131130] dark:to-purple-950/70 overflow-hidden border-b border-border/20">
              {/* Ambient Radial Glow */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.08),transparent_70%)]" />
              {/* Geometric grid pattern */}
              <svg className="absolute inset-0 w-full h-full text-primary/[0.03] dark:text-indigo-500/[0.04]" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
                <defs>
                  <pattern id="profile-hero-lattice" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#profile-hero-lattice)" />
              </svg>
            </div>

            {/* Profile Details Container */}
            <div className="px-6 pb-8 relative flex flex-col items-center">
              {/* Avatar with Custom Frame Ring */}
              <div className="relative -mt-[64px] mb-4">
                {profile.gamification?.activeFrame?.cssClass ? (
                  <Avatar
                    src={profile.avatarUrl}
                    name={profile.displayName || profile.email}
                    size="2xl"
                    className="!rounded-full border-[3px] border-surface"
                    frameClass={profile.gamification.activeFrame.cssClass}
                  />
                ) : (
                  <div className="rounded-full border-2 border-primary/20 p-[3px]">
                    <Avatar
                      src={profile.avatarUrl}
                      name={profile.displayName || profile.email}
                      size="2xl"
                      className="!rounded-full border-[3px] border-surface"
                    />
                  </div>
                )}
              </div>

              {/* User Identity */}
              <h1 className="font-display font-bold text-[28px] text-foreground mb-1 text-center break-words max-w-full px-4">
                {profile.displayName || profile.username || 'Unnamed User'}
              </h1>
              
              {profile.username && (
                <p className="font-sans font-semibold text-[16px] text-primary mb-3 break-all max-w-xs text-center mx-auto">
                  @{profile.username}
                </p>
              )}
              
              {profile.bio && (
                <p className="font-sans text-[15px] text-muted text-center max-w-sm mb-6 leading-relaxed break-words px-2">
                  {profile.bio}
                </p>
              )}

              {/* Meta Info Row */}
              <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-3 mb-6 text-sm text-muted">
                {profile.location && (
                  <div className="flex items-center gap-1.5 text-muted">
                    <MapPin className="w-4.5 h-4.5 text-primary" />
                    <span className="font-sans font-medium">{profile.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-muted">
                  <Calendar className="w-4.5 h-4.5 text-primary" />
                  <span className="font-sans font-medium">
                    Joined {new Date(profile.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                    })}
                  </span>
                </div>
                {profile.friendshipStatus === 'friends' && profile.mutualFriendCount !== undefined && profile.mutualFriendCount > 0 && (
                  <div className="flex items-center gap-1.5 text-primary font-bold">
                    <Users className="w-4.5 h-4.5" />
                    <span className="font-sans">{profile.mutualFriendCount} mutual friend{profile.mutualFriendCount !== 1 ? 's' : ''}</span>
                  </div>
                )}
                {profile.friendshipStatus === 'friends' && profile.sharedSplitCount !== undefined && (
                  <div className="flex items-center gap-1.5 text-primary font-bold">
                    <Receipt className="w-4.5 h-4.5" />
                    <span className="font-sans">{profile.sharedSplitCount} shared split{profile.sharedSplitCount !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>

              {/* ── Restructured Actions Row (Moved above Gamification) ── */}
              <div className="w-full max-w-md flex flex-col sm:flex-row justify-center items-center gap-3 mb-8 px-4">
                {/* Primary Action Button */}
                <div className="w-full sm:w-auto flex justify-center">
                  {renderActionButton()}
                </div>

                {/* QR Code toggle for self */}
                {profile.friendshipStatus === 'self' && (
                  <div className="w-full sm:w-auto flex justify-center">
                    <Button
                      onClick={handleShowQR}
                      variant="outline"
                      size="md"
                      id="profile-qr-toggle"
                      className="w-full sm:w-auto rounded-xl font-sans"
                    >
                      {showQR ? 'Hide QR Code' : 'Show QR Code'}
                    </Button>
                  </div>
                )}

                {/* Administrative / Secondary Actions (Report & Block) */}
                {profile.friendshipStatus !== 'self' && (
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-center">
                    <button
                      onClick={handleReportUser}
                      disabled={actionLoading}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-bold text-muted hover:text-foreground hover:bg-surface-hover/50 btn-press cursor-pointer min-h-[44px] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                      title="Report Profile"
                    >
                      <Flag className="w-4 h-4" />
                      <span>Report</span>
                    </button>
                    <button
                      onClick={handleBlockUser}
                      disabled={actionLoading}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-bold text-muted hover:text-error hover:bg-error/5 btn-press cursor-pointer min-h-[44px] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                      title="Block User"
                    >
                      <Ban className="w-4 h-4" />
                      <span>Block</span>
                    </button>
                  </div>
                )}
              </div>

              {/* ── Gamification Stats Section ── */}
              {profile.gamification && (
                <section className="w-full bg-surface-hover/40 rounded-lg p-5 border border-border mb-2 transition-all duration-300">
                  <div className="flex items-center gap-2 mb-4">
                    <Trophy className="w-4.5 h-4.5 text-primary fill-primary/10" />
                    <h2 className="font-display font-bold text-[11px] uppercase tracking-widest text-muted">
                      GAMIFICATION STATS
                    </h2>
                  </div>
                  
                  <div className="grid grid-cols-3 divide-x divide-border">
                    {/* Points */}
                    <div
                      style={{ animationDelay: '80ms' }}
                      className="stagger-item flex flex-col items-center justify-center p-2 text-center cursor-default transition-transform duration-200 md:hover:scale-[1.02]"
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <Star className="w-5 h-5 text-yellow-500 fill-yellow-500 dark:text-yellow-400 dark:fill-yellow-400" />
                        <span className="font-mono font-bold text-lg text-foreground tracking-tight">
                          {profile.gamification.totalPoints.toLocaleString()}
                        </span>
                      </div>
                      <span className="font-sans font-semibold text-[11px] text-muted uppercase tracking-wider">Points</span>
                    </div>
                    
                    {/* Streak */}
                    <div
                      style={{ animationDelay: '140ms' }}
                      className="stagger-item flex flex-col items-center justify-center p-2 text-center cursor-default transition-transform duration-200 md:hover:scale-[1.02]"
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <Flame className="w-5 h-5 text-streak fill-streak" />
                        <span className="font-mono font-bold text-lg text-foreground tracking-tight">
                          {profile.gamification.currentStreak}d
                        </span>
                      </div>
                      <span className="font-sans font-semibold text-[11px] text-muted uppercase tracking-wider">Streak</span>
                    </div>
                    
                    {/* Badges */}
                    <div
                      style={{ animationDelay: '200ms' }}
                      className="stagger-item flex flex-col items-center justify-center p-2 text-center cursor-default transition-transform duration-200 md:hover:scale-[1.02]"
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <Award className="w-5 h-5 text-primary fill-primary/10" />
                        <span className="font-mono font-bold text-lg text-foreground tracking-tight">
                          {profile.gamification.badgeCount}
                        </span>
                      </div>
                      <span className="font-sans font-semibold text-[11px] text-muted uppercase tracking-wider">Badges</span>
                    </div>
                  </div>

                  {profile.gamification.recentBadges.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <Award className="w-4.5 h-4.5 text-sky-500 fill-sky-500/10" />
                        <h3 className="font-display font-bold text-[11px] uppercase tracking-widest text-muted">
                          RECENT ACHIEVEMENTS
                        </h3>
                      </div>
                      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-2 px-2">
                        {profile.gamification.recentBadges.map((badge, idx) => {
                          const IconComponent = badgeIconMap[badge.slug] || Award;
                          const colorClass = getIconColorClass(badge.rarity);
                          return (
                            <div
                              key={badge.id}
                              style={{ animationDelay: `${260 + idx * 45}ms` }}
                              className="stagger-item flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 bg-surface border border-border rounded-full text-xs font-semibold text-foreground shadow-sm transition-transform duration-200 md:hover:scale-[1.02]"
                            >
                              <IconComponent className={`w-4 h-4 shrink-0 ${colorClass}`} />
                              <span className="font-sans font-bold text-foreground">{badge.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>
          </article>
        )
      )}

      {/* ── Centered QR Code Modal (Decision 4) ── */}
      {showQR && qrDataUrl && profile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 modal-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-dialog-title"
            className="w-full max-w-sm bg-surface rounded-[var(--radius-lg)] shadow-xl p-6 modal-content text-center relative border border-border/10"
          >
            <h2 id="qr-dialog-title" className="font-display text-xl font-bold text-foreground mb-2">Profile QR Code</h2>
            <p className="font-sans text-sm text-muted mb-6">
              Scan to view @{profile.username}'s profile and connect
            </p>
            
            <div className="bg-white p-4 inline-block rounded-2xl shadow-sm mb-6 border border-border/10">
              <img
                src={qrDataUrl}
                alt="Profile QR Code"
                className="mx-auto"
                style={{ width: 180, height: 180 }}
              />
            </div>
            
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/profile/${profile.username}?action=add-friend`
                  );
                  setDialogConfig({
                    isOpen: true,
                    title: 'Link Copied',
                    message: 'Profile link copied to clipboard.',
                    type: 'alert',
                    confirmLabel: 'OK',
                    onConfirm: () => {},
                  });
                }}
                className="w-full py-2.5 rounded-xl font-sans text-sm text-primary hover:text-primary-hover font-bold transition-colors cursor-pointer border border-border hover:bg-surface-hover/30 min-h-[44px]"
              >
                Copy Profile Link
              </button>
              
              <Button
                onClick={() => setShowQR(false)}
                variant="primary"
                className="w-full rounded-xl"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Global Custom dialog rendering */}
      {dialogConfig && (
        <ConfirmDialog
          isOpen={dialogConfig.isOpen}
          title={dialogConfig.title}
          message={dialogConfig.message}
          confirmLabel={dialogConfig.confirmLabel}
          cancelLabel={dialogConfig.cancelLabel}
          variant={dialogConfig.variant}
          type={dialogConfig.type}
          inputPlaceholder={dialogConfig.inputPlaceholder}
          onConfirm={(val) => {
            dialogConfig.onConfirm(val);
            setDialogConfig(null);
          }}
          onCancel={() => setDialogConfig(null)}
        />
      )}
    </div>
  );
};

export default PublicProfile;
