import React, { useEffect } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useNotificationStore } from '../store/notificationStore';
import NotificationItem from '../components/social/NotificationItem';

const Notifications: React.FC = () => {
  const {
    notifications,
    loading,
    fetchNotifications,
    markAllAsRead,
    unreadCount,
    nextCursor
  } = useNotificationStore();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleLoadMore = () => {
    if (nextCursor) {
      fetchNotifications(nextCursor);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-slideUpIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Notifications</h1>
          <p className="text-muted mt-1">Stay updated with your financial social activity</p>
        </div>
        
        {unreadCount > 0 && (
          <button
            onClick={() => markAllAsRead()}
            className="flex items-center gap-2 px-4 py-2 bg-surface border border-border-subtle rounded-xl text-sm font-semibold text-foreground hover:bg-surface-hover transition-all cursor-pointer shadow-sm"
          >
            <CheckCheck className="w-4 h-4 text-primary" />
            Mark all as read
          </button>
        )}
      </div>

      <div className="bg-surface border border-border-subtle rounded-2xl shadow-xl overflow-hidden">
        {notifications.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-24 px-8 text-center text-muted">
            <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 opacity-20" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No notifications yet</h3>
            <p className="max-w-xs mx-auto text-sm">
              When friends interact with you or your expenses, you'll see them here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
              />
            ))}
            
            {nextCursor && (
              <div className="p-4 border-t border-border-subtle bg-surface/50">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="w-full py-3 text-sm font-semibold text-primary hover:bg-primary/5 rounded-xl transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Load more'
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      
      {loading && notifications.length === 0 && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}
    </div>
  );
};

export default Notifications;
