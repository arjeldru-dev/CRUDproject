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
    const friends = await prisma.friendProfile.findMany({
      where: { mainUserId: req.user.id },
      orderBy: { name: 'asc' },
    });

    return res.status(200).json({ friends });
  } catch (error) {
    console.error('Get friends error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
