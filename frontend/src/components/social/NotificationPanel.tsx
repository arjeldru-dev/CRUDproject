import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useNotificationStore } from '../../store/notificationStore';
import NotificationItem from './NotificationItem';

interface NotificationPanelProps {
  onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const {
    notifications,
    loading,
    fetchNotifications,
    markAllAsRead,
    unreadCount
  } = useNotificationStore();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAllAsRead();
  };

  const handleViewAll = () => {
    onClose();
    navigate('/notifications');
  };

  return (
    <div className="flex flex-col h-full max-h-[500px] w-full bg-surface border border-border-subtle rounded-xl shadow-2xl overflow-hidden animate-scaleIn">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface/50 backdrop-blur-md">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          Notifications
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 bg-primary text-[10px] text-primary-foreground rounded-full">
              {unreadCount}
            </span>
          )}
        </h3>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1 cursor-pointer"
          >
            <CheckCheck className="w-3 h-3" />
            Mark all read
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide min-h-[200px]">
        {loading && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted">
            <Loader2 className="w-6 h-6 animate-spin mb-2 opacity-50" />
            <p className="text-xs font-medium">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-8 text-center text-muted">
            <div className="w-12 h-12 bg-surface-hover rounded-full flex items-center justify-center mb-3">
              <Bell className="w-6 h-6 opacity-20" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">All caught up! 🎉</p>
            <p className="text-xs">No new notifications at the moment.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {notifications.slice(0, 10).map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onAction={onClose}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-border-subtle bg-surface/50">
        <button
          onClick={handleViewAll}
          className="w-full py-2 text-xs font-semibold text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all cursor-pointer"
        >
          View all notifications
        </button>
      </div>
    </div>
  );
};

export default NotificationPanel;
