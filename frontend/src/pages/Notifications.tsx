import React, { useEffect } from 'react';
import { Bell, CheckCheck, Loader2, AlertCircle } from 'lucide-react';
import { useNotificationStore } from '../store/notificationStore';
import NotificationItem from '../components/social/NotificationItem';
import { useInView } from 'react-intersection-observer';

const Notifications: React.FC = () => {
  const {
    notifications,
    loading,
    error,
    fetchNotifications,
    markAllAsRead,
    unreadCount,
    nextCursor
  } = useNotificationStore();

  const { ref, inView } = useInView({
    threshold: 0.1,
  });

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Trigger loading next page of notifications when the end of the list comes into view
  useEffect(() => {
    if (inView && nextCursor && !loading) {
      fetchNotifications(nextCursor);
    }
  }, [inView, nextCursor, loading, fetchNotifications]);

  return (
    <div className="w-full max-w-2xl mx-auto animate-fadeInUp">
      {/* Title & Actions Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
        <div>
          <h1 className="font-display text-fluid-h1 font-bold text-foreground tracking-tight">
            Notifications
          </h1>
          <p className="text-sm text-muted mt-1">
            Stay updated with your financial social activity
          </p>
        </div>
        
        {unreadCount > 0 && (
          <button
            onClick={() => markAllAsRead()}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-primary hover:bg-surface-hover text-sm font-semibold cursor-pointer btn-press"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      {/* Error State Banner */}
      {error && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center p-6 mb-6 bg-error/5 border border-error/20 rounded-xl text-center max-w-2xl mx-auto animate-fadeIn">
          <div className="w-10 h-10 bg-error/10 rounded-full flex items-center justify-center mb-3">
            <AlertCircle className="w-5 h-5 text-error" />
          </div>
          <h3 className="font-display text-sm font-bold text-foreground mb-1">Failed to load notifications</h3>
          <p className="text-xs text-muted mb-4 max-w-xs">{error}</p>
          <button
            onClick={() => fetchNotifications()}
            className="px-4 py-2 bg-error text-white text-xs font-semibold rounded-lg hover:bg-error/95 transition-colors cursor-pointer active:scale-[0.97]"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Notifications List Container */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden transition-all duration-200">
        {notifications.length === 0 && !loading && !error ? (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center text-muted">
            <div className="w-12 h-12 bg-surface-hover rounded-full flex items-center justify-center mb-4">
              <Bell className="w-6 h-6 text-muted" />
            </div>
            <h3 className="font-display text-base font-bold text-foreground mb-1">No notifications yet</h3>
            <p className="max-w-xs mx-auto text-sm text-muted">
              When friends interact with you or your expenses, you'll see them here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {notifications.map((notification, index) => (
              <li key={notification.id} className="block">
                <NotificationItem
                  notification={notification}
                  index={index}
                />
              </li>
            ))}
            
            {nextCursor && (
              <li ref={ref} className="py-6 flex justify-center border-t border-border/60 bg-surface">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </li>
            )}
          </ul>
        )}
      </div>
      
      {loading && notifications.length === 0 && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}
    </div>
  );
};

export default Notifications;
