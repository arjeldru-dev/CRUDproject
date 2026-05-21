import { Request, Response } from 'express';
import { prisma } from '../config/db';
import multer from 'multer';
import sharp from 'sharp';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';

// ── Avatar Upload Config ──────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads/avatars');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const avatarUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  },
});

// ── Validation Helpers ────────────────────────────────────────────────
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

function validateUsername(username: string): string | null {
  if (!USERNAME_REGEX.test(username)) {
    return 'Username must be 3–30 characters, alphanumeric and underscores only.';
  }
  return null;
}

function validateProfileFields(body: {
  displayName?: string;
  bio?: string;
  location?: string;
}): string | null {
  if (body.displayName && body.displayName.length > 50) {
    return 'Display name must be 50 characters or fewer.';
  }
  if (body.bio && body.bio.length > 160) {
    return 'Bio must be 160 characters or fewer.';
  }
  if (body.location && body.location.length > 100) {
    return 'Location must be 100 characters or fewer.';
  }
  return null;
}

// ── GET /api/profile/me ───────────────────────────────────────────────
export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        location: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({ profile: user });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ── PUT /api/profile/me ───────────────────────────────────────────────
export const updateMyProfile = async (req: Request, res: Response) => {
  try {
    const { displayName, username, bio, location } = req.body;

    // Validate fields
    const fieldError = validateProfileFields({ displayName, bio, location });
    if (fieldError) {
      return res.status(400).json({ error: fieldError });
    }

    // Validate and check username uniqueness if provided
    if (username !== undefined) {
      const usernameError = validateUsername(username);
      if (usernameError) {
        return res.status(400).json({ error: usernameError });
      }

      // Case-insensitive uniqueness check
      const existing = await prisma.user.findFirst({
        where: {
          username: { equals: username, mode: 'insensitive' },
          NOT: { id: req.user.id },
        },
      });

      if (existing) {
        return res.status(409).json({ error: 'Username is already taken.' });
      }
    }

    // Build update data — only include fields that were actually sent
    const updateData: Record<string, string | null> = {};
    if (displayName !== undefined) updateData.displayName = displayName || null;
    if (username !== undefined) updateData.username = username;
    if (bio !== undefined) updateData.bio = bio || null;
    if (location !== undefined) updateData.location = location || null;

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        location: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    return res.status(200).json({ profile: updated });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ── POST /api/profile/avatar ──────────────────────────────────────────
export const uploadAvatar = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    // Determine extension from mimetype
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = extMap[req.file.mimetype] || 'jpg';
    const filename = `${req.user.id}.${ext}`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    // Resize to 256x256 using sharp
    await sharp(req.file.buffer)
      .resize(256, 256, { fit: 'cover', position: 'center' })
      .toFile(outputPath);

    // Build public URL with cache-busting param
    const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    const avatarUrl = `${baseUrl}/uploads/avatars/${filename}?t=${Date.now()}`;

    // Update user record
    await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl },
    });

    return res.status(200).json({ avatarUrl });
  } catch (error) {
    console.error('Avatar upload error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ── GET /api/profile/:username ────────────────────────────────────────
export const getPublicProfile = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const user = await prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        location: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Determine friendship status with the requesting user
    let friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'friends' | 'self' = 'none';

    if (user.id === req.user.id) {
      friendshipStatus = 'self';
    } else {
      // Check if they are friends
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userAId: req.user.id, userBId: user.id },
            { userAId: user.id, userBId: req.user.id },
          ],
        },
      });

      if (friendship) {
        friendshipStatus = 'friends';
      } else {
        // Check for pending requests
        const sentRequest = await prisma.friendRequest.findFirst({
          where: { senderId: req.user.id, receiverId: user.id, status: 'PENDING' },
        });

        if (sentRequest) {
          friendshipStatus = 'pending_sent';
        } else {
          const receivedRequest = await prisma.friendRequest.findFirst({
            where: { senderId: user.id, receiverId: req.user.id, status: 'PENDING' },
          });

          if (receivedRequest) {
            friendshipStatus = 'pending_received';
          }
        }
      }
    }

    // Count shared splits if friends
    let sharedSplitCount: number | undefined;
    let mutualFriendCount: number | undefined;

    if (friendshipStatus === 'friends') {
      // Count transactions where both users have ledger entries
      const sharedTransactions = await prisma.transaction.count({
        where: {
          ledgerEntries: {
            some: { userId: req.user.id },
          },
          AND: {
            ledgerEntries: {
              some: { userId: user.id },
            },
          },
        },
      });
      sharedSplitCount = sharedTransactions;

      // Count mutual friends
      const myFriendships = await prisma.friendship.findMany({
        where: { OR: [{ userAId: req.user.id }, { userBId: req.user.id }] },
        select: { userAId: true, userBId: true },
      });
      const myFriendIds = new Set(
        myFriendships.map((f) => (f.userAId === req.user.id ? f.userBId : f.userAId)),
      );

      const theirFriendships = await prisma.friendship.findMany({
        where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
        select: { userAId: true, userBId: true },
      });
      const theirFriendIds = new Set(
        theirFriendships.map((f) => (f.userAId === user.id ? f.userBId : f.userAId)),
      );

      let mutual = 0;
      for (const fid of myFriendIds) {
        if (theirFriendIds.has(fid)) mutual++;
      }
      mutualFriendCount = mutual;
    }

    let gamificationData = null;
    if (friendshipStatus === 'friends' || friendshipStatus === 'self') {
      const gamification = await prisma.userGamification.findUnique({
        where: { userId: user.id },
        include: {
          activeFrame: {
            select: {
              cssClass: true,
            },
          },
        },
      });

      const badgeCount = await prisma.userBadge.count({
        where: { userId: user.id },
      });

      const recentBadges = await prisma.userBadge.findMany({
        where: { userId: user.id },
        orderBy: { unlockedAt: 'desc' },
        take: 3,
        include: {
          badge: {
            select: {
              id: true,
              slug: true,
              name: true,
              iconUrl: true,
            },
          },
        },
      });

      gamificationData = {
        currentStreak: gamification?.currentStreak ?? 0,
        totalPoints: gamification?.totalPoints ?? 0,
        badgeCount,
        recentBadges: recentBadges.map((ub) => ub.badge),
        activeFrame: gamification?.activeFrame ?? null,
      };
    }

    return res.status(200).json({
      profile: {
        ...user,
        friendshipStatus,
        ...(sharedSplitCount !== undefined && { sharedSplitCount }),
        ...(mutualFriendCount !== undefined && { mutualFriendCount }),
        ...(gamificationData && { gamification: gamificationData }),
      },
    });
  } catch (error) {
    console.error('Get public profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ── GET /api/profile/:userId/qr ───────────────────────────────────────
export const getProfileQR = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    if (!user || !user.username) {
      return res.status(404).json({ error: 'User not found or username not set' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const profileUrl = `${frontendUrl}/profile/${user.username}?action=add-friend`;

    const qrDataUrl = await QRCode.toDataURL(profileUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#1C1917',
        light: '#FAF9F7',
      },
    });

    return res.status(200).json({ qrDataUrl });
  } catch (error) {
    console.error('QR generation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
