import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { createNotification } from '../services/notificationService';

/** Standard reaction emoji set shared by posts and comments. */
const REACTION_EMOJIS = ['👍', '❤️', '🔥', '😮', '🏆', '🙏'];

/** Upper bound on how many reactor rows a single reactions query returns. */
const REACTORS_QUERY_LIMIT = 200;

type PostAccess =
  | { ok: true; postAuthorId: string }
  | { ok: false; status: number; error: string };

/**
 * Centralized access control for a feed post. A caller may interact with a post
 * (read reactions, react, comment) only when:
 *   - the post exists,
 *   - neither party has blocked the other, and
 *   - the caller is the author or an accepted friend of the author.
 *
 * Extracting this keeps the reaction/comment endpoints consistent so none of
 * them can accidentally skip a check.
 */
export const checkPostAccess = async (userId: string, postId: string): Promise<PostAccess> => {
  const post = await prisma.feedPost.findUnique({
    where: { id: postId },
    select: { userId: true },
  });

  if (!post) {
    return { ok: false, status: 404, error: 'Post not found' };
  }

  // Blocked check: if the caller blocks the post author or vice versa.
  const isBlocked = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: post.userId },
        { blockerId: post.userId, blockedId: userId },
      ],
    },
  });

  if (isBlocked) {
    return { ok: false, status: 403, error: 'Forbidden' };
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
      return { ok: false, status: 403, error: 'Forbidden: You are not friends with the post author' };
    }
  }

  return { ok: true, postAuthorId: post.userId };
};

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
              gamification: {
                select: {
                  activeFrame: {
                    select: {
                      cssClass: true,
                    },
                  },
                },
              },
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
          user: {
            username: post.user.username,
            displayName: post.user.displayName,
            avatarUrl: post.user.avatarUrl,
            activeFrame: post.user.gamification?.activeFrame ?? null,
          },
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

    const access = await checkPostAccess(userId, postId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
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
            gamification: {
              select: {
                activeFrame: {
                  select: {
                    cssClass: true,
                  },
                },
              },
            },
          },
        },
        likes: {
          select: {
            userId: true,
            emoji: true,
          },
        },
      },
    });

    let nextCursor: string | null = null;
    if (comments.length > limit) {
      const nextItem = comments.pop();
      nextCursor = nextItem?.id || null;
    }

    const formattedComments = comments.map(comment => {
      const counts: Record<string, number> = {};
      let userReaction: string | null = null;
      for (const like of comment.likes) {
        counts[like.emoji] = (counts[like.emoji] || 0) + 1;
        if (like.userId === userId) userReaction = like.emoji;
      }
      const reactions = Object.entries(counts).map(([emoji, count]) => ({ emoji, count }));

      return {
        id: comment.id,
        postId: comment.postId,
        userId: comment.userId,
        parentId: comment.parentId,
        text: comment.text,
        createdAt: comment.createdAt,
        isOwn: comment.userId === userId,
        reactions,
        userReaction,
        reactionCount: comment.likes.length,
        user: {
          username: comment.user.username,
          displayName: comment.user.displayName,
          avatarUrl: comment.user.avatarUrl,
          activeFrame: comment.user.gamification?.activeFrame ?? null,
        },
      };
    });

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

    if (!REACTION_EMOJIS.includes(emoji)) {
      return res.status(400).json({ error: 'Invalid emoji reaction' });
    }

    const access = await checkPostAccess(userId, postId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }
    const postAuthorId = access.postAuthorId;

    // One reaction per user: find this user's existing reaction on the post,
    // whatever emoji it is.
    const existing = await prisma.reaction.findFirst({ where: { postId, userId } });

    if (existing) {
      if (existing.emoji === emoji) {
        // Same emoji tapped again → remove it.
        await prisma.reaction.delete({ where: { id: existing.id } });
        return res.status(200).json({ success: true, action: 'removed', emoji: null });
      }
      // Different emoji → switch the reaction.
      const updated = await prisma.reaction.update({
        where: { id: existing.id },
        data: { emoji },
      });
      return res.status(200).json({ success: true, action: 'switched', emoji: updated.emoji });
    }

    const reaction = await prisma.reaction.create({
      data: { postId, userId, emoji },
    });

    // Notify post author
    if (postAuthorId !== userId) {
      await createNotification({
        recipientId: postAuthorId,
        actorId: userId,
        type: 'FEED_REACTION',
        data: { postId, emoji },
      });
    }

    return res.status(200).json({ success: true, action: 'added', emoji: reaction.emoji });
  } catch (error) {
    console.error('React to post error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/** Shape used when returning a reactor's public profile. */
const reactorUserSelect = {
  username: true,
  displayName: true,
  avatarUrl: true,
  gamification: { select: { activeFrame: { select: { cssClass: true } } } },
} as const;

type ReactorUserRow = {
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  gamification: { activeFrame: { cssClass: string } | null } | null;
};

const formatReactorUser = (user: ReactorUserRow) => ({
  username: user.username,
  displayName: user.displayName,
  avatarUrl: user.avatarUrl,
  activeFrame: user.gamification?.activeFrame ?? null,
});

/**
 * GET /api/feed/:postId/reactions
 * Returns the list of users who reacted to a post, with the emoji they used.
 */
export const getPostReactors = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const userId: string = req.user.id;

    const access = await checkPostAccess(userId, postId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const reactions = await prisma.reaction.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      take: REACTORS_QUERY_LIMIT,
      include: { user: { select: reactorUserSelect } },
    });

    const reactors = reactions.map((r) => ({ emoji: r.emoji, user: formatReactorUser(r.user) }));
    return res.status(200).json({ reactors });
  } catch (error) {
    console.error('Get post reactors error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/feed/comment/:commentId/react
 * Adds / switches / removes the user's single emoji reaction on a comment.
 */
export const reactToComment = async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const { emoji } = req.body;
    const userId: string = req.user.id;

    if (!REACTION_EMOJIS.includes(emoji)) {
      return res.status(400).json({ error: 'Invalid emoji reaction' });
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { userId: true, postId: true },
    });
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Same access rules as the parent post (blocked / friendship checks).
    const access = await checkPostAccess(userId, comment.postId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const existing = await prisma.commentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });

    if (existing) {
      if (existing.emoji === emoji) {
        await prisma.commentLike.delete({ where: { id: existing.id } });
      } else {
        await prisma.commentLike.update({ where: { id: existing.id }, data: { emoji } });
      }
    } else {
      await prisma.commentLike.create({ data: { commentId, userId, emoji } });
      if (comment.userId !== userId) {
        await createNotification({
          recipientId: comment.userId,
          actorId: userId,
          type: 'FEED_REACTION',
          data: { postId: comment.postId, commentId, emoji },
        });
      }
    }

    const all = await prisma.commentLike.findMany({ where: { commentId }, select: { emoji: true, userId: true } });
    const counts: Record<string, number> = {};
    let userReaction: string | null = null;
    for (const like of all) {
      counts[like.emoji] = (counts[like.emoji] || 0) + 1;
      if (like.userId === userId) userReaction = like.emoji;
    }
    const reactions = Object.entries(counts).map(([e, count]) => ({ emoji: e, count }));

    return res.status(200).json({ userReaction, reactions, reactionCount: all.length });
  } catch (error) {
    console.error('React to comment error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/feed/comment/:commentId/reactions
 * Returns the list of users who reacted to a comment, with the emoji they used.
 */
export const getCommentReactors = async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const userId: string = req.user.id;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { postId: true },
    });
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Same access rules as the parent post (blocked / friendship checks).
    const access = await checkPostAccess(userId, comment.postId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const reactions = await prisma.commentLike.findMany({
      where: { commentId },
      orderBy: { createdAt: 'asc' },
      take: REACTORS_QUERY_LIMIT,
      include: { user: { select: reactorUserSelect } },
    });

    const reactors = reactions.map((r) => ({ emoji: r.emoji, user: formatReactorUser(r.user) }));
    return res.status(200).json({ reactors });
  } catch (error) {
    console.error('Get comment reactors error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const addComment = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { text, parentId } = req.body;
    const userId: string = req.user.id;

    if (!text || text.trim() === '') {
      return res.status(400).json({ error: 'Comment text cannot be empty' });
    }

    if (text.length > 500) {
      return res.status(400).json({ error: 'Comment text exceeds 500 characters' });
    }

    const access = await checkPostAccess(userId, postId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }
    const postAuthorId = access.postAuthorId;

    // Validate parentComment if parentId is provided
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { postId: true },
      });
      if (!parentComment) {
        return res.status(404).json({ error: 'Parent comment not found' });
      }
      if (parentComment.postId !== postId) {
        return res.status(400).json({ error: 'Parent comment belongs to a different post' });
      }
    }

    const comment = await prisma.comment.create({
      data: {
        postId,
        userId,
        parentId: parentId || null,
        text: text.trim(),
      },
      include: {
        user: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
            gamification: {
              select: {
                activeFrame: {
                  select: {
                    cssClass: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Notify post author
    if (postAuthorId !== userId) {
      await createNotification({
        recipientId: postAuthorId,
        actorId: userId,
        type: 'FEED_COMMENT',
        data: { postId, commentId: comment.id },
      });
    }

    // Also notify parent comment author if it's a reply and not their own
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { userId: true },
      });
      if (parentComment && parentComment.userId !== userId) {
        await createNotification({
          recipientId: parentComment.userId,
          actorId: userId,
          type: 'FEED_COMMENT',
          data: { postId, commentId: comment.id, parentCommentId: parentId },
        });
      }
    }

    return res.status(201).json({
      comment: {
        id: comment.id,
        postId: comment.postId,
        userId: comment.userId,
        parentId: comment.parentId,
        text: comment.text,
        createdAt: comment.createdAt,
        isOwn: true,
        reactions: [],
        userReaction: null,
        reactionCount: 0,
        user: {
          username: comment.user.username,
          displayName: comment.user.displayName,
          avatarUrl: comment.user.avatarUrl,
          activeFrame: comment.user.gamification?.activeFrame ?? null,
        },
      },
    });
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


