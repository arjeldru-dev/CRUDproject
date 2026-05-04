import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { Users, Plus, Ghost, UserPlus, X, AlertCircle, Search } from 'lucide-react';

/** Shape of a FriendProfile row from the backend. */
interface Friend {
  id: string;
  name: string;
  isGhost: boolean;
  mainUserId: string;
}

/**
 * Friends & Ghosts Directory — Phase 6, Step 6.1
 * Displays the user's friend/ghost list with an inline creation form.
 */
const Friends: React.FC = () => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Form State ──────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formIsGhost, setFormIsGhost] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // ── Search / Filter ─────────────────────────────────────────────────
  const [search, setSearch] = useState('');

  // ── Data Fetching ───────────────────────────────────────────────────
  const fetchFriends = useCallback(async () => {
    try {
      setError('');
      const res = await api.get('/friends');
      setFriends(res.data.friends);
    } catch {
      setError('Failed to load friends. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  // ── Create Friend ───────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmed = formName.trim();
    if (!trimmed) {
      setFormError('Name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/friends', {
        name: trimmed,
        isGhost: formIsGhost,
      });
      // Optimistic prepend — new friend appears instantly at top
      setFriends((prev) => [res.data.friend, ...prev]);
      setFormName('');
      setFormIsGhost(true);
      setShowForm(false);
    } catch {
      setFormError('Failed to add friend. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Filtered List ───────────────────────────────────────────────────
  const filtered = friends.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()),
  );

  // ── Skeleton Loader ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="h-7 w-48 bg-white/5 rounded-lg animate-pulse" />
            <div className="h-4 w-72 bg-white/5 rounded-lg animate-pulse mt-2" />
          </div>
          <div className="h-10 w-32 bg-white/5 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-24 bg-surface border border-border shadow-resting rounded-2xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
              <Users className="w-5 h-5 text-white" />
            </div>
            Friends & Ghosts
          </h1>
          <p className="text-text-secondary mt-1 text-sm">
            Manage the people you split expenses with.
          </p>
        </div>
        <Button
          onClick={() => setShowForm((v) => !v)}
          variant={showForm ? 'outline' : 'primary'}
          size="md"
          id="add-friend-toggle"
        >
          {showForm ? (
            <>
              <X className="w-4 h-4" /> Cancel
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" /> Add Friend
            </>
          )}
        </Button>
      </div>

      {/* ── Error Banner ────────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-2 p-3 mb-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchFriends}
            className="ml-auto text-xs underline hover:text-red-300 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Add Friend Form (Slide-down) ────────────────────────────── */}
      {showForm && (
        <div className="mb-6 p-5 bg-surface border border-border shadow-resting rounded-2xl animate-in">
          <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-accent-primary" />
            New Friend Profile
          </h3>

          {formError && (
            <div className="flex items-center gap-2 p-2.5 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs" role="alert">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <Input
                label="Name"
                type="text"
                placeholder="e.g. John Doe"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                id="friend-name-input"
              />
            </div>

            {/* Ghost Toggle */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary" htmlFor="ghost-toggle">
                Profile Type
              </label>
              <button
                type="button"
                id="ghost-toggle"
                onClick={() => setFormIsGhost((v) => !v)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium
                  transition-all duration-200 cursor-pointer whitespace-nowrap
                  ${
                    formIsGhost
                      ? 'border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/15'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
                  }
                `}
              >
                {formIsGhost ? (
                  <>
                    <Ghost className="w-4 h-4" /> Ghost
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" /> Real User
                  </>
                )}
              </button>
            </div>

            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={isSubmitting}
              size="md"
              id="friend-submit"
            >
              Add
            </Button>
          </form>
        </div>
      )}

      {/* ── Search Bar (only when friends exist) ────────────────────── */}
      {friends.length > 0 && (
        <div className="mb-5 relative">
          <label htmlFor="friend-search" className="sr-only">Search friends</label>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Search friends..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="friend-search"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border text-text-primary placeholder-text-secondary shadow-sm text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent-primary/40 focus:border-accent-primary hover:border-text-secondary/30"
          />
        </div>
      )}

      {/* ── Friend Cards Grid ───────────────────────────────────────── */}
      {friends.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border bg-surface/50 rounded-2xl">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-5">
            <Users className="w-8 h-8 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">No friends yet</h3>
          <p className="text-sm text-text-secondary mb-5 text-center max-w-xs">
            Add friends or ghost profiles to start splitting expenses with them.
          </p>
          <Button
            onClick={() => setShowForm(true)}
            size="md"
            id="add-friend-empty"
          >
            <Plus className="w-4 h-4" /> Add your first friend
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        /* Search — No Results */
        <div className="flex flex-col items-center justify-center py-16">
          <Search className="w-8 h-8 text-zinc-600 mb-3" />
          <p className="text-sm text-text-secondary">
            No friends match "<span className="text-text-secondary">{search}</span>".
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((friend) => (
            <div
              key={friend.id}
              className="group bg-surface border border-border rounded-2xl p-5 shadow-resting hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div
                  className={`
                    w-10 h-10 rounded-xl flex items-center justify-center shadow-lg
                    group-hover:scale-110 transition-transform duration-300
                    ${
                      friend.isGhost
                        ? 'bg-gradient-to-br from-purple-500 to-pink-500'
                        : 'bg-gradient-to-br from-emerald-400 to-accent-positive'
                    }
                  `}
                >
                  {friend.isGhost ? (
                    <Ghost className="w-5 h-5 text-white" />
                  ) : (
                    <UserPlus className="w-5 h-5 text-white" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {friend.name}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {friend.isGhost ? 'Ghost Profile' : 'Linked User'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Friends;
