import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { createNotification } from '../services/notificationService';

export const getFeed = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;
    const cursor = req.query.cursor as string | undefined;
    let limit = parseInt(req.query.limit as string) || 20;
    if (limit < 1) limit = 20;
    if (limit > 50) limit = 50;

    // 1. Get list of accepted friend IDs
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: { userAId: true, userBId: true },
    });

    const friendIds = friendships.map(f => f.userAId === userId ? f.userBId : f.userAId);

    // 2. Get list of blocked user IDs to exclude
    const blockedRecords = await prisma.blockedUser.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
    });

    const blockedIds = blockedRecords.map(b => b.blockerId === userId ? b.blockedId : b.blockerId);
    const validFriendIds = friendIds.filter(id => !blockedIds.includes(id));

    const feedUserIds = [...validFriendIds, userId];

    // 3. Query feed posts in batches to implement application-level filtering with correct cursor pagination
    const collectedPosts: any[] = [];
    let nextCursor: string | null = null;
    let currentCursor = cursor;
    let hasMore = true;
    const batchSize = Math.max(limit * 2, 50);

    while (collectedPosts.length < limit && hasMore) {
      const batch = await prisma.feedPost.findMany({
        where: {
          userId: { in: feedUserIds },
        },
        take: batchSize + 1,
        cursor: currentCursor ? { id: currentCursor } : undefined,
        skip: currentCursor ? 1 : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          reactions: true,
          _count: {
            select: { comments: true },
          },
        },
      });

      if (batch.length === 0) {
        break;
      }

      const batchHasMore = batch.length > batchSize;
      const itemsToProcess = batchHasMore ? batch.slice(0, batchSize) : batch;

      for (const post of itemsToProcess) {
        let content: any;
        try {
          content = JSON.parse(post.content);
        } catch (e) {
          console.error(`Malformed content in feed post ${post.id}`, e);
          continue; // Skip malformed posts
        }

        // Filter out private posts if it's not the user's own post AND it's not the friend involved
        const isAuthor = post.userId === userId;
        const isFriendInvolved = content.friendUserId === userId || 
          (Array.isArray(content.involvedFriendUserIds) && content.involvedFriendUserIds.includes(userId));

        if (content.isPrivate && !isAuthor && !isFriendInvolved) {
          continue;
        }

        // Group and count reactions
        const reactionCounts: Record<string, { count: number, userReacted: boolean }> = {};
        post.reactions.forEach(r => {
          if (!reactionCounts[r.emoji]) {
            reactionCounts[r.emoji] = { count: 0, userReacted: false };
          }
          reactionCounts[r.emoji].count++;
          if (r.userId === userId) {
            reactionCounts[r.emoji].userReacted = true;
          }
        });

        const formattedReactions = Object.entries(reactionCounts).map(([emoji, data]) => ({
          emoji,
          count: data.count,
          userReacted: data.userReacted,
        }));

        const formattedPost = {
          id: post.id,
          userId: post.userId,
          user: post.user,
          type: post.type,
          content,
          isPublic: post.isPublic,
          createdAt: post.createdAt,
          reactions: formattedReactions,
          commentCount: post._count.comments,
        };

        if (collectedPosts.length < limit) {
          collectedPosts.push(formattedPost);
        } else {
          // This post represents the start of the next page
          nextCursor = post.id;
          hasMore = false;
          break;
        }
      }

      if (hasMore) {
        if (batchHasMore) {
          currentCursor = batch[batchSize - 1].id;
        } else {
          hasMore = false;
        }
      }
    }

    // 4. Apply privacy filtering (e.g. hide amounts if debtVisibility is PRIVATE)
    const userAndFriendPrivacy = await prisma.privacySettings.findMany({
      where: { userId: { in: feedUserIds } },
    });
    
    const privacyMap = new Map(userAndFriendPrivacy.map(p => [p.userId, p]));

    const privacyFilteredPosts = collectedPosts.map(post => {
      // Don't filter out amounts if it's the user's own post
      if (post.userId === userId) {
        return post;
      }

      const privacy = privacyMap.get(post.userId);
      const newPost = { ...post };

      if (privacy?.debtVisibility === 'PRIVATE') {
        if (newPost.type === 'EXPENSE_ADDED' || newPost.type === 'SETTLEMENT_COMPLETED') {
          // Remove amount from content
          const { amount, ...restContent } = newPost.content;
          newPost.content = { ...restContent, amount: undefined };
        }
      }

      return newPost;
    });

    return res.status(200).json({ posts: privacyFilteredPosts, nextCursor });
  } catch (error) {
    console.error('Get feed error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getComments = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    const cursor = req.query.cursor as string | undefined;
    let limit = parseInt(req.query.limit as string) || 20;
    if (limit < 1) limit = 20;
    if (limit > 50) limit = 50;

    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      select: { userId: true },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Blocked check: if the caller blocks the post author or vice versa
    const isBlocked = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: post.userId },
          { blockerId: post.userId, blockedId: userId },
        ],
      },
    });

    if (isBlocked) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const comments = await prisma.comment.findMany({
      where: { postId },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : undefined,
      orderBy: { createdAt: 'asc' }, // Older comments first
      include: {
        user: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    let nextCursor: string | null = null;
    if (comments.length > limit) {
      const nextItem = comments.pop();
      nextCursor = nextItem?.id || null;
    }

    const formattedComments = comments.map(comment => ({
      ...comment,
      isOwn: comment.userId === userId,
    }));

    return res.status(200).json({ comments: formattedComments, nextCursor });
  } catch (error) {
    console.error('Get comments error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const reactToPost = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { emoji } = req.body;
    const userId: string = req.user.id;

    if (!['👍', '❤️', '😮'].includes(emoji)) {
      return res.status(400).json({ error: 'Invalid emoji reaction' });
    }

    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      select: { userId: true },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Blocked check: if the caller blocks the post author or vice versa
    const isBlocked = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: post.userId },
          { blockerId: post.userId, blockedId: userId },
        ],
      },
    });

    if (isBlocked) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (post.userId !== userId) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userAId: userId, userBId: post.userId },
            { userAId: post.userId, userBId: userId },
          ],
        },
      });

      if (!friendship) {
        return res.status(403).json({ error: 'Forbidden: You are not friends with the post author' });
      }
    }

    const existingReaction = await prisma.reaction.findUnique({
      where: {
        postId_userId_emoji: {
          postId,
          userId,
          emoji,
        },
      },
    });

    if (existingReaction) {
      // Toggle off
      await prisma.reaction.delete({
        where: { id: existingReaction.id },
      });
      return res.status(200).json({ success: true, action: 'removed' });
    } else {
      // Toggle on
      const reaction = await prisma.reaction.create({
        data: {
          postId,
          userId,
          emoji,
        },
      });

      // Notify post author
      if (post.userId !== userId) {
        await createNotification({
          recipientId: post.userId,
          actorId: userId,
          type: 'FEED_REACTION',
          data: { postId, emoji },
        });
      }

      return res.status(200).json({ success: true, action: 'added', reaction });
    }
  } catch (error) {
    console.error('React to post error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const addComment = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const userId: string = req.user.id;

    if (!text || text.trim() === '') {
      return res.status(400).json({ error: 'Comment text cannot be empty' });
    }

    if (text.length > 500) {
      return res.status(400).json({ error: 'Comment text exceeds 500 characters' });
    }

    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      select: { userId: true },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Blocked check: if the caller blocks the post author or vice versa
    const isBlocked = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: post.userId },
          { blockerId: post.userId, blockedId: userId },
        ],
      },
    });

    if (isBlocked) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (post.userId !== userId) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userAId: userId, userBId: post.userId },
            { userAId: post.userId, userBId: userId },
          ],
        },
      });

      if (!friendship) {
        return res.status(403).json({ error: 'Forbidden: You are not friends with the post author' });
      }
    }

    const comment = await prisma.comment.create({
      data: {
        postId,
        userId,
        text: text.trim(),
      },
      include: {
        user: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Notify post author
    if (post.userId !== userId) {
      await createNotification({
        recipientId: post.userId,
        actorId: userId,
        type: 'FEED_COMMENT',
        data: { postId, commentId: comment.id },
      });
    }

    return res.status(201).json({ comment: { ...comment, isOwn: true } });
  } catch (error) {
    console.error('Add comment error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteComment = async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const userId: string = req.user.id;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comment.userId !== userId) {
      return res.status(403).json({ error: 'Cannot delete someone else\'s comment' });
    }

    await prisma.comment.delete({
      where: { id: commentId },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete comment error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deletePost = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const userId: string = req.user.id;

    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ error: 'Cannot delete someone else\'s post' });
    }

    await prisma.feedPost.delete({
      where: { id: postId },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete post error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const togglePostPrivacy = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const userId: string = req.user.id;

    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    let content: any;
    try {
      content = JSON.parse(post.content);
    } catch (e) {
      return res.status(500).json({ error: 'Malformed post content' });
    }

    const isAuthor = post.userId === userId;
    const isAllowedFriend = (content.friendUserId === userId || 
      (Array.isArray(content.involvedFriendUserIds) && content.involvedFriendUserIds.includes(userId))) && 
      content.allowFriendToPrivate;

    if (!isAuthor && !isAllowedFriend) {
      return res.status(403).json({ error: 'Cannot modify someone else\'s post' });
    }

    content.isPrivate = !content.isPrivate;

    const updatedPost = await prisma.feedPost.update({
      where: { id: postId },
      data: { content: JSON.stringify(content) },
    });

    return res.status(200).json({ success: true, isPrivate: content.isPrivate });
  } catch (error) {
    console.error('Toggle post privacy error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePost = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { message } = req.body;
    const userId: string = req.user.id;

    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ error: 'Cannot modify someone else\'s post' });
    }

    let content: any;
    try {
      content = JSON.parse(post.content);
    } catch (e) {
      return res.status(500).json({ error: 'Malformed post content' });
    }
    
    content.message = message?.trim() || undefined;

    const updatedPost = await prisma.feedPost.update({
      where: { id: postId },
      data: { content: JSON.stringify(content) },
    });

    return res.status(200).json({ success: true, message: content.message });
  } catch (error) {
    console.error('Update post error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
