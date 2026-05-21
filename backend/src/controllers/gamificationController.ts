import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { Prisma } from '@prisma/client';
import { gamificationService } from '../services/gamificationService';
import { createNotification } from '../services/notificationService';

// ══════════════════════════════════════════════════════════════════════
// GET /api/gamification/profile
// Returns the authenticated user's gamification data.
// ══════════════════════════════════════════════════════════════════════
export const getGamificationProfile = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;
    const profileData = await gamificationService.getGamificationProfile(userId);
    return res.status(200).json(profileData);
  } catch (error) {
    console.error('Get gamification profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// PUT /api/gamification/frame
// Sets the user's active avatar frame.
// Body: { frameId: string }
// ══════════════════════════════════════════════════════════════════════
export const setActiveFrame = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;
    const { frameId } = req.body;

    if (!frameId || typeof frameId !== 'string') {
      return res.status(400).json({ error: 'frameId is required' });
    }

    // Find the frame
    const frame = await prisma.avatarFrame.findUnique({
      where: { id: frameId },
    });

    if (!frame) {
      return res.status(404).json({ error: 'Frame not found' });
    }

    // Ensure gamification profile exists and check points
    const gamification = await gamificationService.ensureGamificationProfile(userId);

    if (gamification.totalPoints < frame.pointsRequired) {
      return res.status(400).json({ error: 'Not enough points to unlock this frame' });
    }

    // Set the active frame
    await prisma.userGamification.update({
      where: { userId },
      data: { activeFrameId: frameId },
    });

    return res.status(200).json({
      activeFrame: {
        id: frame.id,
        slug: frame.slug,
        name: frame.name,
        cssClass: frame.cssClass,
      },
    });
  } catch (error) {
    console.error('Set active frame error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// GET /api/gamification/leaderboard
// Returns a ranked list of the user's friends sorted by totalPoints desc,
// then longestStreak desc.
// ══════════════════════════════════════════════════════════════════════
export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;
    const leaderboard = await gamificationService.getLeaderboard(userId);

    // Find the current user's rank
    const currentUserEntry = leaderboard.find((e: any) => e.isCurrentUser);
    const currentUserRank = currentUserEntry?.rank || 0;

    return res.status(200).json({
      leaderboard,
      currentUserRank,
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// GET /api/gamification/challenges
// List user's challenges (active + recent completed).
// Query params: ?status=ACTIVE|COMPLETED|ALL (default: ALL)
// ══════════════════════════════════════════════════════════════════════
export const getChallenges = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;
    const statusFilter = (req.query.status as string || 'ALL').toUpperCase();

    // Trigger lazy evaluation of expired challenges
    await gamificationService.evaluateChallenges(userId);

    // Build status filter for Prisma
    const statusCondition: Prisma.ChallengeWhereInput = {};
    if (statusFilter === 'ACTIVE') {
      statusCondition.status = 'ACTIVE';
    } else if (statusFilter === 'COMPLETED') {
      statusCondition.status = { in: ['COMPLETED', 'CANCELLED'] };
    }
    // ALL = no filter

    // Get challenges where user is a participant
    const participations = await prisma.challengeParticipant.findMany({
      where: {
        userId,
        challenge: statusCondition,
      },
      include: {
        challenge: {
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        challenge: {
          endDate: 'desc',
        },
      },
    });

    const now = new Date();

    const challenges = participations.map((p) => {
      const c = p.challenge;
      const startDate = new Date(c.startDate);
      const endDate = new Date(c.endDate);
      const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const daysElapsed = Math.max(0, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

      // Determine user's own status in the challenge
      let myStatus: 'pending' | 'active' | 'failed' | 'completed' = 'pending';
      if (p.completedAt) {
        myStatus = 'completed';
      } else if (p.failedAt) {
        myStatus = 'failed';
      } else if (p.accepted) {
        myStatus = 'active';
      }

      return {
        id: c.id,
        type: c.type,
        name: c.name,
        description: c.description,
        startDate: c.startDate,
        endDate: c.endDate,
        status: c.status,
        participantCount: c.participants.length,
        participants: c.participants.map((cp) => ({
          userId: cp.user.id,
          username: cp.user.username,
          displayName: cp.user.displayName,
          avatarUrl: cp.user.avatarUrl,
          accepted: cp.accepted,
          failedAt: cp.failedAt,
          completedAt: cp.completedAt,
        })),
        isCreator: c.creatorId === userId,
        myStatus,
        daysRemaining,
      };
    });

    return res.status(200).json({ challenges });
  } catch (error) {
    console.error('Get challenges error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// POST /api/gamification/challenges
// Creates a new group challenge and invites friends.
// ══════════════════════════════════════════════════════════════════════
export const createChallenge = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;
    const { type, name, description, categoryId, startDate, endDate, invitedUserIds } = req.body;

    // ── Validation ────────────────────────────────────────────────
    if (!type) {
      return res.status(400).json({ error: 'Challenge type is required' });
    }

    const validTypes = ['NO_OVERSPEND_WEEK', 'NO_OVERSPEND_MONTH', 'COFFEE_FREE_WEEK', 'TRANSPORT_SAVER', 'CUSTOM'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid challenge type' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // startDate must be today or future
    const startDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    if (startDay < today) {
      return res.status(400).json({ error: 'Start date must be today or in the future' });
    }

    // endDate must be after startDate
    if (end <= start) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    // endDate - startDate must be ≤ 31 days
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 31) {
      return res.status(400).json({ error: 'Challenge duration cannot exceed 31 days' });
    }

    if (!invitedUserIds || !Array.isArray(invitedUserIds) || invitedUserIds.length === 0) {
      return res.status(400).json({ error: 'At least 1 friend must be invited' });
    }

    if (invitedUserIds.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 invitees per challenge' });
    }

    // Check active challenge limit (max 5)
    const activeCount = await prisma.challengeParticipant.count({
      where: {
        userId,
        accepted: true,
        challenge: { status: 'ACTIVE' },
      },
    });

    if (activeCount >= 5) {
      return res.status(400).json({ error: 'You cannot have more than 5 active challenges simultaneously' });
    }

    // Validate all invited users are friends
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userAId: userId, userBId: { in: invitedUserIds } },
          { userAId: { in: invitedUserIds }, userBId: userId },
        ],
      },
    });

    const friendIds = new Set(
      friendships.map((f) => (f.userAId === userId ? f.userBId : f.userAId))
    );

    const nonFriends = invitedUserIds.filter((id: string) => !friendIds.has(id));
    if (nonFriends.length > 0) {
      return res.status(400).json({ error: 'All invited users must be your friends' });
    }

    // Validate categoryId if provided
    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, userId },
      });
      if (!category) {
        return res.status(400).json({ error: 'Invalid category' });
      }
    }

    // ── Default names based on type ───────────────────────────────
    const defaultNames: Record<string, { name: string; description: string }> = {
      NO_OVERSPEND_WEEK: { name: 'No Overspend Week', description: 'Stay under budget for the entire week!' },
      NO_OVERSPEND_MONTH: { name: 'No Overspend Month', description: 'Stay under budget for the entire month!' },
      COFFEE_FREE_WEEK: { name: 'Coffee-Free Week', description: 'Skip the café and save for a week!' },
      TRANSPORT_SAVER: { name: 'Transport Saver', description: 'Keep transport spending to a minimum!' },
      CUSTOM: { name: 'Custom Challenge', description: 'A custom challenge between friends.' },
    };

    const challengeName = name || defaultNames[type]?.name || 'Challenge';
    const challengeDescription = description || defaultNames[type]?.description || '';

    // ── Create challenge + participants ────────────────────────────
    const challenge = await prisma.challenge.create({
      data: {
        creatorId: userId,
        type,
        name: challengeName,
        description: challengeDescription,
        categoryId: categoryId || null,
        startDate: start,
        endDate: end,
        status: 'ACTIVE',
        participants: {
          create: [
            // Creator auto-joins with accepted: true
            {
              userId,
              accepted: true,
              joinedAt: new Date(),
            },
            // Invited friends with accepted: false
            ...invitedUserIds.map((invitedId: string) => ({
              userId: invitedId,
              accepted: false,
              joinedAt: new Date(),
            })),
          ],
        },
      },
      include: {
        participants: {
          select: {
            userId: true,
            accepted: true,
            joinedAt: true,
          },
        },
      },
    });

    // Send CHALLENGE_INVITE notifications to all invitees
    for (const invitedId of invitedUserIds) {
      await createNotification({
        recipientId: invitedId,
        actorId: userId,
        type: 'CHALLENGE_INVITE',
        data: { challengeName, challengeId: challenge.id },
      });
    }

    return res.status(201).json({
      challenge: {
        id: challenge.id,
        type: challenge.type,
        name: challenge.name,
        description: challenge.description,
        startDate: challenge.startDate,
        endDate: challenge.endDate,
        status: challenge.status,
      },
      participants: challenge.participants,
    });
  } catch (error) {
    console.error('Create challenge error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// POST /api/gamification/challenges/:id/join
// Accept a challenge invitation.
// ══════════════════════════════════════════════════════════════════════
export const joinChallenge = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;
    const { id } = req.params;

    // Find the challenge
    const challenge = await prisma.challenge.findUnique({
      where: { id },
    });

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    if (challenge.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Challenge is no longer active' });
    }

    // Grace period: startDate must not have passed by more than 1 day
    const now = new Date();
    const gracePeriod = new Date(challenge.startDate);
    gracePeriod.setDate(gracePeriod.getDate() + 1);
    if (now > gracePeriod) {
      return res.status(400).json({ error: 'The join window for this challenge has passed' });
    }

    // User must be in ChallengeParticipant with accepted: false
    const participant = await prisma.challengeParticipant.findFirst({
      where: {
        challengeId: id,
        userId,
        accepted: false,
      },
    });

    if (!participant) {
      return res.status(400).json({ error: 'You do not have a pending invitation for this challenge' });
    }

    // Accept the invitation
    const updated = await prisma.challengeParticipant.update({
      where: { id: participant.id },
      data: {
        accepted: true,
        joinedAt: new Date(),
      },
    });

    return res.status(200).json({
      participant: {
        userId: updated.userId,
        accepted: updated.accepted,
        joinedAt: updated.joinedAt,
      },
    });
  } catch (error) {
    console.error('Join challenge error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// DELETE /api/gamification/challenges/:id
// Cancel a challenge (creator only, while ACTIVE).
// ══════════════════════════════════════════════════════════════════════
export const cancelChallenge = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;
    const { id } = req.params;

    const challenge = await prisma.challenge.findUnique({
      where: { id },
    });

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    if (challenge.creatorId !== userId) {
      return res.status(403).json({ error: 'Only the challenge creator can cancel it' });
    }

    if (challenge.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only active challenges can be cancelled' });
    }

    await prisma.challenge.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return res.status(200).json({ message: 'Challenge cancelled' });
  } catch (error) {
    console.error('Cancel challenge error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
