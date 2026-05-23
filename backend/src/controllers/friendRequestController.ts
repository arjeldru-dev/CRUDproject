import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { Prisma } from '@prisma/client';
import { createNotification } from '../services/notificationService';
import { gamificationService } from '../services/gamificationService';

// ══════════════════════════════════════════════════════════════════════
// GET /api/friends/search?q=
// Search users by username or email. Min 2 chars. Max 20 results.
// Excludes the searching user and blocked users.
// ══════════════════════════════════════════════════════════════════════
export const searchUsers = async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string || '').trim();

    if (query.length < 2) {
      return res.status(200).json({ results: [] });
    }

    const blockedRecords = await prisma.blockedUser.findMany({
      where: {
        OR: [{ blockerId: req.user.id }, { blockedId: req.user.id }],
      },
    });
    const blockedIds = blockedRecords.map((b) => (b.blockerId === req.user.id ? b.blockedId : b.blockerId));

    const excludedIds = [req.user.id, ...blockedIds];

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { notIn: excludedIds } },
          {
            OR: [
              { username: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
              { displayName: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        email: true,
      },
      take: 20,
    });

    if (users.length === 0) {
      return res.status(200).json({ results: [] });
    }

    const userIds = users.map((u) => u.id);

    const [friendships, requests] = await Promise.all([
      prisma.friendship.findMany({
        where: {
          OR: [
            { userAId: req.user.id, userBId: { in: userIds } },
            { userAId: { in: userIds }, userBId: req.user.id },
          ],
        },
      }),
      prisma.friendRequest.findMany({
        where: {
          OR: [
            { senderId: req.user.id, receiverId: { in: userIds }, status: 'PENDING' },
            { senderId: { in: userIds }, receiverId: req.user.id, status: 'PENDING' },
          ],
        },
      }),
    ]);

    const getRelStatus = (targetId: string) => {
      if (friendships.some((f) => f.userAId === targetId || f.userBId === targetId)) {
        return 'friends';
      }
      if (requests.some((r) => r.senderId === req.user.id && r.receiverId === targetId)) {
        return 'pending_sent';
      }
      if (requests.some((r) => r.senderId === targetId && r.receiverId === req.user.id)) {
        return 'pending_received';
      }
      return 'none';
    };

    const results = users.map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      relationshipStatus: getRelStatus(user.id),
    }));

    return res.status(200).json({ results });
  } catch (error) {
    console.error('Search users error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// POST /api/friends/request
// Send a friend request. Auto-accepts if mutual intent exists.
// Body: { targetUserId: string }
// ══════════════════════════════════════════════════════════════════════
export const sendFriendRequest = async (req: Request, res: Response) => {
  try {
    const { targetUserId } = req.body;
    const senderId = req.user.id;

    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId is required' });
    }

    // Rule: Cannot send request to self
    if (targetUserId === senderId) {
      return res.status(400).json({ error: 'Cannot send a friend request to yourself' });
    }

    // Check for block
    const blockExists = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: senderId },
        ],
      },
    });
    if (blockExists) {
      return res.status(403).json({ error: 'Forbidden: You cannot interact with this user' });
    }

    // Check target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already friends
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userAId: senderId, userBId: targetUserId },
          { userAId: targetUserId, userBId: senderId },
        ],
      },
    });
    if (existingFriendship) {
      return res.status(400).json({ error: 'Already friends with this user' });
    }

    // Check if there's already a pending request FROM sender TO target
    const existingSent = await prisma.friendRequest.findFirst({
      where: { senderId, receiverId: targetUserId, status: 'PENDING' },
    });
    if (existingSent) {
      return res.status(400).json({ error: 'Friend request already pending' });
    }

    // Rule: Mutual intent auto-accept — if target already sent a PENDING request to sender
    const existingReceived = await prisma.friendRequest.findFirst({
      where: { senderId: targetUserId, receiverId: senderId, status: 'PENDING' },
    });

    if (existingReceived) {
      // Auto-accept: update the existing request and create friendship
      // We also need to create FriendProfiles for both so they appear in transaction forms
      const senderUser = await prisma.user.findUnique({ where: { id: senderId } });
      const targetUserObj = await prisma.user.findUnique({ where: { id: targetUserId } });

      const existingSenderProfile = await prisma.friendProfile.findFirst({
        where: { mainUserId: senderId, friendUserId: targetUserId }
      });
      const existingTargetProfile = await prisma.friendProfile.findFirst({
        where: { mainUserId: targetUserId, friendUserId: senderId }
      });

      const txOperations: any[] = [
        prisma.friendRequest.update({
          where: { id: existingReceived.id },
          data: { status: 'ACCEPTED' },
        }),
        prisma.friendship.create({
          data: {
            userAId: senderId < targetUserId ? senderId : targetUserId,
            userBId: senderId < targetUserId ? targetUserId : senderId,
          },
        }),
      ];

      if (!existingSenderProfile) {
        txOperations.push(prisma.friendProfile.create({
          data: {
            mainUserId: senderId,
            friendUserId: targetUserId,
            name: targetUserObj?.displayName || targetUserObj?.username || 'Friend',
            isGhost: false,
          }
        }));
      }
      if (!existingTargetProfile) {
        txOperations.push(prisma.friendProfile.create({
          data: {
            mainUserId: targetUserId,
            friendUserId: senderId,
            name: senderUser?.displayName || senderUser?.username || 'Friend',
            isGhost: false,
          }
        }));
      }

      const [updatedRequest, friendship] = await prisma.$transaction(txOperations);

      // Evaluate badges for both users
      gamificationService.evaluateAndAwardBadges(senderId).catch(console.error);
      gamificationService.evaluateAndAwardBadges(targetUserId).catch(console.error);

      // Notify requester that they are now friends
      await createNotification({
        recipientId: targetUserId,
        actorId: senderId,
        type: 'FRIEND_REQUEST_ACCEPTED',
      });

      return res.status(200).json({
        request: updatedRequest,
        friendship: { id: friendship.id, createdAt: friendship.createdAt },
        autoAccepted: true,
      });
    }

    // Create a new pending request
    const request = await prisma.friendRequest.create({
      data: { senderId, receiverId: targetUserId },
      include: {
        sender: {
          select: { username: true, displayName: true, avatarUrl: true },
        },
        receiver: {
          select: { username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    // Notify receiver about the new request
    await createNotification({
      recipientId: targetUserId,
      actorId: senderId,
      type: 'FRIEND_REQUEST_RECEIVED',
    });

    return res.status(201).json({
      request: {
        id: request.id,
        senderId: request.senderId,
        receiverId: request.receiverId,
        senderProfile: request.sender,
        receiverProfile: request.receiver,
        status: request.status,
        createdAt: request.createdAt,
      },
    });
  } catch (error) {
    // Handle unique constraint violation (duplicate request)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(400).json({ error: 'Friend request already exists between these users' });
    }
    console.error('Send friend request error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// GET /api/friends/requests/received
// List pending incoming requests for the current user.
// ══════════════════════════════════════════════════════════════════════
export const getReceivedRequests = async (req: Request, res: Response) => {
  try {
    const requests = await prisma.friendRequest.findMany({
      where: { receiverId: req.user.id, status: 'PENDING' },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = requests.map((r) => ({
      id: r.id,
      senderId: r.senderId,
      receiverId: r.receiverId,
      senderProfile: {
        username: r.sender.username,
        displayName: r.sender.displayName,
        avatarUrl: r.sender.avatarUrl,
      },
      status: r.status,
      createdAt: r.createdAt,
    }));

    return res.status(200).json({ requests: formatted });
  } catch (error) {
    console.error('Get received requests error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// GET /api/friends/requests/sent
// List pending outgoing requests for the current user.
// ══════════════════════════════════════════════════════════════════════
export const getSentRequests = async (req: Request, res: Response) => {
  try {
    const requests = await prisma.friendRequest.findMany({
      where: { senderId: req.user.id, status: 'PENDING' },
      include: {
        receiver: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = requests.map((r) => ({
      id: r.id,
      senderId: r.senderId,
      receiverId: r.receiverId,
      receiverProfile: {
        username: r.receiver.username,
        displayName: r.receiver.displayName,
        avatarUrl: r.receiver.avatarUrl,
      },
      status: r.status,
      createdAt: r.createdAt,
    }));

    return res.status(200).json({ requests: formatted });
  } catch (error) {
    console.error('Get sent requests error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// POST /api/friends/request/:id/accept
// Accept an incoming friend request. Creates a Friendship row.
// ══════════════════════════════════════════════════════════════════════
export const acceptRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const request = await prisma.friendRequest.findUnique({ where: { id } });

    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    // Only the receiver can accept
    if (request.receiverId !== req.user.id) {
      return res.status(403).json({ error: 'Only the recipient can accept this request' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }

    const senderUser = await prisma.user.findUnique({ where: { id: request.senderId } });
    const targetUserObj = await prisma.user.findUnique({ where: { id: request.receiverId } });

    const existingSenderProfile = await prisma.friendProfile.findFirst({
      where: { mainUserId: request.senderId, friendUserId: request.receiverId }
    });
    const existingTargetProfile = await prisma.friendProfile.findFirst({
      where: { mainUserId: request.receiverId, friendUserId: request.senderId }
    });

    const txOperations: any[] = [
      prisma.friendRequest.update({
        where: { id },
        data: { status: 'ACCEPTED' },
      }),
      prisma.friendship.create({
        data: {
          userAId: request.senderId < request.receiverId ? request.senderId : request.receiverId,
          userBId: request.senderId < request.receiverId ? request.receiverId : request.senderId,
        },
      }),
    ];

    if (!existingSenderProfile) {
      txOperations.push(prisma.friendProfile.create({
        data: {
          mainUserId: request.senderId,
          friendUserId: request.receiverId,
          name: targetUserObj?.displayName || targetUserObj?.username || 'Friend',
          isGhost: false,
        }
      }));
    }
    if (!existingTargetProfile) {
      txOperations.push(prisma.friendProfile.create({
        data: {
          mainUserId: request.receiverId,
          friendUserId: request.senderId,
          name: senderUser?.displayName || senderUser?.username || 'Friend',
          isGhost: false,
        }
      }));
    }

    // Accept + create friendship and profiles in a transaction
    const [updatedRequest, friendship] = await prisma.$transaction(txOperations);

    // Evaluate badges for both users
    gamificationService.evaluateAndAwardBadges(request.senderId).catch(console.error);
    gamificationService.evaluateAndAwardBadges(request.receiverId).catch(console.error);

    // Notify the requester that their request was accepted
    await createNotification({
      recipientId: request.senderId,
      actorId: req.user.id,
      type: 'FRIEND_REQUEST_ACCEPTED',
    });

    return res.status(200).json({
      friendship: { id: friendship.id, createdAt: friendship.createdAt },
    });
  } catch (error) {
    console.error('Accept request error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// POST /api/friends/request/:id/decline
// Decline an incoming friend request.
// ══════════════════════════════════════════════════════════════════════
export const declineRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const request = await prisma.friendRequest.findUnique({ where: { id } });

    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (request.receiverId !== req.user.id) {
      return res.status(403).json({ error: 'Only the recipient can decline this request' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }

    await prisma.friendRequest.update({
      where: { id },
      data: { status: 'DECLINED' },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Decline request error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// DELETE /api/friends/request/:id/cancel
// Cancel a sent friend request (only the sender can cancel).
// ══════════════════════════════════════════════════════════════════════
export const cancelRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const request = await prisma.friendRequest.findUnique({ where: { id } });

    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (request.senderId !== req.user.id) {
      return res.status(403).json({ error: 'Only the sender can cancel this request' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }

    await prisma.friendRequest.delete({ where: { id } });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Cancel request error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// GET /api/friends/list
// Get all accepted friends with net balance.
// ══════════════════════════════════════════════════════════════════════
export const getFriendsList = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    // Get all friendships where the user is involved
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        userB: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const friendIds = friendships.map(f => f.userAId === userId ? f.userB.id : f.userA.id);

    // Find all friend profiles associated with these friends
    const friendProfiles = await prisma.friendProfile.findMany({
      where: {
        OR: [
          { mainUserId: userId, friendUserId: { in: friendIds } },
          { mainUserId: { in: friendIds }, friendUserId: userId }
        ]
      },
      select: { id: true, friendUserId: true, mainUserId: true }
    });

    // Map friendProfileId -> friendUserId
    const profileToFriendId = new Map<string, string>();
    for (const p of friendProfiles) {
      const fId = p.mainUserId === userId ? p.friendUserId : p.mainUserId;
      if (fId) profileToFriendId.set(p.id, fId);
    }

    const friendProfileIds = Array.from(profileToFriendId.keys());

    // Fetch ledger entries for all friends using groupBy
    const receivables = await prisma.ledgerEntry.groupBy({
      by: ['friendProfileId'],
      where: {
        userId,
        type: 'RECEIVABLE',
        friendProfileId: { in: friendProfileIds },
      },
      _sum: { amountChange: true },
    });

    const payables = await prisma.ledgerEntry.groupBy({
      by: ['friendProfileId'],
      where: {
        userId,
        type: 'PAYABLE',
        friendProfileId: { in: friendProfileIds },
      },
      _sum: { amountChange: true },
    });

    // Group net balances by friendUserId
    const netBalanceMap = new Map<string, number>();

    for (const r of receivables) {
      if (r.friendProfileId && r._sum.amountChange) {
        const fId = profileToFriendId.get(r.friendProfileId);
        if (fId) {
          const current = netBalanceMap.get(fId) || 0;
          netBalanceMap.set(fId, current + Number(r._sum.amountChange));
        }
      }
    }

    for (const p of payables) {
      if (p.friendProfileId && p._sum.amountChange) {
        const fId = profileToFriendId.get(p.friendProfileId);
        if (fId) {
          const current = netBalanceMap.get(fId) || 0;
          netBalanceMap.set(fId, current - Number(p._sum.amountChange));
        }
      }
    }

    // Build friend list with net balance
    const friends = friendships.map((f) => {
      const friend = f.userAId === userId ? f.userB : f.userA;
      const netBalance = netBalanceMap.get(friend.id) || 0;

      return {
        friendshipId: f.id,
        friendId: friend.id,
        username: friend.username,
        displayName: friend.displayName,
        avatarUrl: friend.avatarUrl,
        netBalance: Math.round(netBalance * 100) / 100,
        createdAt: f.createdAt,
      };
    });

    return res.status(200).json({ friends });
  } catch (error) {
    console.error('Get friends list error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// DELETE /api/friends/:friendshipId
// Remove a friendship. Both sides lose visibility.
// ══════════════════════════════════════════════════════════════════════
export const removeFriend = async (req: Request, res: Response) => {
  try {
    const { friendshipId } = req.params;

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    // Only participants can remove
    if (friendship.userAId !== req.user.id && friendship.userBId !== req.user.id) {
      return res.status(403).json({ error: 'You are not part of this friendship' });
    }

    await prisma.friendship.delete({ where: { id: friendshipId } });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Remove friend error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// POST /api/friends/ghost/:id/claim
// Link a ghost profile to a real user and create a friendship.
// Body: { realUserId: string }
// ══════════════════════════════════════════════════════════════════════
export const claimGhostProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { realUserId } = req.body;

    if (!realUserId) {
      return res.status(400).json({ error: 'realUserId is required' });
    }

    // Find the ghost profile
    const ghostProfile = await prisma.friendProfile.findUnique({
      where: { id },
    });

    if (!ghostProfile) {
      return res.status(404).json({ error: 'Ghost profile not found' });
    }

    // Only the owner of the ghost profile can claim it
    if (ghostProfile.mainUserId !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this ghost profile' });
    }

    if (!ghostProfile.isGhost) {
      return res.status(400).json({ error: 'This profile is not a ghost profile' });
    }

    // Check the real user exists
    const realUser = await prisma.user.findUnique({
      where: { id: realUserId },
      select: { id: true },
    });

    if (!realUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Cannot claim yourself
    if (realUserId === req.user.id) {
      return res.status(400).json({ error: 'Cannot link a ghost profile to yourself' });
    }

    const existingTargetProfile = await prisma.friendProfile.findFirst({
      where: { mainUserId: realUserId, friendUserId: req.user.id }
    });

    const txOperations: any[] = [
      // Update the ghost profile to link to real user
      prisma.friendProfile.update({
        where: { id },
        data: {
          friendUserId: realUserId,
          isGhost: false,
        },
      }),
      // Create friendship (if not already friends)
      prisma.friendship.upsert({
        where: {
          userAId_userBId: {
            userAId: req.user.id < realUserId ? req.user.id : realUserId,
            userBId: req.user.id < realUserId ? realUserId : req.user.id,
          },
        },
        create: {
          userAId: req.user.id < realUserId ? req.user.id : realUserId,
          userBId: req.user.id < realUserId ? realUserId : req.user.id,
        },
        update: {}, // No-op if already exists
      }),
    ];

    if (!existingTargetProfile) {
      const claimerUser = await prisma.user.findUnique({ where: { id: req.user.id } });
      txOperations.push(prisma.friendProfile.create({
        data: {
          mainUserId: realUserId,
          friendUserId: req.user.id,
          name: claimerUser?.displayName || claimerUser?.username || 'Friend',
          isGhost: false,
        }
      }));
    }

    // Link ghost profile and create friendship in a transaction
    await prisma.$transaction(txOperations);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Claim ghost profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// POST /api/friends/invite
// Log an email invitation (console for V1).
// Body: { email: string }
// ══════════════════════════════════════════════════════════════════════
export const inviteByEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    // Check if user already exists with this email
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists. Search for them instead.' });
    }

    // Log invitation (V1 — no real email sent)
    console.log(`📧 Email invitation from user ${req.user.id} to ${email}`);

    return res.status(200).json({ invited: true });
  } catch (error) {
    console.error('Invite by email error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
