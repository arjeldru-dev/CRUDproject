import { prisma } from '../config/db';
import { Transaction, Category, User, FeedPostType } from '@prisma/client';

/**
 * FeedService handles the automatic generation of social feed posts
 * based on financial activity triggers.
 */
export const feedService = {
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

      if (involvedFriendIds.length > 0) {
        const friends = await prisma.friendProfile.findMany({
          where: { id: { in: involvedFriendIds } },
        });

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
        }
      } else {
        // Fallback for older transactions or solo
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
          ledgerEntries: {
            include: {
              friendProfile: true,
            },
          },
        },
      });

      if (!transaction || transaction.type !== 'SETTLEMENT') return;

      const creator = transaction.creator;
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
};
