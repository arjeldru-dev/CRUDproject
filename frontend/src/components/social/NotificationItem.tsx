import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { UserPlus, CheckCircle, Receipt, Heart, MessageSquare, Bell, Award } from 'lucide-react';
import type { AppNotification, NotificationData } from '../../store/notificationStore';
import { useNotificationStore } from '../../store/notificationStore';

interface NotificationItemProps {
  notification: AppNotification;
  onAction?: () => void;
  index?: number;
  alignCenter?: boolean;
}

const getNotificationStyles = (type: string) => {
  switch (type) {
    case 'FRIEND_REQUEST_RECEIVED':
    case 'FRIEND_REQUEST_ACCEPTED':
      return {
        ring: 'ring-1 ring-primary/20',
        iconBg: 'bg-primary/5 dark:bg-primary/10 border border-primary/20',
        iconColor: 'text-primary',
        icon: UserPlus,
      };
    case 'ADDED_TO_SPLIT':
    case 'BALANCE_CHANGED':
    case 'TRANSACTION_APPROVAL_REQUEST':
    case 'TRANSACTION_APPROVED':
    case 'TRANSACTION_REJECTED':
      return {
        ring: 'ring-1 ring-secondary/20',
        iconBg: 'bg-secondary/5 dark:bg-secondary/10 border border-secondary/20',
        iconColor: 'text-secondary',
        icon: Receipt,
      };
    case 'SETTLEMENT_REMINDER':
      return {
        ring: 'ring-1 ring-warning/20',
        iconBg: 'bg-warning/5 dark:bg-warning/10 border border-warning/20',
        iconColor: 'text-warning',
        icon: CheckCircle,
      };
    case 'BADGE_UNLOCKED':
    case 'STREAK_MILESTONE':
    case 'CHALLENGE_COMPLETED':
    case 'CHALLENGE_INVITE':
      return {
        ring: 'ring-1 ring-warning/20',
        iconBg: 'bg-warning/5 dark:bg-warning/10 border border-warning/20',
        iconColor: 'text-warning',
        icon: Award,
      };
    case 'FEED_REACTION':
      return {
        ring: 'ring-1 ring-error/20',
        iconBg: 'bg-error/5 dark:bg-error/10 border border-error/20',
        iconColor: 'text-error',
        icon: Heart,
      };
    case 'FEED_COMMENT':
      return {
        ring: 'ring-1 ring-primary/20',
        iconBg: 'bg-primary/5 dark:bg-primary/10 border border-primary/20',
        iconColor: 'text-primary',
        icon: MessageSquare,
      };
    default:
      return {
        ring: 'ring-1 ring-border',
        iconBg: 'bg-muted/5 dark:bg-muted/10 border border-border',
        iconColor: 'text-muted',
        icon: Bell,
      };
  }
};

const getNotificationContent = (notification: AppNotification, parsedData: NotificationData) => {
  const actorName = notification.actor?.displayName || notification.actor?.username || 'Someone';

  const formatAmount = (val: string | number | undefined) => {
    if (val === undefined) return '';
    const num = Number(val);
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(num);
  };

  switch (notification.type) {
    case 'FRIEND_REQUEST_RECEIVED':
      return (
        <>
          <span className="font-bold text-foreground">{actorName}</span> sent you a friend request.
        </>
      );
    case 'FRIEND_REQUEST_ACCEPTED':
      return (
        <>
          Accepted <span className="font-bold text-foreground">{actorName}’s</span> friend request.
        </>
      );
    case 'ADDED_TO_SPLIT':
      return (
        <>
          <span className="font-bold text-foreground">{actorName}</span> added you to a new expense split.
        </>
      );
    case 'BALANCE_CHANGED':
      return (
        <>
          Your balance with <span className="font-bold text-foreground">{actorName}</span> has changed.
        </>
      );
    case 'FEED_REACTION':
      return (
        <>
          <span className="font-bold text-foreground">{actorName}</span> reacted to your post.
        </>
      );
    case 'FEED_COMMENT':
      return (
        <>
          <span className="font-bold text-foreground">{actorName}</span> commented on your post.
        </>
      );
    case 'SETTLEMENT_REMINDER':
      return (
        <>
          <span className="font-bold text-foreground">{actorName}</span> sent you a settlement reminder.
        </>
      );
    case 'TRANSACTION_APPROVAL_REQUEST':
      return (
        <>
          <span className="font-bold text-foreground">{actorName}</span> asked you to approve a transaction of <span className="font-bold text-primary">{formatAmount(parsedData?.amount)}</span>.
        </>
      );
    case 'TRANSACTION_APPROVED':
      return (
        <>
          <span className="font-bold text-foreground">{actorName}</span> approved your transaction of <span className="font-bold text-success">{formatAmount(parsedData?.amount)}</span>.
        </>
      );
    case 'TRANSACTION_REJECTED':
      return (
        <>
          <span className="font-bold text-foreground">{actorName}</span> rejected your transaction of <span className="font-bold text-error">{formatAmount(parsedData?.amount)}</span>.
        </>
      );
    case 'BADGE_UNLOCKED':
      return (
        <>
          You unlocked the <span className="font-bold text-foreground">“{parsedData?.badgeName || 'Achievement'}”</span> badge!
        </>
      );
    case 'STREAK_MILESTONE':
      return (
        <>
          You hit a <span className="font-bold text-streak">{parsedData?.streakDays || 0}-day</span> streak!
        </>
      );
    case 'CHALLENGE_COMPLETED':
      return (
        <>
          You completed the <span className="font-bold text-foreground">“{parsedData?.challengeName || 'Challenge'}”</span> challenge!
        </>
      );
    case 'CHALLENGE_INVITE':
      return (
        <>
          <span className="font-bold text-foreground">{actorName}</span> invited you to the <span className="font-bold text-foreground">“{parsedData?.challengeName || 'Challenge'}”</span> challenge.
        </>
      );
    default:
      return <>{actorName} triggered a notification.</>;
  }
};

const getNotificationUrl = (notification: AppNotification) => {
  switch (notification.type) {
    case 'FRIEND_REQUEST_RECEIVED': return '/friends?tab=requests';
    case 'FRIEND_REQUEST_ACCEPTED': return notification.actor?.username ? `/profile/${notification.actor.username}` : '/friends';
    case 'ADDED_TO_SPLIT':
    case 'BALANCE_CHANGED':
    case 'SETTLEMENT_REMINDER':
    case 'TRANSACTION_APPROVED':
    case 'TRANSACTION_REJECTED': return '/transactions';
    case 'TRANSACTION_APPROVAL_REQUEST': return '/dashboard';
    case 'FEED_REACTION':
    case 'FEED_COMMENT': return '/feed';
    case 'BADGE_UNLOCKED': return '/challenges?tab=badges';
    case 'STREAK_MILESTONE': return '/challenges?tab=badges';
    case 'CHALLENGE_COMPLETED':
    case 'CHALLENGE_INVITE': return '/challenges?tab=active';
    default: return null;
  }
};

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onAction, index, alignCenter }) => {
  const navigate = useNavigate();
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const [imageError, setImageError] = React.useState(false);

  // Reset image error state if actor avatar changes
  React.useEffect(() => {
    setImageError(false);
  }, [notification.actor?.avatarUrl]);

  const parsedData = React.useMemo<NotificationData>(() => {
    return notification.data || {};
  }, [notification.data]);

  const handleClick = () => {
    if (!notification.read) {
      // Execute asynchronously to prevent network/navigation blocking (optimistic feel)
      markAsRead(notification.id).catch((err) => {
        console.error('Failed to mark notification as read:', err);
      });
    }
    
    if (onAction) onAction();

    const url = getNotificationUrl(notification);
    if (url) navigate(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const actorName = notification.actor?.displayName || notification.actor?.username || 'User';
  const styles = getNotificationStyles(notification.type);
  const IconComponent = styles.icon;

  // Use avatar if it's an actor-driven notification and the actor has a valid avatarUrl
  const useAvatar = ['FRIEND_REQUEST_RECEIVED', 'FRIEND_REQUEST_ACCEPTED', 'ADDED_TO_SPLIT', 'BALANCE_CHANGED', 'FEED_REACTION', 'FEED_COMMENT', 'TRANSACTION_APPROVAL_REQUEST', 'TRANSACTION_APPROVED', 'TRANSACTION_REJECTED', 'CHALLENGE_INVITE'].includes(notification.type) && notification.actor?.avatarUrl;

  // Stagger loading delays capped at the first 8 elements to maintain snappy loading above-the-fold
  const animationDelay = index !== undefined ? `${Math.min(index, 7) * 40}ms` : undefined;

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Notification: ${actorName}`}
      style={{ animationDelay }}
      className={`relative flex ${
        alignCenter ? 'items-center' : 'items-start'
      } p-3.5 sm:p-4 md:p-6 gap-3 md:gap-4 ${
        !notification.read
          ? 'bg-surface-hover/50 dark:bg-surface-hover/30'
          : 'bg-surface dark:bg-transparent'
      } hover:bg-surface-hover transition-[transform,background-color] duration-200 ease-out-emil cursor-pointer border-b border-border/60 last:border-0 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px] active:scale-[0.985] animate-stagger-card`}
    >
      {/* Avatar or Icon */}
      <div className="relative flex-shrink-0">
        {useAvatar && !imageError ? (
          <div className={`w-10 h-10 md:w-11 md:h-11 rounded-full p-[1px] md:p-0.5 ${styles.ring} overflow-hidden bg-background`}>
            <img
              src={notification.actor?.avatarUrl!}
              alt={actorName}
              className="w-full h-full object-cover rounded-full"
              onError={() => setImageError(true)}
            />
          </div>
        ) : (
          <div className={`w-10 h-10 md:w-11 md:h-11 rounded-full ${styles.iconBg} flex items-center justify-center ${styles.iconColor} font-bold text-xs md:text-sm`}>
            {useAvatar ? (
              actorName.substring(0, 2).toUpperCase()
            ) : (
              <IconComponent className="w-5 h-5" />
            )}
          </div>
        )}
        
        {/* Pulsing unread dot */}
        {!notification.read && (
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-primary border border-border unread-pulse" />
        )}
      </div>
      
      {/* Content Text */}
      <div className="flex-1 min-w-0 pr-2">
        <p className={`font-sans text-sm md:text-base leading-snug break-words ${!notification.read ? 'text-foreground font-medium' : 'text-muted'}`}>
          {getNotificationContent(notification, parsedData)}
        </p>
        <span className="text-[11px] md:text-xs text-muted mt-1 block">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
};

export default React.memo(NotificationItem);
