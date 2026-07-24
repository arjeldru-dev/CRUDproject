import { prisma } from '../config/db';
import { Transaction, Category, User, FeedPostType, Prisma } from '@prisma/client';

/**
 * Pure helper for category renames. Given a stored `FeedPost.content` JSON
 * string, if it snapshots `oldName` as its `categoryName`, return an updated
 * content string with `newName` applied to both the `categoryName` field and any
 * occurrences inside the human-readable `description`. Returns `null` when the
 * post is unrelated to this category or the content can't be parsed, so the
 * caller can skip it. Kept pure (no DB) so it is trivially unit-testable.
 */
export function applyCategoryRenameToContent(
  content: string,
  oldName: string,
  newName: string,
): string | null {
  if (oldName === newName) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!parsed || parsed.categoryName !== oldName) return null;
  parsed.categoryName = newName;
  if (typeof parsed.description === 'string') {
    // Replace ONLY the category token inside the known generated templates
    // ("added a {name} split", "reached N% of their {name} budget") — see
    // generateExpensePost / generateBudgetMilestonePost. A blanket replace of
    // every `oldName` occurrence could corrupt a friend name or memo that
    // happens to contain the category name (e.g. category "Ben", friend
    // "Bennett"). If a template's wording ever changes, the description
    // gracefully keeps the old label (stale, never corrupted); the exact
    // `categoryName` field above is always corrected regardless.
    parsed.description = parsed.description
      .split(`a ${oldName} split`).join(`a ${newName} split`)
      .split(`their ${oldName} budget`).join(`their ${newName} budget`);
  }
  return JSON.stringify(parsed);
}

/**
 * FeedService handles the automatic generation of social feed posts
 * based on financial activity triggers.
 */
export const feedService = {
  /**
   * Propagates a category rename into the frozen name snapshots stored on the
   * user's existing feed posts (expense/settlement/budget-milestone content),
   * so a rename shows everywhere instead of leaving stale names in the feed.
   * Runs inside the caller's transaction. Returns the number of posts updated.
   *
   * Matches candidate posts by the `oldName` snapshot. Because a user's category
   * names are unique at any instant, the only theoretical false match is a post
   * left over from a previously-deleted category that once had this exact name —
   * rare, and rewriting it to the new name is harmless.
   */
  async renameCategoryInPosts(
    client: Prisma.TransactionClient,
    userId: string,
    oldName: string,
    newName: string,
  ): Promise<number> {
    if (oldName === newName) return 0;
    // Prefilter in the DB so only posts that even mention the old name are
    // loaded/parsed — instead of scanning the user's entire feed history. On
    // PostgreSQL `contains` is case-sensitive (no `mode: 'insensitive'`), which
    // matches the verbatim-stored `categoryName`. This keeps the in-transaction
    // work bounded and avoids the interactive-transaction timeout at scale.
    const posts = await client.feedPost.findMany({
      where: {
        userId,
        type: { in: ['EXPENSE_ADDED', 'SETTLEMENT_COMPLETED', 'BUDGET_MILESTONE'] },
        content: { contains: oldName },
      },
      select: { id: true, content: true },
    });
    let updated = 0;
    for (const post of posts) {
      const next = applyCategoryRenameToContent(post.content, oldName, newName);
      if (next === null) continue;
      await client.feedPost.update({ where: { id: post.id }, data: { content: next } });
      updated++;
    }
    return updated;
  },

  /**
   * Generates a feed post when an expense is added.
   */
  async generateExpensePost(transactionId: string, message?: string, isPrivate: boolean = false, allowFriendToPrivate: boolean = false, involvedFriendIds: string[] = []) {
    try {
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: {
          creator: true,
          category: true,
          ledgerEntries: {
            include: {
              friendProfile: true,
            },
          },
        },
      });

      if (!transaction || transaction.type !== 'EXPENSE') return;

      const creator = transaction.creator;
      const categoryName = transaction.category?.name || 'expense';
      const amount = transaction.totalAmount.toNumber();

      let description = `added a ${categoryName} split`;
      let friendName = '';
      let friendUserId: string | null = null;
      let involvedFriendUserIds: string[] = [];

      const validFriendIds = involvedFriendIds.filter(id => id !== 'self');
      let friends: any[] = [];
      if (validFriendIds.length > 0) {
        friends = await prisma.friendProfile.findMany({
          where: { id: { in: validFriendIds } },
        });
      }

      if (friends.length === 1) {
        friendName = friends[0].name;
        friendUserId = friends[0].friendUserId;
        description += ` — ₱${amount.toLocaleString()} with ${friendName}`;
      } else if (friends.length > 1) {
        const names = friends.map(f => f.name);
        friendName = names.join(', ');
        involvedFriendUserIds = friends.map(f => f.friendUserId).filter(id => id !== null) as string[];
        friendUserId = involvedFriendUserIds[0] || null;
        description += ` — ₱${amount.toLocaleString()} with ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
      } else {
        // Fallback for older transactions, solo, or if friend profiles were not found/deleted
        const friendEntry = transaction.ledgerEntries.find(
          (e) => e.friendProfileId !== null
        );
        friendName = friendEntry?.friendProfile?.name || '';
        friendUserId = friendEntry?.friendProfile?.friendUserId || null;
        if (friendName) {
          description += ` — ₱${amount.toLocaleString()} with ${friendName}`;
        } else {
          description += ` — ₱${amount.toLocaleString()}`;
        }
      }

      const content = JSON.stringify({
        description,
        amount,
        categoryName,
        friendName,
        friendUserId,
        involvedFriendUserIds,
        transactionId: transaction.id,
        message,
        isPrivate,
        allowFriendToPrivate,
      });

      await prisma.feedPost.create({
        data: {
          userId: creator.id,
          type: 'EXPENSE_ADDED',
          content,
          isPublic: false, // Default to friends only
        },
      });
    } catch (error) {
      console.error('Failed to generate expense feed post:', error);
    }
  },

  /**
   * Generates a feed post when a settlement is completed.
   * "settled a balance — {amount} with {friendName}"
   */
  async generateSettlementPost(transactionId: string, message?: string, isPrivate: boolean = false, allowFriendToPrivate: boolean = false) {
    try {
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: {
          creator: true,
          category: true,
          ledgerEntries: {
            include: {
              friendProfile: true,
            },
          },
        },
      });

      if (!transaction || transaction.type !== 'SETTLEMENT') return;

      const creator = transaction.creator;
      const categoryName = transaction.category?.name || undefined;
      const amount = transaction.totalAmount.toNumber();

      const friendEntry = transaction.ledgerEntries.find(
        (e) => e.friendProfileId !== null
      );
      const friendName = friendEntry?.friendProfile?.name || 'a friend';
      const friendUserId = friendEntry?.friendProfile?.friendUserId || null;

      const description = `settled a balance — ₱${amount.toLocaleString()} with ${friendName}`;

      const content = JSON.stringify({
        description,
        amount,
        categoryName,
        friendName,
        friendUserId,
        transactionId: transaction.id,
        message,
        isPrivate,
        allowFriendToPrivate,
      });

      await prisma.feedPost.create({
        data: {
          userId: creator.id,
          type: 'SETTLEMENT_COMPLETED',
          content,
          isPublic: false,
        },
      });
    } catch (error) {
      console.error('Failed to generate settlement feed post:', error);
    }
  },

  /**
   * Generates a budget milestone post (e.g., 50% or 100% of budget spent).
   * "reached 50% of their {category} budget"
   */
  async generateBudgetMilestonePost(userId: string, categoryId: string, percentage: 50 | 100) {
    try {
      // Check privacy settings first
      const privacy = await prisma.privacySettings.findUnique({
        where: { userId },
      });

      if (privacy?.budgetVisibility === 'PRIVATE') return;

      const category = await prisma.category.findUnique({
        where: { id: categoryId },
      });

      if (!category) return;

      const description = `reached ${percentage}% of their ${category.name} budget`;

      const content = JSON.stringify({
        description,
        categoryName: category.name,
        percentage,
      });

      await prisma.feedPost.create({
        data: {
          userId,
          type: 'BUDGET_MILESTONE',
          content,
          isPublic: false,
        },
      });
    } catch (error) {
      console.error('Failed to generate budget milestone feed post:', error);
    }
  },

  /**
   * Generates a feed post when a badge is earned.
   */
  async generateBadgeEarnedPost(userId: string, badgeSlug: string, badgeName: string) {
    try {
      const description = `earned the ${badgeName} badge 🔥`;
      const content = JSON.stringify({
        description,
        badgeName,
        badgeSlug,
      });

      await prisma.feedPost.create({
        data: {
          userId,
          type: 'BADGE_EARNED',
          content,
          isPublic: false,
        },
      });
    } catch (error) {
      console.error('Failed to generate badge earned feed post:', error);
    }
  },

  /**
   * Generates a feed post when a challenge is completed.
   */
  async generateChallengeCompletedPost(userId: string, challengeId: string, challengeName: string) {
    try {
      const description = `completed the ${challengeName} challenge! 🏆`;
      const content = JSON.stringify({
        description,
        challengeName,
        challengeId,
      });

      await prisma.feedPost.create({
        data: {
          userId,
          type: 'CHALLENGE_COMPLETED',
          content,
          isPublic: false,
        },
      });
    } catch (error) {
      console.error('Failed to generate challenge completed feed post:', error);
    }
  },

  /**
   * Generates a feed post when a streak milestone is reached.
   */
  async generateStreakMilestonePost(userId: string, streakDays: number) {
    try {
      const description = `reached a ${streakDays}-day under-budget streak! 🔥`;
      const content = JSON.stringify({
        description,
        streakDays,
      });

      await prisma.feedPost.create({
        data: {
          userId,
          type: 'STREAK_MILESTONE',
          content,
          isPublic: false,
        },
      });
    } catch (error) {
      console.error('Failed to generate streak milestone feed post:', error);
    }
  },
};
