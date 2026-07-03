import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Loader2, AlertCircle } from 'lucide-react';
import { useNotificationStore } from '../../store/notificationStore';
import { useAuthStore } from '../../store/authStore';
import { hasUnseenUpdate, markUpdatesSeen } from '../../lib/updates';
import NotificationItem from './NotificationItem';
import UpdateNotificationItem from './UpdateNotificationItem';

interface NotificationPanelProps {
  onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const {
    notifications,
    loading,
    error,
    fetchNotifications,
    markAllAsRead,
    unreadCount
  } = useNotificationStore();
  const userId = useAuthStore((s) => s.user?.id);
  const [, forceRecheck] = useState(0);

  const updateUnseen = hasUnseenUpdate(userId);
  const combinedUnread = unreadCount + (updateUnseen ? 1 : 0);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAllAsRead();
    markUpdatesSeen(userId);
    forceRecheck((n) => n + 1);
  };

  const handleViewAll = () => {
    onClose();
    navigate('/notifications');
  };

  return (
    <div className="flex flex-col h-full max-h-[500px] w-full bg-surface text-foreground border border-border rounded-xl shadow-2xl overflow-hidden animate-scaleIn origin-top-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/50 backdrop-blur-md">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          Notifications
          {combinedUnread > 0 && (
            <span className="px-1.5 py-0.5 bg-primary text-[10px] text-primary-foreground rounded-full">
              {combinedUnread}
            </span>
          )}
        </h3>
        {combinedUnread > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1 cursor-pointer transition-transform duration-100 active:scale-95"
          >
            <CheckCheck className="w-3 h-3" />
            Mark all read
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar min-h-[200px]">
        {/* Persistent "What's New" entry, always shown at the top */}
        <ul className="flex flex-col">
          <li className="block">
            <UpdateNotificationItem onAction={onClose} alignCenter />
          </li>
          {notifications.slice(0, 10).map((notification, index) => (
            <li key={notification.id} className="block">
              <NotificationItem
                notification={notification}
                onAction={onClose}
                index={index}
                alignCenter={true}
              />
            </li>
          ))}
        </ul>

        {error && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-6 text-center text-error animate-fadeIn">
            <div className="w-9 h-9 bg-error/10 rounded-full flex items-center justify-center mb-2">
              <AlertCircle className="w-4 h-4 text-error" />
            </div>
            <p className="text-xs font-semibold text-foreground mb-1">Failed to load notifications</p>
            <p className="text-[10px] text-muted mb-3 max-w-xs">{error}</p>
            <button
              onClick={() => fetchNotifications()}
              className="px-3 py-1 bg-error text-white text-[10px] font-semibold rounded-md hover:bg-error/95 transition-colors cursor-pointer active:scale-95"
            >
              Retry
            </button>
          </div>
        )}
        {loading && notifications.length === 0 && !error && (
          <div className="flex items-center justify-center py-6 text-muted gap-2">
            <Loader2 className="w-4 h-4 animate-spin opacity-50" />
            <p className="text-xs font-medium">Loading notifications...</p>
          </div>
        )}
        {!loading && !error && notifications.length === 0 && (
          <p className="text-center text-[11px] text-muted py-4">No other notifications right now.</p>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-border bg-surface/50">
        <button
          onClick={handleViewAll}
          className="w-full py-2 text-xs font-semibold text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-all cursor-pointer btn-press"
        >
          View all notifications
        </button>
      </div>
    </div>
  );
};

export default NotificationPanel;
