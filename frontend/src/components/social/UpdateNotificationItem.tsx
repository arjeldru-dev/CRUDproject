import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { hasUnseenUpdate, markUpdatesSeen, latestUpdateTitle, latestUpdateDate } from '../../lib/updates';

interface UpdateNotificationItemProps {
  onAction?: () => void;
  alignCenter?: boolean;
}

/**
 * A persistent "What's New" entry rendered at the top of the notifications
 * list. Unread until the user opens What's New (or taps it); afterwards it
 * stays in the list, shown as read. Seen-state is tracked per account.
 */
const UpdateNotificationItem: React.FC<UpdateNotificationItemProps> = ({ onAction, alignCenter }) => {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const unread = hasUnseenUpdate(userId);

  const handleClick = () => {
    markUpdatesSeen(userId);
    onAction?.();
    navigate('/whats-new');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const date = latestUpdateDate ? new Date(latestUpdateDate) : new Date();

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label="App update notification"
      className={`relative flex ${
        alignCenter ? 'items-center' : 'items-start'
      } p-3.5 sm:p-4 md:p-6 gap-3 md:gap-4 ${
        unread ? 'bg-surface-hover/50 dark:bg-surface-hover/30' : 'bg-surface dark:bg-transparent'
      } hover:bg-surface-hover transition-[transform,background-color] duration-200 ease-out-emil cursor-pointer border-b border-border/60 last:border-0 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px] active:scale-[0.985] animate-stagger-card`}
    >
      {/* Icon */}
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-primary/5 dark:bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Sparkles className="w-5 h-5" aria-hidden="true" />
        </div>
        {unread && (
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-primary border border-border unread-pulse" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pr-2">
        <p
          className={`font-sans text-sm md:text-base leading-snug break-words ${
            unread ? 'text-foreground font-medium' : 'text-muted'
          }`}
        >
          {latestUpdateTitle ? (
            <>
              New update: <span className="font-bold text-foreground">{latestUpdateTitle}</span>. Tap to see what's new.
            </>
          ) : (
            <>New update available. Tap to see what's new.</>
          )}
        </p>
        <span className="text-[11px] md:text-xs text-muted mt-1 block">
          {formatDistanceToNow(date, { addSuffix: true })}
        </span>
      </div>
    </div>
  );
};

export default UpdateNotificationItem;
