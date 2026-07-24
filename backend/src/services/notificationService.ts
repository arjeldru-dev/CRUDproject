import webpush from 'web-push';
import { prisma } from '../config/db';
import { NotificationType } from '@prisma/client';
import { resolveFriendlyCopy, isEnhancedType, type Placeholder } from './notificationCopyService';

// Configure VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export const createNotification = async (params: {
  recipientId: string;
  actorId?: string;
  type: NotificationType;
  data?: Record<string, any>;
}) => {
  const { recipientId, actorId, type, data } = params;

  // 1. Don't notify the user about their own actions
  if (actorId === recipientId) return;

  // 2. Check if recipient has blocked the actor or vice-versa
  if (actorId) {
    const isBlocked = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: recipientId, blockedId: actorId },
          { blockerId: actorId, blockedId: recipientId },
        ],
      },
    });
    if (isBlocked) return;
  }

  // 3. Create the in-app notification
  const notification = await prisma.notification.create({
    data: {
      recipientId,
      actorId: actorId || null,
      type,
      data: data ? JSON.stringify(data) : null,
    },
    include: {
      actor: {
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  // 4. Prune old notifications (keep newest 200)
  const count = await prisma.notification.count({ where: { recipientId } });
  if (count > 200) {
    const oldestToKeep = await prisma.notification.findMany({
      where: { recipientId },
      orderBy: { createdAt: 'desc' },
      skip: 199,
      take: 1,
    });
    if (oldestToKeep.length > 0) {
      await prisma.notification.deleteMany({
        where: {
          recipientId,
          createdAt: { lt: oldestToKeep[0].createdAt },
        },
      });
    }
  }

  // 5. Send Push Notification
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: recipientId },
  });

  if (subscriptions.length > 0) {
    const pushActorName = notification.actor?.displayName || notification.actor?.username || 'Someone';
    const payload = JSON.stringify({
      title: notification.actor?.displayName || notification.actor?.username || 'BudgetBarkada',
      // Prefer friendlier templated copy (deterministic by notification id so the
      // push body matches the in-app displayText); fall back to the flat switch.
      // Never awaits the LLM — a missing pool simply falls back for this one.
      body:
        getFriendlyNotificationText(type, notification.id, pushActorName, data) ||
        getNotificationText(type, pushActorName, data),
      icon: notification.actor?.avatarUrl || '/icon-192x192.png',
      data: {
        url: getNotificationUrl(type, data),
        notificationId: notification.id,
      },
    });

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
      } catch (error: any) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          // Subscription expired or invalid, remove it
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        } else {
          console.error('Error sending push notification:', error);
        }
      }
    }
  }

  return notification;
};

// Helper to generate notification text
function getNotificationText(type: NotificationType, actorName: string, data?: any): string {
  switch (type) {
    case 'FRIEND_REQUEST_RECEIVED':
      return `${actorName} sent you a friend request.`;
    case 'FRIEND_REQUEST_ACCEPTED':
      return `${actorName} accepted your friend request.`;
    case 'ADDED_TO_SPLIT':
      return `${actorName} added you to a new expense split.`;
    case 'BALANCE_CHANGED':
      return `Your balance with ${actorName} has changed.`;
    case 'FEED_REACTION':
      return `${actorName} reacted to your post.`;
    case 'FEED_COMMENT':
      return `${actorName} commented on your post.`;
    case 'SETTLEMENT_REMINDER':
      return `${actorName} sent you a settlement reminder.`;
    case 'CHALLENGE_INVITE':
      return `${actorName} invited you to a challenge: ${data?.challengeName}`;
    case 'BADGE_UNLOCKED':
      return `You earned the ${data?.badgeName} badge! 🏅`;
    case 'STREAK_MILESTONE':
      return `You're on a ${data?.streakDays}-day streak! 🔥`;
    case 'CHALLENGE_COMPLETED':
      return `You completed the ${data?.challengeName} challenge! 🏆`;
    case 'TRANSACTION_APPROVAL_REQUEST':
      return `${actorName} asked you to approve a transaction of ₱${data?.amount}.`;
    case 'TRANSACTION_APPROVED':
      return `${actorName} approved your transaction of ₱${data?.amount}.`;
    case 'TRANSACTION_REJECTED':
      return `${actorName} rejected your transaction of ₱${data?.amount}.`;
    default:
      return `${actorName} triggered a notification.`;
  }
}

/**
 * Map a notification's actor + data onto the placeholder values the friendly
 * copy templates fill. Only these neutral, already-present fields are used;
 * nothing new is sent to the LLM (templates are generated from the type alone).
 */
function buildCopyVars(actorName: string, data?: any): Partial<Record<Placeholder, string>> {
  // Note: no `amount` — no enhanced (allow-listed) type permits an {amount}
  // placeholder (money/approval types keep their literal copy), so supplying it
  // would be dead weight that any template using it is discarded for anyway.
  return {
    actor: actorName,
    challengeName: data?.challengeName != null ? String(data.challengeName) : undefined,
    badgeName: data?.badgeName != null ? String(data.badgeName) : undefined,
    streakDays: data?.streakDays != null ? String(data.streakDays) : undefined,
  };
}

/**
 * Friendly, templated notification text for enhanced types, or `null` to use the
 * flat `getNotificationText` fallback. Deterministic by `seed` (the notification
 * id) so the push body and the in-app `displayText` always resolve to the same
 * variant. Synchronous and PII-safe; never awaits the LLM.
 *
 * Exported so `notificationController.getNotifications` can attach the identical
 * `displayText` to each enhanced notification in its response.
 */
export function getFriendlyNotificationText(
  type: NotificationType,
  seed: string,
  actorName: string,
  data?: any,
): string | null {
  if (!isEnhancedType(type)) return null;
  return resolveFriendlyCopy(type, seed, buildCopyVars(actorName, data));
}

// Helper to generate notification deep link URL
function getNotificationUrl(type: NotificationType, data?: any): string {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  switch (type) {
    case 'FRIEND_REQUEST_RECEIVED':
      return `${baseUrl}/friends?tab=requests`;
    case 'FRIEND_REQUEST_ACCEPTED':
      return `${baseUrl}/friends`;
    case 'ADDED_TO_SPLIT':
    case 'BALANCE_CHANGED':
    case 'SETTLEMENT_REMINDER':
    case 'TRANSACTION_APPROVED':
    case 'TRANSACTION_REJECTED':
      return `${baseUrl}/transactions`;
    case 'TRANSACTION_APPROVAL_REQUEST':
      return `${baseUrl}/dashboard`;
    case 'FEED_REACTION':
    case 'FEED_COMMENT':
      return `${baseUrl}/feed`;
    case 'CHALLENGE_INVITE':
    case 'CHALLENGE_COMPLETED':
      return `${baseUrl}/challenges`;
    case 'BADGE_UNLOCKED':
    case 'STREAK_MILESTONE':
      return `${baseUrl}/challenges?tab=badges`;
    default:
      return `${baseUrl}/notifications`;
  }
}
