import { Request, Response } from 'express';
import { prisma } from '../config/db';

/**
 * POST /api/friends
 * Creates a new friend/ghost profile for the authenticated user.
 */
export const createFriend = async (req: Request, res: Response) => {
  try {
    const { name, isGhost } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const friend = await prisma.friendProfile.create({
      data: {
        name,
        isGhost: isGhost === true, // Default to false if not provided
        mainUserId: req.user.id,
      },
    });

    return res.status(201).json({ friend });
  } catch (error) {
    console.error('Create friend error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/friends
 * Retrieves all friend profiles belonging to the authenticated user.
 */
export const getFriends = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    const friends = await prisma.friendProfile.findMany({
      where: { mainUserId: userId },
      orderBy: { name: 'asc' },
    });

    // Self-healing: Ensure all Friendships have a FriendProfile
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: true,
        userB: true,
      }
    });

    const existingProfileFriendIds = new Set(friends.filter(f => f.friendUserId).map(f => f.friendUserId));
    const missingProfileFriendships = friendships.filter(f => {
      const friendId = f.userAId === userId ? f.userBId : f.userAId;
      return !existingProfileFriendIds.has(friendId);
    });

    if (missingProfileFriendships.length > 0) {
      const newProfilesData = missingProfileFriendships.map(f => {
        const friendUser = f.userAId === userId ? f.userB : f.userA;
        return {
          mainUserId: userId,
          friendUserId: friendUser.id,
          name: friendUser.displayName || friendUser.username || 'Friend',
          isGhost: false,
        };
      });

      await prisma.friendProfile.createMany({
        data: newProfilesData
      });

      // Refetch after creating
      const updatedFriends = await prisma.friendProfile.findMany({
        where: { mainUserId: userId },
        orderBy: { name: 'asc' },
      });

      const mappedFriends = updatedFriends.map(f => ({
        ...f,
        isGhost: f.isGhost || f.friendUserId === null
      }));

      return res.status(200).json({ friends: mappedFriends });
    }

    const mappedFriends = friends.map(f => ({
      ...f,
      isGhost: f.isGhost || f.friendUserId === null
    }));

    return res.status(200).json({ friends: mappedFriends });
  } catch (error) {
    console.error('Get friends error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteGhostProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const profile = await prisma.friendProfile.findUnique({
      where: { id }
    });

    if (!profile) {
      return res.status(404).json({ error: 'Ghost profile not found' });
    }

    if (profile.mainUserId !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this ghost profile' });
    }

    // Only allow deleting ghost profiles (unlinked or flagged as ghost)
    if (!profile.isGhost && profile.friendUserId !== null) {
      return res.status(400).json({ error: 'Cannot delete linked real friends using this endpoint' });
    }

    await prisma.friendProfile.delete({
      where: { id }
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete ghost profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const blockUser = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { userId: blockedUserId } = req.params;

    if (userId === blockedUserId) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: blockedUserId },
      select: { id: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    await prisma.$transaction([
      prisma.blockedUser.upsert({
        where: {
          blockerId_blockedId: { blockerId: userId, blockedId: blockedUserId },
        },
        update: {},
        create: { blockerId: userId, blockedId: blockedUserId },
      }),
      prisma.friendship.deleteMany({
        where: {
          OR: [
            { userAId: userId, userBId: blockedUserId },
            { userAId: blockedUserId, userBId: userId },
          ],
        },
      }),
      prisma.friendRequest.deleteMany({
        where: {
          OR: [
            { senderId: userId, receiverId: blockedUserId },
            { senderId: blockedUserId, receiverId: userId },
          ],
        },
      }),
    ]);

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'USER_BLOCKED',
        targetId: blockedUserId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const reportUser = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { userId: reportedUserId } = req.params;
    const { reason, details } = req.body;

    const targetUser = await prisma.user.findUnique({
      where: { id: reportedUserId },
      select: { id: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'USER_REPORTED',
        targetId: reportedUserId,
        metadata: JSON.stringify({ reason, details }),
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Report user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
