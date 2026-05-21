import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { UserPlus, CheckCircle, Receipt, Wallet, Heart, MessageSquare, Bell } from 'lucide-react';
import Avatar from '../ui/Avatar';
import type { AppNotification } from '../../store/notificationStore';
import { useNotificationStore } from '../../store/notificationStore';

interface NotificationItemProps {
  notification: AppNotification;
  onAction?: () => void;
}

const getIcon = (type: string) => {
  switch (type) {
    case 'FRIEND_REQUEST_RECEIVED': return <UserPlus className="w-4 h-4 text-primary" />;
    case 'FRIEND_REQUEST_ACCEPTED': return <CheckCircle className="w-4 h-4 text-success" />;
    case 'ADDED_TO_SPLIT': return <Receipt className="w-4 h-4 text-primary" />;
    case 'BALANCE_CHANGED': return <Wallet className="w-4 h-4 text-primary" />;
    case 'FEED_REACTION': return <Heart className="w-4 h-4 text-error" />;
    case 'FEED_COMMENT': return <MessageSquare className="w-4 h-4 text-primary" />;
    case 'SETTLEMENT_REMINDER': return <Bell className="w-4 h-4 text-secondary" />; // Changed from warning to secondary
    case 'TRANSACTION_APPROVAL_REQUEST': return <Receipt className="w-4 h-4 text-warning" />;
    case 'TRANSACTION_APPROVED': return <CheckCircle className="w-4 h-4 text-success" />;
    default: return <Bell className="w-4 h-4 text-muted" />;
  }
};

const getNotificationText = (notification: AppNotification) => {
  const actorName = notification.actor?.displayName || notification.actor?.username || 'Someone';
  let parsedData: any = {};
  if (notification.data) {
    try {
      parsedData = typeof notification.data === 'string' ? JSON.parse(notification.data) : notification.data;
    } catch (e) {
      // Ignore
    }
  }

  switch (notification.type) {
    case 'FRIEND_REQUEST_RECEIVED': return `${actorName} sent you a friend request.`;
    case 'FRIEND_REQUEST_ACCEPTED': return `${actorName} accepted your friend request.`;
    case 'ADDED_TO_SPLIT': return `${actorName} added you to a new expense split.`;
    case 'BALANCE_CHANGED': return `Your balance with ${actorName} has changed.`;
    case 'FEED_REACTION': return `${actorName} reacted to your post.`;
    case 'FEED_COMMENT': return `${actorName} commented on your post.`;
    case 'SETTLEMENT_REMINDER': return `${actorName} sent you a settlement reminder.`;
    case 'TRANSACTION_APPROVAL_REQUEST': return `${actorName} asked you to approve a transaction of ₱${parsedData?.amount || ''}.`;
    case 'TRANSACTION_APPROVED': return `${actorName} approved your transaction of ₱${parsedData?.amount || ''}.`;
    default: return `${actorName} triggered a notification.`;
  }
};

const getNotificationUrl = (notification: AppNotification) => {
  switch (notification.type) {
    case 'FRIEND_REQUEST_RECEIVED': return '/friends?tab=requests';
    case 'FRIEND_REQUEST_ACCEPTED': return notification.actor?.username ? `/profile/${notification.actor.username}` : '/friends';
    case 'ADDED_TO_SPLIT':
    case 'BALANCE_CHANGED':
    case 'SETTLEMENT_REMINDER':
    case 'TRANSACTION_APPROVED': return '/transactions';
    case 'TRANSACTION_APPROVAL_REQUEST': return '/';
    case 'FEED_REACTION':
    case 'FEED_COMMENT': return '/feed';
    default: return null;
  }
};

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onAction }) => {
  const navigate = useNavigate();
  const markAsRead = useNotificationStore((state) => state.markAsRead);

  const handleClick = async () => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    
    if (onAction) onAction();

    const url = getNotificationUrl(notification);
    if (url) navigate(url);
  };

  const actorName = notification.actor?.displayName || notification.actor?.username || 'U';

  return (
    <div
      onClick={handleClick}
      className={`flex gap-3 p-4 hover:bg-surface-hover transition-colors cursor-pointer border-b border-border-subtle last:border-0 ${
        !notification.read ? 'bg-primary/5' : ''
      }`}
    >
      <div className="relative flex-shrink-0">
        <Avatar
          src={notification.actor?.avatarUrl || undefined}
          name={actorName}
          size="sm"
        />
        <div className="absolute -bottom-1 -right-1 p-1 bg-background rounded-full shadow-sm border border-border-subtle">
          {getIcon(notification.type)}
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${!notification.read ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
          {getNotificationText(notification)}
        </p>
        <p className="text-xs text-muted mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </p>
      </div>

      {!notification.read && (
        <div className="flex-shrink-0 flex items-center">
          <div className="w-2 h-2 bg-primary rounded-full" />
        </div>
      )}
    </div>
  );
};

export default NotificationItem;
