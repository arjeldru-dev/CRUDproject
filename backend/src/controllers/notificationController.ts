import { Request, Response } from 'express';
import { prisma } from '../config/db';

export const getNotifications = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { limit = 20, cursor } = req.query;

  try {
    const notifications = await prisma.notification.findMany({
      where: { recipientId: userId },
      take: Number(limit),
      ...(cursor ? { skip: 1, cursor: { id: cursor as string } } : {}),
      orderBy: { createdAt: 'desc' },
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

    const nextCursor = notifications.length === Number(limit) ? notifications[notifications.length - 1].id : null;

    res.json({
      notifications: notifications.map(n => ({
        ...n,
        data: n.data ? JSON.parse(n.data) : null,
      })),
      nextCursor,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

export const getUnreadCount = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  try {
    const count = await prisma.notification.count({
      where: {
        recipientId: userId,
        read: false,
      },
    });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    await prisma.notification.update({
      where: { id, recipientId: userId },
      data: { read: true },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

export const markAllAsRead = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  try {
    await prisma.notification.updateMany({
      where: { recipientId: userId, read: false },
      data: { read: true },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
};

export const subscribeToPush = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { subscription } = req.body;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  try {
    await prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: {
          userId,
          endpoint: subscription.endpoint,
        },
      },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
};

export const unsubscribeFromPush = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { endpoint } = req.body;

  try {
    await prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove push subscription' });
  }
};

export const getVapidPublicKey = async (req: Request, res: Response) => {
  try {
    return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  } catch (error) {
    console.error('Failed to get VAPID public key:', error);
    return res.status(500).json({ error: 'Failed to retrieve VAPID public key' });
  }
};

