import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import Avatar from '../ui/Avatar';
import { Users, AlertCircle } from 'lucide-react';

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

const FeedFriendsSidebar: React.FC = () => {
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchFriends = useCallback(async () => {
    try {
      setError('');
      const listRes = await api.get('/friends/list');
      setFriends(listRes.data.friends || []);
    } catch (err) {
      console.error('Failed to load friends sidebar:', err);
      setError('Could not load friends.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <aside className="w-full">
      <div className="flex items-center gap-2.5 mb-7 px-1">
        <Users className="w-5 h-5 text-primary" />
        <h2 className="font-display font-bold text-lg sm:text-xl text-foreground uppercase tracking-wider">
          Friends Ledger
        </h2>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface-hover/20 dark:bg-surface-hover/10 rounded-2xl p-3.5 flex flex-col items-center justify-center h-48 gap-2">
              <div className="w-14 h-14 rounded-full bg-surface-hover" />
              <div className="h-3 bg-surface-hover rounded w-16" />
              <div className="h-2.5 bg-surface-hover rounded w-12" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-error/5 border border-error/10 text-error text-xs font-sans">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={fetchFriends}
            className="text-[10px] font-bold underline hover:text-error/80 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : friends.length === 0 ? (
        <div className="text-center py-6 px-4">
          <p className="text-xs text-muted font-sans leading-relaxed">
            No friends connected yet. Connect in the Friends tab to split expenses.
          </p>
          <Link
            to="/friends?tab=discover"
            className="mt-3.5 inline-block text-[11px] font-bold text-primary hover:underline font-display"
          >
            Find Friends &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-4 font-sans">
          <div className="grid grid-cols-2 gap-3">
            {friends.slice(0, 4).map((friend) => {
              const isOwes = friend.netBalance > 0;
              const isOwed = friend.netBalance < 0;
              const balanceText = isOwes
                ? `+${fmt(friend.netBalance)}`
                : isOwed
                  ? `-${fmt(Math.abs(friend.netBalance))}`
                  : '₱0';
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

              const displayName = friend.displayName || friend.username || 'User';

              const cardContent = (
                <div className="flex flex-col items-center text-center p-3.5 h-full relative justify-center gap-2">
                  <div className="shrink-0">
                    <Avatar
                      src={friend.avatarUrl}
                      name={displayName}
                      size="md"
                      className="w-14 h-14 rounded-full"
                      frameClass={friend.activeFrame?.cssClass || undefined}
                    />
                  </div>
                  
                  <div className="w-full">
                    <h3 className="text-xs sm:text-sm font-semibold text-foreground leading-tight truncate w-full px-1">
                      {displayName}
                    </h3>
                    {friend.username && (
                      <span className="text-[10px] text-muted truncate w-full px-1 block mt-0.5 font-sans">
                        @{friend.username}
                      </span>
                    )}
                  </div>
                  
                  <div className="w-full">
                    <div className={`font-mono text-sm font-bold tracking-tight ${balanceClass}`}>
                      {balanceText}
                    </div>
                    <p className="font-sans text-[8px] sm:text-[9px] text-muted mt-0.5 uppercase tracking-wider font-semibold">
                      {balanceLabel}
                    </p>
                  </div>
                </div>
              );

              return friend.username ? (
                <Link
                  key={friend.friendshipId}
                  to={`/profile/${friend.username}`}
                  className="bg-surface-hover/20 dark:bg-surface-hover/10 rounded-2xl overflow-hidden block transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer h-48"
                >
                  {cardContent}
                </Link>
              ) : (
                <div
                  key={friend.friendshipId}
                  className="bg-surface-hover/20 dark:bg-surface-hover/10 rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm h-48"
                >
                  {cardContent}
                </div>
              );
            })}
          </div>

          {friends.length > 4 && (
            <div className="pt-3 text-center border-t border-border-subtle">
              <Link
                to="/friends"
                className="text-[11px] font-bold text-muted hover:text-primary transition-colors font-display"
              >
                View all friends ({friends.length})
              </Link>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};

export default FeedFriendsSidebar;
