import { Request, Response } from 'express';
import { prisma } from '../config/db';

export const getPrivacySettings = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    let settings = await prisma.privacySettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await prisma.privacySettings.create({
        data: { userId },
      });
    }

    res.json({ settings });
  } catch (error) {
    console.error('Error fetching privacy settings:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};

export const updatePrivacySettings = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { profileVisibility, debtVisibility, budgetVisibility } = req.body;

    const settings = await prisma.privacySettings.upsert({
      where: { userId },
      update: {
        ...(profileVisibility && { profileVisibility }),
        ...(debtVisibility && { debtVisibility }),
        ...(budgetVisibility && { budgetVisibility }),
      },
      create: {
        userId,
        ...(profileVisibility && { profileVisibility }),
        ...(debtVisibility && { debtVisibility }),
        ...(budgetVisibility && { budgetVisibility }),
      },
    });

    res.json({ settings });
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};

export const getBlockedUsers = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    const blocked = await prisma.blockedUser.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedBlocked = blocked.map((b) => ({
      id: b.id,
      blockedUserId: b.blocked.id,
      username: b.blocked.username || '',
      displayName: b.blocked.displayName,
      avatarUrl: b.blocked.avatarUrl,
      blockedAt: b.createdAt,
    }));

    res.json({ blocked: formattedBlocked });
  } catch (error) {
    console.error('Error fetching blocked users:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};

export const unblockUser = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const blockedUserId = req.params.userId;

    const blockRecord = await prisma.blockedUser.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: userId,
          blockedId: blockedUserId,
        },
      },
    });

    if (!blockRecord) {
      return res.status(404).json({ error: { message: 'Block record not found' } });
    }

    await prisma.blockedUser.delete({
      where: { id: blockRecord.id },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'USER_UNBLOCKED',
        targetId: blockedUserId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error unblocking user:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
