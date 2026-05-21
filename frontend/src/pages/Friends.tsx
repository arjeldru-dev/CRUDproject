import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Avatar from '../components/ui/Avatar';
import {
  Users, Search, AlertCircle, UserPlus, Clock, Send,
  Check, X, Ghost, ChevronDown, ChevronUp, QrCode, Mail, Link2, Trash2, Trophy,
} from 'lucide-react';
import Leaderboard from '../components/gamification/Leaderboard';

// ── Types ─────────────────────────────────────────────────────────────
interface FriendListItem {
  friendshipId: string;
  friendId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  netBalance: number;
  createdAt: string;
}

interface FriendRequestItem {
  id: string;
  senderId: string;
  receiverId: string;
  senderProfile?: { username: string | null; displayName: string | null; avatarUrl: string | null };
  receiverProfile?: { username: string | null; displayName: string | null; avatarUrl: string | null };
  status: string;
  createdAt: string;
}

interface UserSearchResult {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  relationshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'friends';
}

interface GhostProfile {
  id: string;
  name: string;
  isGhost: boolean;
}

type TabKey = 'friends' | 'requests' | 'discover' | 'leaderboard';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'friends', label: 'My Friends', icon: Users },
  { key: 'requests', label: 'Requests', icon: Clock },
  { key: 'discover', label: 'Discover', icon: Search },
  { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
];

// ── Main Component ────────────────────────────────────────────────────
const Friends: React.FC = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>('friends');

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
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Ghost profiles
  const [ghosts, setGhosts] = useState<GhostProfile[]>([]);
  const [ghostsExpanded, setGhostsExpanded] = useState(false);

  // Ghost Linking
  const [ghostToLink, setGhostToLink] = useState<GhostProfile | null>(null);
  const [ghostLinkQuery, setGhostLinkQuery] = useState('');
  const [ghostLinkResults, setGhostLinkResults] = useState<UserSearchResult[]>([]);
  const ghostSearchTimer = useRef<any>(null);

  // Action loading states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [slidingOut, setSlidingOut] = useState<Record<string, boolean>>({});

  // Invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState('');

  const searchTimer = useRef<any>(null);

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
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/friends/search?q=${encodeURIComponent(searchQuery.trim())}`);
        setSearchResults(res.data.results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  // ── Ghost Link Search ─────────────────────────────────────────────
  useEffect(() => {
    if (ghostSearchTimer.current) clearTimeout(ghostSearchTimer.current);
    if (ghostLinkQuery.trim().length < 2) {
      setGhostLinkResults([]);
      return;
    }
    ghostSearchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/friends/search?q=${encodeURIComponent(ghostLinkQuery.trim())}`);
        setGhostLinkResults(res.data.results);
      } catch {
        setGhostLinkResults([]);
      }
    }, 300);
    return () => { if (ghostSearchTimer.current) clearTimeout(ghostSearchTimer.current); };
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

  const handleRemoveFriend = async (friendshipId: string) => {
    if (!confirm('Remove this friend? Historical ledger data will be preserved.')) return;
    setLoading(friendshipId, true);
    try {
      await api.delete(`/friends/${friendshipId}`);
      setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    } catch { /* noop */ }
    finally { setLoading(friendshipId, false); }
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
      alert('Failed to link ghost profile');
    } finally {
      setLoading(`link-${ghostToLink.id}`, false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) return;
    try {
      await api.post('/friends/invite', { email: inviteEmail.trim() });
      setInviteStatus('Invitation logged!');
      setInviteEmail('');
      setTimeout(() => setInviteStatus(''), 3000);
    } catch {
      setInviteStatus('Failed to send invite.');
    }
  };

  const handleDeleteGhost = async (ghostId: string) => {
    if (!confirm('Are you sure you want to delete this ghost profile? Any associated ledger entries will lose this connection.')) return;
    setLoading(`delete-${ghostId}`, true);
    try {
      await api.delete(`/friends/ghost/${ghostId}`);
      setGhosts((prev) => prev.filter((g) => g.id !== ghostId));
      fetchFriends();
    } catch {
      alert('Failed to delete ghost profile. It might be linked to existing data.');
    } finally {
      setLoading(`delete-${ghostId}`, false);
    }
  };

  const requestCount = received.length + sent.length;

  // ── Skeleton ──────────────────────────────────────────────────────
  if (friendsLoading && requestsLoading) {
    return (
      <div className="animate-fadeInFast">
        <div className="h-9 w-48 bg-surface-hover rounded-lg animate-pulse mb-2" />
        <div className="h-4 w-72 bg-surface rounded-lg animate-pulse mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-surface rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeInFast">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-fluid-h1 font-display font-semibold text-foreground tracking-tight">
          Friends
        </h1>
        <p className="text-muted text-base font-medium mt-1">
          Connect with people you split expenses with
        </p>
      </div>

      <div className="divider mb-6" />

      {/* Tab Bar */}
      <div className="flex gap-1 mb-8 p-1 bg-surface rounded-xl border border-border-subtle">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            id={`tab-${tab.key}`}
            className={`
              flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg
              transition-all duration-200 cursor-pointer relative
              ${activeTab === tab.key
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted hover:text-foreground hover:bg-surface-hover'
              }
            `}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.key === 'requests' && requestCount > 0 && (
              <span className={`
                min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center
                ${activeTab === 'requests' ? 'bg-white/20 text-white' : 'bg-primary/15 text-primary'}
              `}>
                {requestCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {friendsError && (
        <div className="flex items-center gap-2 p-4 mb-6 rounded-xl bg-error/10 border border-error/20 text-error text-sm" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{friendsError}</span>
          <button onClick={fetchFriends} className="ml-auto text-xs font-medium underline hover:text-error/80 transition-colors cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* ═══ MY FRIENDS TAB ═══ */}
      {activeTab === 'friends' && (
        <div className="animate-fadeInFast">
          {friends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 container-subtle rounded-2xl">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                <Users className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-display font-semibold text-foreground mb-2">No Friends Yet</h3>
              <p className="text-sm text-muted mb-6 text-center max-w-sm">
                Find friends to start splitting expenses together.
              </p>
              <Button onClick={() => setActiveTab('discover')} size="lg" id="find-friends-cta">
                <Search className="w-4 h-4" /> Find Friends
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-slideUpIn">
              {friends.map((friend) => (
                <div key={friend.friendshipId} className="group container-card container-card-interactive p-5">
                  <div className="flex items-center gap-4">
                    <Avatar
                      src={friend.avatarUrl}
                      name={friend.displayName || friend.username || 'User'}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {friend.displayName || friend.username || 'Unknown'}
                      </p>
                      {friend.username && (
                        <p className="text-xs text-muted truncate">@{friend.username}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${
                        friend.netBalance > 0 ? 'text-success' : friend.netBalance < 0 ? 'text-error' : 'text-muted'
                      }`}>
                        {friend.netBalance > 0 ? '+' : ''}
                        {friend.netBalance !== 0 ? `₱${Math.abs(friend.netBalance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                      </p>
                      <p className="text-[10px] text-muted mt-0.5">
                        {friend.netBalance > 0 ? 'owes you' : friend.netBalance < 0 ? 'you owe' : 'settled'}
                      </p>
                    </div>
                  </div>
                  {/* Remove button on hover */}
                  <div className="mt-3 pt-3 border-t border-border-subtle opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleRemoveFriend(friend.friendshipId)}
                      disabled={actionLoading[friend.friendshipId]}
                      className="text-xs text-muted hover:text-error font-medium transition-colors cursor-pointer"
                    >
                      Remove Friend
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Ghost Profiles Section */}
          {ghosts.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setGhostsExpanded((v) => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground transition-colors cursor-pointer mb-4"
                id="toggle-ghosts"
              >
                <Ghost className="w-4 h-4" />
                Legacy Ghost Profiles ({ghosts.length})
                {ghostsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {ghostsExpanded && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-slideDownIn">
                  {ghosts.map((ghost) => (
                    <div key={ghost.id} className="container-card p-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-secondary/15 flex items-center justify-center">
                        <Ghost className="w-4 h-4 text-secondary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{ghost.name}</p>
                        <p className="text-[10px] text-muted">Ghost Profile</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setGhostToLink(ghost)}
                          className="text-xs text-primary font-medium hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <Link2 className="w-3 h-3" /> Link
                        </button>
                        <button 
                          onClick={() => handleDeleteGhost(ghost.id)}
                          disabled={actionLoading[`delete-${ghost.id}`]}
                          className="text-xs text-error font-medium hover:underline cursor-pointer flex items-center gap-1 ml-2 disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
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

      {/* ═══ REQUESTS TAB ═══ */}
      {activeTab === 'requests' && (
        <div className="animate-fadeInFast space-y-8">
          {/* Received Requests */}
          <div>
            <h3 className="text-base font-display font-semibold text-foreground mb-4 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" /> Received
              {received.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                  {received.length}
                </span>
              )}
            </h3>
            {received.length === 0 ? (
              <div className="container-subtle rounded-xl p-8 text-center">
                <p className="text-sm text-muted">No pending requests</p>
                <p className="text-xs text-muted mt-1">Share your QR code to let friends connect with you</p>
              </div>
            ) : (
              <div className="space-y-3">
                {received.map((req) => (
                  <div
                    key={req.id}
                    className={`container-card p-4 flex items-center gap-4 transition-all duration-300 ${
                      slidingOut[req.id] ? 'animate-slideOutLeft' : ''
                    }`}
                  >
                    <Avatar
                      src={req.senderProfile?.avatarUrl}
                      name={req.senderProfile?.displayName || req.senderProfile?.username || 'User'}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {req.senderProfile?.displayName || req.senderProfile?.username || 'Unknown'}
                      </p>
                      {req.senderProfile?.username && (
                        <p className="text-xs text-muted">@{req.senderProfile.username}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleAccept(req.id)}
                        isLoading={actionLoading[req.id]}
                        id={`accept-${req.id}`}
                      >
                        <Check className="w-3.5 h-3.5" /> Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDecline(req.id)}
                        disabled={actionLoading[req.id]}
                        id={`decline-${req.id}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sent Requests */}
          <div>
            <h3 className="text-base font-display font-semibold text-foreground mb-4 flex items-center gap-2">
              <Send className="w-4 h-4 text-muted" /> Sent
            </h3>
            {sent.length === 0 ? (
              <div className="container-subtle rounded-xl p-8 text-center">
                <p className="text-sm text-muted">No outgoing requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sent.map((req) => (
                  <div
                    key={req.id}
                    className={`container-card p-4 flex items-center gap-4 transition-all duration-300 ${
                      slidingOut[req.id] ? 'animate-slideOutLeft' : ''
                    }`}
                  >
                    <Avatar
                      src={req.receiverProfile?.avatarUrl}
                      name={req.receiverProfile?.displayName || req.receiverProfile?.username || 'User'}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {req.receiverProfile?.displayName || req.receiverProfile?.username || 'Unknown'}
                      </p>
                      {req.receiverProfile?.username && (
                        <p className="text-xs text-muted">@{req.receiverProfile.username}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCancel(req.id)}
                      isLoading={actionLoading[req.id]}
                      id={`cancel-${req.id}`}
                      className="text-error hover:text-error"
                    >
                      Cancel
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ DISCOVER TAB ═══ */}
      {activeTab === 'discover' && (
        <div className="animate-fadeInFast">
          {/* Search */}
          <div className="mb-6">
            <Input
              label="Search users"
              hideLabel
              type="text"
              placeholder="Search by username, email, or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="user-search"
              leftIcon={<Search className="w-5 h-5 text-muted" />}
            />
          </div>

          {/* Search Results */}
          {searchQuery.trim().length >= 2 && (
            <div className="mb-8">
              {searching ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-surface rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-3 animate-slideUpIn">
                  {searchResults.map((result) => (
                    <div key={result.id} className="container-card p-4 flex items-center gap-4">
                      <Avatar
                        src={result.avatarUrl}
                        name={result.displayName || result.username || 'User'}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {result.displayName || result.username || 'Unknown'}
                        </p>
                        {result.username && (
                          <p className="text-xs text-muted">@{result.username}</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {result.relationshipStatus === 'none' && (
                          <Button
                            size="sm"
                            onClick={() => handleSendRequest(result.id)}
                            isLoading={actionLoading[result.id]}
                            id={`add-${result.id}`}
                          >
                            <UserPlus className="w-3.5 h-3.5" /> Add
                          </Button>
                        )}
                        {result.relationshipStatus === 'pending_sent' && (
                          <span className="text-xs font-semibold text-muted bg-surface-hover px-3 py-2 rounded-lg inline-flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" /> Pending
                          </span>
                        )}
                        {result.relationshipStatus === 'pending_received' && (
                          <Button size="sm" variant="outline" onClick={() => setActiveTab('requests')}>
                            Respond
                          </Button>
                        )}
                        {result.relationshipStatus === 'friends' && (
                          <span className="text-xs font-semibold text-success bg-success/10 px-3 py-2 rounded-lg inline-flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5" /> Friends
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="container-subtle rounded-xl p-8 text-center">
                  <p className="text-sm text-muted mb-4">
                    No users found for "<span className="text-foreground font-medium">{searchQuery}</span>"
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <Input
                      label="Invite email"
                      hideLabel
                      type="email"
                      placeholder="Invite via email..."
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      id="invite-email"
                      className="max-w-xs"
                    />
                    <Button size="sm" variant="outline" onClick={handleInvite} id="invite-btn">
                      <Mail className="w-3.5 h-3.5" /> Invite
                    </Button>
                  </div>
                  {inviteStatus && (
                    <p className="text-xs text-success mt-2">{inviteStatus}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* QR Code Section */}
          <div className="container-card p-6 rounded-2xl text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <QrCode className="w-5 h-5 text-primary" />
              <h3 className="text-base font-display font-semibold text-foreground">Your QR Code</h3>
            </div>
            <p className="text-sm text-muted mb-5 max-w-sm mx-auto">
              Let friends scan this to instantly send you a friend request
            </p>
            {qrDataUrl ? (
              <div className="inline-block p-4 bg-white rounded-2xl shadow-sm">
                <img src={qrDataUrl} alt="Profile QR Code" className="w-48 h-48" />
              </div>
            ) : (
              <div className="w-48 h-48 mx-auto bg-surface rounded-2xl animate-pulse" />
            )}
            {user?.username && (
              <p className="text-xs text-muted mt-4">
                Or share your profile link: <span className="text-primary font-medium">
                  /profile/{user.username}
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* ═══ LEADERBOARD TAB ═══ */}
      {activeTab === 'leaderboard' && (
        <div className="animate-fadeInFast">
          <Leaderboard />
        </div>
      )}

      {/* Ghost Link Modal */}
      {ghostToLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fadeInFast">
          <div className="bg-surface w-full max-w-md rounded-2xl p-6 shadow-xl relative animate-slideUpIn">
            <button
              onClick={() => { setGhostToLink(null); setGhostLinkQuery(''); }}
              className="absolute top-4 right-4 text-muted hover:text-foreground cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-xl font-display font-semibold text-foreground mb-1">
              Link "{ghostToLink.name}"
            </h3>
            <p className="text-sm text-muted mb-5">
              Search for a user to link this legacy profile to.
            </p>
            
            <Input
              label="Search user"
              hideLabel
              type="text"
              placeholder="Search by username or email..."
              value={ghostLinkQuery}
              onChange={(e) => setGhostLinkQuery(e.target.value)}
              id="ghost-link-search"
              leftIcon={<Search className="w-4 h-4 text-muted" />}
              autoFocus
            />
            
            <div className="mt-4 max-h-60 overflow-y-auto space-y-2">
              {ghostLinkQuery.length >= 2 && ghostLinkResults.length === 0 && (
                <p className="text-sm text-muted text-center py-4">No users found.</p>
              )}
              {ghostLinkResults.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl border border-border-subtle bg-surface-hover">
                  <Avatar src={u.avatarUrl} name={u.displayName || u.username || 'User'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{u.displayName || u.username || 'Unknown'}</p>
                    {u.username && <p className="text-xs text-muted truncate">@{u.username}</p>}
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => handleLinkGhost(u.id)}
                    isLoading={actionLoading[`link-${ghostToLink.id}`]}
                  >
                    Link
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Friends;
