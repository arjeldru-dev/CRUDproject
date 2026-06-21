import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import Avatar from '../components/ui/Avatar';
import {
  Users, Search, AlertCircle, UserPlus, Clock, Send,
  Check, X, Ghost, ChevronDown, ChevronUp, QrCode, Mail, Trash2, Trophy,
} from 'lucide-react';
import Leaderboard from '../components/gamification/Leaderboard';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

// ── Types ─────────────────────────────────────────────────────────────
interface FriendListItem {
  friendshipId: string;
  friendId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  activeFrame?: { cssClass: string } | null;
  netBalance: number;
  createdAt: string;
}

interface FriendRequestItem {
  id: string;
  senderId: string;
  receiverId: string;
  senderProfile?: {
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    activeFrame?: { cssClass: string } | null;
  };
  receiverProfile?: {
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    activeFrame?: { cssClass: string } | null;
  };
  status: string;
  createdAt: string;
}

interface UserSearchResult {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  activeFrame?: { cssClass: string } | null;
  relationshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'friends';
}

interface GhostProfile {
  id: string;
  name: string;
  isGhost: boolean;
}

type TabKey = 'friends' | 'requests' | 'discover' | 'leaderboard';

const VALID_TABS: TabKey[] = ['friends', 'requests', 'discover', 'leaderboard'];

const isValidTab = (tab: string | null): tab is TabKey => {
  return VALID_TABS.includes(tab as TabKey);
};

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'friends', label: 'My Friends', icon: Users },
  { key: 'requests', label: 'Requests', icon: Clock },
  { key: 'discover', label: 'Discover', icon: Search },
  { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
];

// ── Main Component ────────────────────────────────────────────────────
const Friends: React.FC = () => {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabKey | null;

  // Dialog configuration for custom alerts/confirms
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'danger';
    type?: 'alert' | 'confirm' | 'prompt';
    onConfirm: (val?: string) => void;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>(
    isValidTab(tabParam) ? tabParam : 'friends'
  );

  useEffect(() => {
    if (isValidTab(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // My Friends
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState('');

  // Requests
  const [received, setReceived] = useState<FriendRequestItem[]>([]);
  const [sent, setSent] = useState<FriendRequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  // Discover
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Ghost profiles
  const [ghosts, setGhosts] = useState<GhostProfile[]>([]);
  const [ghostsExpanded, setGhostsExpanded] = useState(false);

  // Ghost Linking
  const [ghostToLink, setGhostToLink] = useState<GhostProfile | null>(null);
  const [ghostLinkQuery, setGhostLinkQuery] = useState('');
  const [ghostLinkResults, setGhostLinkResults] = useState<UserSearchResult[]>([]);
  const ghostLinkTrapRef = useFocusTrap(!!ghostToLink, () => {
    setGhostToLink(null);
    setGhostLinkQuery('');
  });
  const ghostSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Action loading states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [slidingOut, setSlidingOut] = useState<Record<string, boolean>>({});

  // Invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState('');

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data Fetching ─────────────────────────────────────────────────
  const fetchFriends = useCallback(async () => {
    try {
      setFriendsError('');
      const [listRes, ghostRes] = await Promise.all([
        api.get('/friends/list'),
        api.get('/friends'),
      ]);
      setFriends(listRes.data.friends);
      setGhosts((ghostRes.data.friends || []).filter((f: GhostProfile) => f.isGhost));
    } catch {
      setFriendsError('Failed to load friends.');
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    try {
      const [recvRes, sentRes] = await Promise.all([
        api.get('/friends/requests/received'),
        api.get('/friends/requests/sent'),
      ]);
      setReceived(recvRes.data.requests);
      setSent(sentRes.data.requests);
    } catch {
      // Silent fail — non-critical
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  const fetchQR = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get(`/profile/${user.id}/qr`);
      setQrDataUrl(res.data.qrDataUrl);
    } catch {
      // Silent — QR is supplementary
    }
  }, [user?.id]);

  useEffect(() => {
    fetchFriends();
    fetchRequests();
    fetchQR();
  }, [fetchFriends, fetchRequests, fetchQR]);

  // ── Debounced Search ──────────────────────────────────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchError('');
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setSearchError('');
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/friends/search?q=${encodeURIComponent(searchQuery.trim())}`, {
          signal: controller.signal,
        });
        setSearchResults(res.data.results);
        setSearchError('');
      } catch (err: unknown) {
        const error = err as any;
        if (error.name !== 'CanceledError' && error.name !== 'AbortError') {
          setSearchResults([]);
          setSearchError(error.response?.data?.error || 'Search failed due to a network or server error.');
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      controller.abort();
    };
  }, [searchQuery]);

  const handleSearchRetry = () => {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    setSearchError('');
    api.get(`/friends/search?q=${encodeURIComponent(searchQuery.trim())}`)
      .then((res) => {
        setSearchResults(res.data.results);
        setSearchError('');
      })
      .catch((err) => {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          setSearchResults([]);
          setSearchError(err.response?.data?.error || 'Search failed due to a network or server error.');
        }
      })
      .finally(() => {
        setSearching(false);
      });
  };

  // ── Ghost Link Search ─────────────────────────────────────────────
  useEffect(() => {
    if (ghostSearchTimer.current) clearTimeout(ghostSearchTimer.current);
    if (ghostLinkQuery.trim().length < 2) {
      setGhostLinkResults([]);
      return;
    }
    const controller = new AbortController();
    ghostSearchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/friends/search?q=${encodeURIComponent(ghostLinkQuery.trim())}`, {
          signal: controller.signal,
        });
        setGhostLinkResults(res.data.results);
      } catch (err: unknown) {
        const error = err as any;
        if (error.name !== 'CanceledError' && error.name !== 'AbortError') {
          setGhostLinkResults([]);
        }
      }
    }, 300);
    return () => {
      if (ghostSearchTimer.current) clearTimeout(ghostSearchTimer.current);
      controller.abort();
    };
  }, [ghostLinkQuery]);

  // ── Actions ───────────────────────────────────────────────────────
  const setLoading = (id: string, v: boolean) => setActionLoading((p) => ({ ...p, [id]: v }));

  const handleSendRequest = async (targetUserId: string) => {
    setLoading(targetUserId, true);
    try {
      await api.post('/friends/request', { targetUserId });
      setSearchResults((prev) =>
        prev.map((u) => u.id === targetUserId ? { ...u, relationshipStatus: 'pending_sent' as const } : u),
      );
    } catch { /* Error silenced — button stays enabled */ }
    finally { setLoading(targetUserId, false); }
  };

  const handleAccept = async (requestId: string) => {
    setLoading(requestId, true);
    try {
      await api.post(`/friends/request/${requestId}/accept`);
      setSlidingOut((p) => ({ ...p, [requestId]: true }));
      setTimeout(() => {
        setReceived((prev) => prev.filter((r) => r.id !== requestId));
        fetchFriends();
      }, 300);
    } catch { /* noop */ }
    finally { setLoading(requestId, false); }
  };

  const handleDecline = async (requestId: string) => {
    setLoading(requestId, true);
    try {
      await api.post(`/friends/request/${requestId}/decline`);
      setSlidingOut((p) => ({ ...p, [requestId]: true }));
      setTimeout(() => setReceived((prev) => prev.filter((r) => r.id !== requestId)), 300);
    } catch { /* noop */ }
    finally { setLoading(requestId, false); }
  };

  const handleCancel = async (requestId: string) => {
    setLoading(requestId, true);
    try {
      await api.delete(`/friends/request/${requestId}/cancel`);
      setSlidingOut((p) => ({ ...p, [requestId]: true }));
      setTimeout(() => setSent((prev) => prev.filter((r) => r.id !== requestId)), 300);
    } catch { /* noop */ }
    finally { setLoading(requestId, false); }
  };

  const handleRemoveFriend = (friendshipId: string) => {
    setDialogConfig({
      isOpen: true,
      title: 'Remove Friend',
      message: 'Remove this friend? Historical ledger data will be preserved.',
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        setLoading(friendshipId, true);
        try {
          await api.delete(`/friends/${friendshipId}`);
          setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
        } catch { /* noop */ }
        finally { setLoading(friendshipId, false); }
      },
    });
  };

  const handleLinkGhost = async (realUserId: string) => {
    if (!ghostToLink) return;
    setLoading(`link-${ghostToLink.id}`, true);
    try {
      await api.post(`/friends/ghost/${ghostToLink.id}/claim`, { realUserId });
      setGhosts((prev) => prev.filter((g) => g.id !== ghostToLink.id));
      fetchFriends();
      setGhostToLink(null);
      setGhostLinkQuery('');
    } catch {
      setDialogConfig({
        isOpen: true,
        title: 'Linking Failed',
        message: 'Failed to link ghost profile',
        type: 'alert',
        confirmLabel: 'OK',
        onConfirm: () => {},
      });
    } finally {
      setLoading(`link-${ghostToLink.id}`, false);
    }
  };

  const handleInvite = async () => {
    const trimmed = inviteEmail.trim();
    if (!trimmed) {
      setInviteStatus('Email is required.');
      return;
    }
    if (trimmed.length > 120) {
      setInviteStatus('Email must be 120 characters or less.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setInviteStatus('Please enter a valid email address.');
      return;
    }
    try {
      setInviteStatus('Sending invite...');
      await api.post('/friends/invite', { email: trimmed });
      setInviteStatus('Invitation logged!');
      setInviteEmail('');
      setTimeout(() => setInviteStatus(''), 3000);
    } catch (err: unknown) {
      const error = err as any;
      setInviteStatus(error.response?.data?.error || 'Failed to send invite.');
    }
  };

  const handleDeleteGhost = (ghostId: string) => {
    setDialogConfig({
      isOpen: true,
      title: 'Delete Ghost Profile',
      message: 'Are you sure you want to delete this ghost profile? Any associated ledger entries will lose this connection.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        setLoading(`delete-${ghostId}`, true);
        try {
          await api.delete(`/friends/ghost/${ghostId}`);
          setGhosts((prev) => prev.filter((g) => g.id !== ghostId));
          fetchFriends();
        } catch {
          setDialogConfig({
            isOpen: true,
            title: 'Deletion Failed',
            message: 'Failed to delete ghost profile. It might be linked to existing data.',
            type: 'alert',
            confirmLabel: 'OK',
            onConfirm: () => {},
          });
        } finally {
          setLoading(`delete-${ghostId}`, false);
        }
      },
    });
  };

  const requestCount = received.length + sent.length;

  // ── Skeleton ──────────────────────────────────────────────────────
  if (friendsLoading && requestsLoading) {
    return (
      <div className="animate-fadeInFast">
        <div className="h-9 w-48 bg-surface-hover rounded-[var(--radius-lg)] animate-pulse mb-2" />
        <div className="h-4 w-72 bg-surface rounded-[var(--radius-lg)] animate-pulse mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-surface rounded-[var(--radius-lg)] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeInFast w-full flex flex-col gap-2">
      {/* Header */}
      <div>
        <h1 className="font-display text-fluid-h1 font-bold tracking-tight text-foreground">
          Friends
        </h1>
        <p className="text-muted text-sm mt-1">
          Connect with people you split expenses with
        </p>
      </div>

      <div className="w-full flex flex-col">
        {/* Tab Bar Pill Selector */}
      <div className="bg-surface rounded-[var(--radius-lg)] p-1 flex overflow-x-auto no-scrollbar flex-nowrap gap-1 w-full sm:w-auto shadow-sm" role="tablist" aria-label="Friends sections">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              id={`tab-${tab.key}`}
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`panel-${tab.key}`}
              className={`
                px-4 py-2 rounded-[var(--radius-md)] flex items-center gap-2 text-sm font-semibold transition-colors duration-150 cursor-pointer select-none btn-press shrink-0
                ${isActive
                  ? 'bg-primary text-white'
                  : 'text-muted hover:text-foreground hover:bg-surface-hover'
                }
              `}
            >
              <span>{tab.label}</span>
              {tab.key === 'requests' && requestCount > 0 && (
                <span className={`
                  min-w-[18px] h-[18px] px-1.5 rounded-[var(--radius-pill)] text-[10px] font-bold flex items-center justify-center font-mono
                  ${isActive ? 'bg-white/20 text-white' : 'bg-error text-white'}
                `}>
                  {requestCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Error Banner */}
      {friendsError && (
        <div className="mt-3 flex items-center gap-2 p-4 rounded-[var(--radius-lg)] bg-error/10 border border-error/20 text-error text-sm animate-fadeIn font-sans" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{friendsError}</span>
          <button onClick={fetchFriends} className="ml-auto text-xs font-semibold underline hover:text-error/85 transition-colors cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* ─── MY FRIENDS TAB ─── */}
      {activeTab === 'friends' && (
        <div style={{ marginTop: '12px' }} className="animate-fadeInFast" role="tabpanel" id="panel-friends" aria-labelledby="tab-friends">
          {friends.length === 0 ? (
            <div style={{ padding: '80px 24px' }} className="flex flex-col items-center justify-center bg-surface rounded-[var(--radius-lg)] shadow-sm">
              <div className="w-14 h-14 rounded-[var(--radius-pill)] bg-primary/10 flex items-center justify-center mb-5 animate-scaleIn">
                <Users className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-lg font-display font-bold text-foreground mb-2">No Friends Yet</h3>
              <p className="text-sm text-muted mb-6 text-center max-w-sm font-sans">
                Find friends to start splitting expenses together.
              </p>
              <button
                onClick={() => handleTabChange('discover')}
                className="px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-[var(--radius-md)] transition-colors cursor-pointer flex items-center gap-2 btn-press hover:bg-primary-hover"
                id="find-friends-cta"
              >
                <Search className="w-4 h-4" /> Find Friends
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Grid Layout */}
              <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6 animate-slideUpIn">
                {friends.map((friend, i) => {
                  const isOwes = friend.netBalance > 0;
                  const isOwed = friend.netBalance < 0;
                  const balanceText = isOwes
                    ? `+₱${friend.netBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                    : isOwed
                      ? `-₱${Math.abs(friend.netBalance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                      : '₱0.00';
                  const balanceClass = isOwes
                    ? 'text-success'
                    : isOwed
                      ? 'text-error'
                      : 'text-muted';
                  const balanceLabel = isOwes
                    ? 'owes you'
                    : isOwed
                      ? 'you owe'
                      : 'settled';

                  const avatarAndNames = (
                    <div className="flex flex-col items-center text-center w-full">
                      <div className="mb-3 shrink-0">
                        <Avatar
                          src={friend.avatarUrl}
                          name={friend.displayName || friend.username || 'User'}
                          size="lg"
                          className="w-16 h-16 rounded-full"
                          frameClass={friend.activeFrame?.cssClass || undefined}
                        />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-tight truncate w-full px-2">
                        {friend.displayName || friend.username || 'Unknown'}
                      </h3>
                      {friend.username && (
                        <span className="font-sans text-xs text-muted mt-1 truncate w-full px-2">
                          @{friend.username}
                        </span>
                      )}
                    </div>
                  );

                  return (
                    <div
                      key={friend.friendshipId}
                      style={{ padding: '20px 16px', animationDelay: `${i * 40}ms` }}
                      className="bg-surface rounded-[var(--radius-lg)] shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between h-full relative animate-slideUpIn opacity-0"
                    >
                      {friend.username ? (
                        <Link to={`/profile/${friend.username}`} className="group flex flex-col items-center text-center w-full cursor-pointer focus:outline-none">
                          {avatarAndNames}
                        </Link>
                      ) : (
                        <div className="flex flex-col items-center text-center w-full">
                          {avatarAndNames}
                        </div>
                      )}

                      <div className="mt-4 flex-grow flex flex-col justify-end w-full">
                        <div className="flex flex-col items-center justify-end w-full">
                          <div className={`font-mono text-lg font-bold tracking-tight ${balanceClass}`}>
                            {balanceText}
                          </div>
                          <p className="font-sans text-[10px] text-muted mt-0.5 uppercase tracking-wider font-semibold">
                            {balanceLabel}
                          </p>
                        </div>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleRemoveFriend(friend.friendshipId);
                          }}
                          disabled={actionLoading[friend.friendshipId]}
                          className="mt-4 w-full py-1.5 px-3 text-error hover:bg-error/5 text-xs font-semibold transition-all duration-150 cursor-pointer btn-press disabled:opacity-50"
                        >
                          Remove Friend
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Mobile List Layout */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {friends.map((friend, i) => {
                  const isOwes = friend.netBalance > 0;
                  const isOwed = friend.netBalance < 0;
                  const balanceText = isOwes
                    ? `+₱${friend.netBalance.toLocaleString('en-PH')}`
                    : isOwed
                      ? `-₱${Math.abs(friend.netBalance).toLocaleString('en-PH')}`
                      : 'Settled';
                  const balanceClass = isOwes
                    ? 'text-success'
                    : isOwed
                      ? 'text-error'
                      : 'text-muted';

                  const mobileCardHeader = (
                    <>
                      <Avatar
                        src={friend.avatarUrl}
                        name={friend.displayName || friend.username || 'User'}
                        size="md"
                        className="w-10 h-10 rounded-full shrink-0"
                        frameClass={friend.activeFrame?.cssClass || undefined}
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {friend.displayName || friend.username || 'Unknown'}
                        </h3>
                        {friend.username && (
                          <p className="text-[11px] text-muted truncate mt-0.5 font-sans">
                            @{friend.username}
                          </p>
                        )}
                      </div>
                    </>
                  );

                  return (
                    <div
                      key={friend.friendshipId}
                      style={{ padding: '20px', animationDelay: `${i * 30}ms` }}
                      className="flex items-center justify-between gap-4 bg-surface rounded-[var(--radius-lg)] shadow-sm hover:shadow-md transition-all duration-200 animate-slideUpIn opacity-0"
                    >
                      {friend.username ? (
                        <Link to={`/profile/${friend.username}`} className="group flex items-center gap-3 flex-1 min-w-0 cursor-pointer focus:outline-none">
                          {mobileCardHeader}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {mobileCardHeader}
                        </div>
                      )}
                      
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <span className={`font-mono text-sm font-bold tracking-tight ${balanceClass}`}>
                          {balanceText}
                        </span>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleRemoveFriend(friend.friendshipId);
                          }}
                          disabled={actionLoading[friend.friendshipId]}
                          className="w-11 h-11 flex items-center justify-center text-error hover:bg-error/5 rounded-[var(--radius-md)] transition-all cursor-pointer ml-1 btn-press disabled:opacity-50 font-sans"
                          aria-label="Remove Friend"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Legacy Ghosts Profiles Section */}
          {ghosts.length > 0 && (
            <div className="mt-8 animate-fadeInFast">
              <button
                onClick={() => setGhostsExpanded((v) => !v)}
                className="flex items-center justify-between w-full p-4 bg-surface rounded-[var(--radius-lg)] hover:bg-surface-hover/50 shadow-sm transition-all cursor-pointer text-left group btn-press"
                id="toggle-ghosts"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[var(--radius-pill)] bg-background flex items-center justify-center text-muted group-hover:bg-primary group-hover:text-white transition-all duration-200">
                    <Ghost className="w-5 h-5 animate-scaleIn" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-foreground">
                      Legacy Ghost Profiles ({ghosts.length})
                    </h3>
                    <p className="font-sans text-xs text-muted mt-0.5">
                      Simplified profiles for manual tracking
                    </p>
                  </div>
                </div>
                <div className="text-muted group-hover:text-foreground transition-colors">
                  {ghostsExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </button>

              {ghostsExpanded && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mt-4 animate-slideDownIn">
                  {ghosts.map((ghost) => (
                    <div
                      key={ghost.id}
                      style={{ padding: '24px' }}
                      className="bg-surface rounded-[var(--radius-lg)] shadow-sm hover:shadow-md transition-all duration-200 flex flex-col items-center text-center relative overflow-hidden"
                    >
                      <div className="w-12 h-12 rounded-[var(--radius-md)] bg-background border border-border flex items-center justify-center mb-3 text-muted">
                        <Ghost className="w-6 h-6 text-primary" />
                      </div>
                      
                      <h4 className="font-display text-sm font-bold text-foreground truncate w-full px-2" title={ghost.name}>{ghost.name}</h4>
                      <p className="font-sans text-[11px] text-muted mt-1 mb-4 uppercase tracking-wider font-semibold">
                        Legacy Profile
                      </p>

                      <div className="flex gap-2 w-full mt-auto">
                        <button
                          onClick={() => setGhostToLink(ghost)}
                          className="flex-1 text-xs font-semibold py-2 bg-primary text-white rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer btn-press"
                        >
                          Link
                        </button>
                        <button
                          onClick={() => handleDeleteGhost(ghost.id)}
                          disabled={actionLoading[`delete-${ghost.id}`]}
                          className="flex-1 font-display text-xs font-bold py-2 border border-border text-muted hover:text-error hover:border-error/20 hover:bg-error/5 rounded-[var(--radius-md)] transition-all cursor-pointer disabled:opacity-50 btn-press"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── REQUESTS TAB ─── */}
      {activeTab === 'requests' && (
        <div style={{ marginTop: '12px' }} className="animate-fadeInFast space-y-8" role="tabpanel" id="panel-requests" aria-labelledby="tab-requests">
          {/* Received Requests */}
          <div>
            <h3 className="font-display text-base font-bold text-foreground mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              <span>Received</span>
              {received.length > 0 && (
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-[var(--radius-pill)] font-mono font-bold">
                  {received.length}
                </span>
              )}
            </h3>
            {received.length === 0 ? (
              <div style={{ padding: '32px' }} className="bg-surface rounded-[var(--radius-lg)] text-center shadow-sm">
                <p className="font-sans text-sm text-muted">No pending requests</p>
                <p className="font-sans text-xs text-muted/85 mt-1">
                  Share your QR code to let friends connect with you
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 animate-slideUpIn">
                {received.map((req) => (
                  <div
                    key={req.id}
                    style={{ padding: '20px' }}
                    className={`bg-surface rounded-[var(--radius-lg)] flex items-center justify-between gap-4 shadow-sm transition-all duration-300 ${
                      slidingOut[req.id] ? 'opacity-0 -translate-x-4' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <Avatar
                        src={req.senderProfile?.avatarUrl}
                        name={req.senderProfile?.displayName || req.senderProfile?.username || 'User'}
                        size="md"
                        frameClass={req.senderProfile?.activeFrame?.cssClass || undefined}
                      />
                      <div className="min-w-0">
                        <p className="font-display text-sm font-bold text-foreground truncate">
                          {req.senderProfile?.displayName || req.senderProfile?.username || 'Unknown'}
                        </p>
                        {req.senderProfile?.username && (
                          <p className="font-sans text-[11px] text-muted truncate mt-0.5">
                            @{req.senderProfile.username}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleAccept(req.id)}
                        disabled={actionLoading[req.id]}
                        className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 btn-press h-11"
                      >
                        <Check className="w-3.5 h-3.5" /> Accept
                      </button>
                      <button
                        onClick={() => handleDecline(req.id)}
                        disabled={actionLoading[req.id]}
                        className="w-11 h-11 flex items-center justify-center border border-border hover:border-error/20 hover:text-error hover:bg-error/5 text-muted rounded-[var(--radius-md)] transition-all cursor-pointer disabled:opacity-50 btn-press"
                        aria-label="Decline Request"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sent Requests */}
          <div>
            <h3 className="font-display text-base font-bold text-foreground mb-4 flex items-center gap-2">
              <Send className="w-5 h-5 text-muted" />
              <span>Sent</span>
            </h3>
            {sent.length === 0 ? (
              <div style={{ padding: '32px' }} className="bg-surface rounded-[var(--radius-lg)] text-center shadow-sm">
                <p className="font-sans text-sm text-muted">No outgoing requests</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 animate-slideUpIn">
                {sent.map((req) => (
                  <div
                    key={req.id}
                    style={{ padding: '20px' }}
                    className={`bg-surface rounded-[var(--radius-lg)] flex items-center justify-between gap-4 shadow-sm transition-all duration-300 ${
                      slidingOut[req.id] ? 'opacity-0 -translate-x-4' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <Avatar
                        src={req.receiverProfile?.avatarUrl}
                        name={req.receiverProfile?.displayName || req.receiverProfile?.username || 'User'}
                        size="md"
                        frameClass={req.receiverProfile?.activeFrame?.cssClass || undefined}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {req.receiverProfile?.displayName || req.receiverProfile?.username || 'Unknown'}
                        </p>
                        {req.receiverProfile?.username && (
                          <p className="font-sans text-[11px] text-muted truncate mt-0.5">
                            @{req.receiverProfile.username}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancel(req.id)}
                      disabled={actionLoading[req.id]}
                      className="px-4 py-2 border border-border text-muted hover:text-error hover:border-error/20 hover:bg-error/5 text-xs font-semibold rounded-[var(--radius-md)] transition-colors cursor-pointer disabled:opacity-50 btn-press h-11"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── DISCOVER TAB ─── */}
      {activeTab === 'discover' && (
        <div 
          style={{ marginTop: '12px' }} 
          className="w-full animate-fadeInFast flex flex-col lg:flex-row gap-6 items-start" 
          role="tabpanel" 
          id="panel-discover" 
          aria-labelledby="tab-discover"
        >
          {/* Left Column: Search & Results (70% on desktop) */}
          <div className="w-full lg:w-[70%] space-y-6">
            {/* Search Input */}
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted w-5 h-5 pointer-events-none group-focus-within:text-primary transition-colors" />
              <label htmlFor="user-search" className="sr-only">Search by username, email, or name</label>
              <input
                type="text"
                placeholder="Search by username, email, or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '2.75rem', paddingRight: '1rem' }}
                className="w-full h-14 bg-surface border border-border rounded-[var(--radius-lg)] text-foreground font-sans placeholder:text-muted/65 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
                id="user-search"
              />
            </div>

            {/* Search Results & Errors */}
            {searchQuery.trim().length >= 2 && (
              <div style={{ marginTop: '8px' }} className="space-y-3">
                {searchError ? (
                  <div className="flex items-center gap-2 p-4 rounded-[var(--radius-lg)] bg-error/10 border border-error/20 text-error text-sm animate-fadeIn font-sans" role="alert">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{searchError}</span>
                    <button onClick={handleSearchRetry} className="ml-auto text-xs font-semibold underline hover:text-error/85 transition-colors cursor-pointer">
                      Retry
                    </button>
                  </div>
                ) : searching ? (
                  <div className="flex flex-col gap-1">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} style={{ padding: '20px' }} className="h-20 bg-surface rounded-[var(--radius-lg)] animate-pulse" />
                    ))}
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="flex flex-col gap-1 animate-slideUpIn">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        style={{ padding: '20px' }}
                        className="bg-surface rounded-[var(--radius-lg)] flex items-center justify-between gap-4 shadow-sm"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <Avatar
                            src={result.avatarUrl}
                            name={result.displayName || result.username || 'User'}
                            size="md"
                            frameClass={result.activeFrame?.cssClass || undefined}
                          />
                          <div className="min-w-0">
                            <p className="font-display text-sm font-bold text-foreground truncate">
                              {result.displayName || result.username || 'Unknown'}
                            </p>
                            {result.username && (
                              <p className="font-sans text-[11px] text-muted truncate mt-0.5">
                                @{result.username}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center">
                          {result.relationshipStatus === 'none' && (
                            <button
                              onClick={() => handleSendRequest(result.id)}
                              disabled={actionLoading[result.id]}
                              className="px-6 py-3 bg-primary text-white text-xs font-semibold rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center justify-center btn-press"
                              id={`add-${result.id}`}
                            >
                              Add
                            </button>
                          )}
                          {result.relationshipStatus === 'pending_sent' && (
                            <span className="text-xs font-sans font-semibold text-muted bg-surface-hover border border-border px-6 py-3 rounded-[var(--radius-md)] inline-flex items-center justify-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 animate-fadeInFast" /> Pending
                            </span>
                          )}
                          {result.relationshipStatus === 'pending_received' && (
                            <button
                              onClick={() => handleTabChange('requests')}
                              className="px-6 py-3 border border-border text-primary hover:bg-primary/5 font-sans text-xs font-semibold rounded-[var(--radius-md)] transition-all cursor-pointer inline-flex items-center justify-center btn-press"
                            >
                              Respond
                            </button>
                          )}
                          {result.relationshipStatus === 'friends' && (
                            <span className="text-xs font-sans font-semibold text-success bg-success/10 border border-success/20 px-6 py-3 rounded-[var(--radius-md)] inline-flex items-center justify-center gap-1.5">
                              <Check className="w-3.5 h-3.5" /> Friends
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '24px' }} className="bg-surface rounded-[var(--radius-lg)] text-center shadow-sm">
                    <p className="font-sans text-sm text-muted mb-4">
                      No users found for "<span className="text-foreground font-semibold">{searchQuery}</span>"
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2 max-w-md mx-auto">
                      <label htmlFor="invite-email" className="sr-only">Invite email address</label>
                      <input
                        type="email"
                        placeholder="Invite via email..."
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        maxLength={120}
                        required
                        className="w-full sm:flex-1 h-11 bg-background border border-border rounded-[var(--radius-md)] px-4 text-sm focus:outline-none focus:border-primary transition-colors text-foreground"
                        id="invite-email"
                      />
                      <button
                        onClick={handleInvite}
                        className="w-full sm:w-auto h-11 px-5 border border-border text-foreground hover:bg-surface-hover font-sans text-xs font-semibold rounded-[var(--radius-md)] transition-all cursor-pointer flex items-center justify-center gap-1.5 btn-press"
                        id="invite-btn"
                      >
                        <Mail className="w-3.5 h-3.5" /> Invite
                      </button>
                    </div>
                    {inviteStatus && (
                      <p className="text-xs font-bold text-success mt-3 font-sans">{inviteStatus}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: QR Code Card (30% on desktop) */}
          <div className="w-full lg:w-[30%] flex justify-center shrink-0">
            <div style={{ padding: '24px' }} className="bg-surface rounded-[var(--radius-lg)] shadow-sm w-full max-w-md lg:max-w-none mx-auto lg:mx-0 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <QrCode className="w-5 h-5 text-primary" />
                <h3 className="font-display text-base font-bold text-foreground">Your QR Code</h3>
              </div>
              <p className="font-sans text-xs text-muted" style={{ textAlign: 'center', width: '100%', display: 'block', marginBottom: '24px' }}>
                Let friends scan this to instantly send you a friend request
              </p>
              {qrDataUrl ? (
                <div className="inline-block p-4 bg-white rounded-[var(--radius-lg)] shadow-sm select-none animate-scaleIn">
                  <img src={qrDataUrl} alt="Profile QR Code" style={{ width: '240px', height: '240px' }} />
                </div>
              ) : (
                <div className="mx-auto bg-surface-hover rounded-[var(--radius-lg)] animate-pulse" style={{ width: '240px', height: '240px' }} />
              )}
              {user?.username && (
                <p className="font-sans text-xs text-muted" style={{ textAlign: 'center', width: '100%', display: 'block', marginTop: '24px' }}>
                  Or share your profile link: <span className="text-primary font-bold hover:underline cursor-pointer select-all">
                    /profile/{user.username}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── LEADERBOARD TAB ─── */}
      {activeTab === 'leaderboard' && (
        <div style={{ marginTop: '12px' }} className="animate-fadeInFast" role="tabpanel" id="panel-leaderboard" aria-labelledby="tab-leaderboard">
          <Leaderboard />
        </div>
      )}

      {/* Ghost Link Modal */}
      {ghostToLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeInFast">
          <div
            ref={ghostLinkTrapRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ghost-link-title"
            style={{ padding: '24px' }}
            className="bg-surface w-full max-w-md rounded-[var(--radius-lg)] shadow-xl relative animate-scaleIn"
          >
            <button
              onClick={() => { setGhostToLink(null); setGhostLinkQuery(''); }}
              className="absolute top-4 right-4 p-1.5 rounded-[var(--radius-md)] text-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer btn-press"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 id="ghost-link-title" className="font-display text-lg font-bold text-foreground mb-1">
              Link "{ghostToLink.name}"
            </h3>
            <p className="font-sans text-xs text-muted mb-5">
              Search for a user to link this legacy profile to.
            </p>
            
            <div className="relative group mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted w-4 h-4 pointer-events-none group-focus-within:text-primary transition-colors" />
              <label htmlFor="ghost-link-search" className="sr-only">Search by username or email</label>
              <input
                type="text"
                placeholder="Search by username or email..."
                value={ghostLinkQuery}
                onChange={(e) => setGhostLinkQuery(e.target.value)}
                className="w-full h-11 bg-background border border-border rounded-[var(--radius-md)] pl-10 pr-4 text-sm focus:outline-none focus:border-primary transition-colors text-foreground"
                id="ghost-link-search"
                autoFocus
              />
            </div>
            
            <div className="max-h-60 overflow-y-auto space-y-2 no-scrollbar">
              {ghostLinkQuery.length >= 2 && ghostLinkResults.length === 0 && (
                <p className="font-sans text-xs text-muted text-center py-4">No users found.</p>
              )}
              {ghostLinkResults.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-[var(--radius-md)] bg-surface-hover/50 hover:bg-surface-hover transition-colors duration-150 animate-fadeIn"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      src={u.avatarUrl}
                      name={u.displayName || u.username || 'User'}
                      size="sm"
                      frameClass={u.activeFrame?.cssClass || undefined}
                    />
                    <div className="min-w-0">
                      <p className="font-display text-xs font-bold text-foreground truncate">{u.displayName || u.username || 'Unknown'}</p>
                      {u.username && <p className="font-sans text-[10px] text-muted truncate mt-0.5">@{u.username}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleLinkGhost(u.id)}
                    disabled={actionLoading[`link-${ghostToLink.id}`]}
                    className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50 shrink-0 btn-press"
                  >
                    Link
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Global Custom Confirm/Alert Dialog */}
      {dialogConfig && (
        <ConfirmDialog
          isOpen={dialogConfig.isOpen}
          title={dialogConfig.title}
          message={dialogConfig.message}
          confirmLabel={dialogConfig.confirmLabel}
          cancelLabel={dialogConfig.cancelLabel}
          variant={dialogConfig.variant}
          type={dialogConfig.type}
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

export default Friends;
