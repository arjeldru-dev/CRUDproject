import { create } from 'zustand';
import api from '../lib/api';

export interface NotificationData {
  postId?: string;
  commentId?: string;
  amount?: number;
  badgeName?: string;
  badgeSlug?: string;
  streakDays?: number;
  challengeName?: string;
  challengeId?: string;
  message?: string;
  payerName?: string;
  emoji?: string;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  actorId: string | null;
  actor: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  type: string;
  data: NotificationData | null;
  read: boolean;
  createdAt: string;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  nextCursor: string | null;
  pollingInterval: number | null;

  fetchNotifications: (cursor?: string) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  subscribeToPush: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
  nextCursor: null,
  pollingInterval: null,

  fetchNotifications: async (cursor) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/notifications', {
        params: { cursor, limit: 20 },
      });
      const { notifications, nextCursor } = response.data;

      set((state) => ({
        notifications: cursor ? [...state.notifications, ...notifications] : notifications,
        nextCursor,
        loading: false,
      }));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      set({ error: error.response?.data?.error || 'Failed to fetch notifications', loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const response = await api.get('/notifications/unread-count');
      set({ unreadCount: response.data.count });
    } catch (err) {
      console.error('Failed to fetch unread count', err);
    }
  },

  markAsRead: async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (err) {
      console.error('Failed to mark notification as read', err);
    }
  },

  markAllAsRead: async () => {
    try {
      await api.put('/notifications/read-all');
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch (err) {
      console.error('Failed to mark all notifications as read', err);
    }
  },

  subscribeToPush: async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications are not supported by this browser');
      return;
    }

    try {
      // 1. Get public VAPID key from backend
      const response = await api.get('/notifications/vapid-key');
      const publicVapidKey = response.data.publicKey;

      if (!publicVapidKey) {
        console.warn('VAPID public key is not configured on the backend. Skipping push subscription.');
        return;
      }

      // 2. Register Service Worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      
      // 3. Wait for it to be ready
      await navigator.serviceWorker.ready;

      // 4. Subscribe user
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
      });

      // 5. Send subscription to backend
      await api.post('/notifications/push-subscribe', { subscription });
    } catch (err: unknown) {
      console.error('Failed to subscribe to push notifications', err);
    }
  },

  startPolling: () => {
    const { pollingInterval, fetchUnreadCount } = get();
    if (pollingInterval) return;

    fetchUnreadCount();
    const interval = window.setInterval(fetchUnreadCount, 30000);
    set({ pollingInterval: interval });
  },

  stopPolling: () => {
    const { pollingInterval } = get();
    if (pollingInterval) {
      window.clearInterval(pollingInterval);
      set({ pollingInterval: null });
    }
  },
}));

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
