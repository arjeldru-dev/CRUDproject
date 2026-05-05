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
      <div className="animate-fadeInFast">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="h-9 w-48 bg-surface-hover rounded-lg animate-pulse mb-2" />
            <div className="h-4 w-72 bg-surface rounded-lg animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-surface-hover rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-20 bg-surface rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeInFast">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-fluid-h1 font-display font-semibold text-foreground tracking-tight">
            Friends & Ghosts
          </h1>
          <p className="text-muted text-base font-medium mt-1">
            Manage the people you split expenses with
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

      <div className="divider mb-8" />

      {/* ── Error Banner ────────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-2 p-4 mb-6 rounded-xl bg-error/10 border border-error/20 text-error text-sm"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchFriends}
            className="ml-auto text-xs font-medium underline hover:text-error/80 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Add Friend Form (Slide-down) ────────────────────────────── */}
      {showForm && (
        <div className="mb-8 p-6 bg-surface border border-border-subtle rounded-2xl animate-slideDownIn">
          <h3 className="text-base font-display font-semibold text-foreground mb-5 flex items-center gap-2">
            New Friend Profile
          </h3>

          {formError && (
            <div className="flex items-center gap-2 p-3 mb-5 rounded-xl bg-error/10 border border-error/20 text-error text-sm" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0" />
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
            <div className="flex flex-col gap-1.5 w-full sm:w-auto">
              <label className="text-xs font-medium text-muted tracking-wide" htmlFor="ghost-toggle">
                Profile Type
              </label>
              <button
                type="button"
                id="ghost-toggle"
                onClick={() => setFormIsGhost((v) => !v)}
                className={`
                  flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold
                  transition-all duration-200 cursor-pointer whitespace-nowrap border
                  ${
                    formIsGhost
                      ? 'bg-primary text-white border-primary hover:bg-primary/90'
                      : 'bg-surface text-foreground border-border hover:bg-surface-hover'
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
              size="lg"
              id="friend-submit"
            >
              Add
            </Button>
          </form>
        </div>
      )}

      {/* ── Search Bar (only when friends exist) ────────────────────── */}
      {friends.length > 0 && (
        <div className="mb-6">
          <Input
            label="Search friends"
            hideLabel
            type="text"
            placeholder="Search friends..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="friend-search"
            leftIcon={<Search className="w-5 h-5 text-muted" />}
          />
        </div>
      )}

      {/* ── Friend Cards Grid ───────────────────────────────────────── */}
      {friends.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 container-subtle rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
            <Users className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-xl font-display font-semibold text-foreground mb-2">No Friends Yet</h3>
          <p className="text-sm text-muted mb-6 text-center max-w-sm">
            Add friends or ghost profiles to start splitting expenses with them.
          </p>
          <Button
            onClick={() => setShowForm(true)}
            size="lg"
            id="add-friend-empty"
          >
            <Plus className="w-4 h-4" /> Add Friend
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        /* Search — No Results */
        <div className="flex flex-col items-center justify-center py-16 container-subtle rounded-2xl">
          <Search className="w-8 h-8 text-muted mb-4" />
          <p className="text-sm text-muted">
            No friends match "<span className="text-foreground font-medium">{search}</span>"
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-slideUpIn">
          {filtered.map((friend) => (
            <div
              key={friend.id}
              className="group container-card container-card-interactive p-5"
            >
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div
                  className={`
                    w-10 h-10 flex items-center justify-center rounded-xl
                    ${
                      friend.isGhost
                        ? 'bg-secondary/15 text-secondary'
                        : 'bg-primary/15 text-primary'
                    }
                  `}
                >
                  {friend.isGhost ? (
                    <Ghost className="w-5 h-5" />
                  ) : (
                    <UserPlus className="w-5 h-5" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {friend.name}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
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
