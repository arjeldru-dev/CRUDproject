import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { Prisma } from '@prisma/client';

/**
 * POST /api/transactions
 * Creates an expense transaction with atomic dual-entry ledger records.
 *
 * Body: { amount, categoryId, payerId, taggieId, splitRatio }
 *   - amount: total expense amount (positive number)
 *   - categoryId: budget category UUID (must belong to req.user)
 *   - payerId: UUID of who paid — either req.user.id or a FriendProfile.id
 *   - taggieId: UUID of who was tagged — either req.user.id or a FriendProfile.id
 *   - splitRatio: 0–1 representing the USER's share (0.5 = 50/50)
 */
export const createExpenseTransaction = async (req: Request, res: Response) => {
  try {
    const { amount, categoryId, payerId, taggieId, splitRatio } = req.body;
    const userId: string = req.user.id;

    // ── Input Validation ──────────────────────────────────────────────
    if (amount === undefined || !categoryId || !payerId || !taggieId || splitRatio === undefined) {
      return res.status(400).json({
        error: 'All fields are required: amount, categoryId, payerId, taggieId, splitRatio',
      });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    if (typeof splitRatio !== 'number' || splitRatio < 0 || splitRatio > 1) {
      return res.status(400).json({ error: 'splitRatio must be a number between 0 and 1' });
    }

    // ── Atomic Transaction ────────────────────────────────────────────
    const result = await prisma.$transaction(async (tx) => {
      // 1. Validate category ownership
      const category = await tx.category.findUnique({ where: { id: categoryId } });

      if (!category) {
        throw { statusCode: 404, message: 'Category not found' };
      }
      if (category.userId !== userId) {
        throw { statusCode: 403, message: 'Forbidden: You do not own this category' };
      }

      // 2. Determine who is the friend in this transaction
      const userIsPayer = payerId === userId;
      const userIsTaggie = taggieId === userId;
      const friendProfileId = userIsPayer ? taggieId : payerId;

      // If there's a friend involved, validate ownership of that FriendProfile
      const isSoloExpense = payerId === userId && taggieId === userId;

      if (!isSoloExpense) {
        const friendProfile = await tx.friendProfile.findUnique({
          where: { id: friendProfileId },
        });

        if (!friendProfile) {
          throw { statusCode: 404, message: 'Friend profile not found' };
        }
        if (friendProfile.mainUserId !== userId) {
          throw { statusCode: 403, message: 'Forbidden: You do not own this friend profile' };
        }
      }

      // 3. Create the Transaction record
      const transaction = await tx.transaction.create({
        data: {
          creatorId: userId,
          categoryId,
          totalAmount: amount,
          type: 'EXPENSE',
        },
      });

      // 4. Calculate split amounts
      const totalDecimal = new Prisma.Decimal(amount);
      const userShare = totalDecimal.mul(new Prisma.Decimal(splitRatio));
      const friendShare = totalDecimal.sub(userShare);

      // 5. Create LedgerEntry records based on the scenario
      const ledgerEntries: Prisma.LedgerEntryCreateManyInput[] = [];

      if (isSoloExpense) {
        // ─── Solo Expense: User paid, no split ───────────────────────
        ledgerEntries.push({
          transactionId: transaction.id,
          userId,
          friendProfileId: null,
          amountChange: totalDecimal,
          type: 'BUDGET_DEDUCTION',
        });
      } else if (userIsPayer) {
        // ─── User Paid, Splitting With Friend ────────────────────────
        // Budget deduction for the full amount (user fronted the money)
        ledgerEntries.push({
          transactionId: transaction.id,
          userId,
          friendProfileId: null,
          amountChange: totalDecimal,
          type: 'BUDGET_DEDUCTION',
        });

        // Friend owes their share back → RECEIVABLE for user
        if (friendShare.gt(0)) {
          ledgerEntries.push({
            transactionId: transaction.id,
            userId,
            friendProfileId,
            amountChange: friendShare,
            type: 'RECEIVABLE',
          });
        }
      } else if (userIsTaggie) {
        // ─── Friend Paid, User Was Tagged ────────────────────────────
        // Budget deduction for user's share only
        ledgerEntries.push({
          transactionId: transaction.id,
          userId,
          friendProfileId: null,
          amountChange: userShare,
          type: 'BUDGET_DEDUCTION',
        });

        // User owes the friend their share → PAYABLE for user
        if (userShare.gt(0)) {
          ledgerEntries.push({
            transactionId: transaction.id,
            userId,
            friendProfileId,
            amountChange: userShare,
            type: 'PAYABLE',
          });
        }
      }

      // Bulk insert all ledger entries
      await tx.ledgerEntry.createMany({ data: ledgerEntries });

      // Return the full picture
      const createdEntries = await tx.ledgerEntry.findMany({
        where: { transactionId: transaction.id },
      });

      return { transaction, ledgerEntries: createdEntries };
    });

    return res.status(201).json(result);
  } catch (error: any) {
    // Handle known business-logic errors thrown inside $transaction
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Create expense transaction error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/transactions/settle
 * Creates a settlement transaction that offsets an existing debt with a friend.
 *
 * Body: { amount, friendProfileId }
 *   - amount: the settlement amount (positive number)
 *   - friendProfileId: the friend whose debt is being settled
 */
export const createSettlement = async (req: Request, res: Response) => {
  try {
    const { amount, friendProfileId } = req.body;
    const userId: string = req.user.id;

    // ── Input Validation ──────────────────────────────────────────────
    if (amount === undefined || !friendProfileId) {
      return res.status(400).json({
        error: 'All fields are required: amount, friendProfileId',
      });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Validate friend profile ownership
      const friendProfile = await tx.friendProfile.findUnique({
        where: { id: friendProfileId },
      });

      if (!friendProfile) {
        throw { statusCode: 404, message: 'Friend profile not found' };
      }
      if (friendProfile.mainUserId !== userId) {
        throw { statusCode: 403, message: 'Forbidden: You do not own this friend profile' };
      }

      // Determine the current balance direction to know what type of entry to create
      const receivables = await tx.ledgerEntry.aggregate({
        where: { userId, friendProfileId, type: 'RECEIVABLE' },
        _sum: { amountChange: true },
      });
      const payables = await tx.ledgerEntry.aggregate({
        where: { userId, friendProfileId, type: 'PAYABLE' },
        _sum: { amountChange: true },
      });

      const totalReceivable = receivables._sum.amountChange
        ? new Prisma.Decimal(receivables._sum.amountChange.toString())
        : new Prisma.Decimal(0);
      const totalPayable = payables._sum.amountChange
        ? new Prisma.Decimal(payables._sum.amountChange.toString())
        : new Prisma.Decimal(0);
      const netBalance = totalReceivable.sub(totalPayable);

      const settlementAmount = new Prisma.Decimal(amount);

      // Create the settlement transaction (no category needed)
      const transaction = await tx.transaction.create({
        data: {
          creatorId: userId,
          categoryId: null,
          totalAmount: amount,
          type: 'SETTLEMENT',
        },
      });

      // If net >= 0, friend owed user (or balanced) → friend is paying back → reduce RECEIVABLE
      // If net < 0, user owed friend → user is paying back → reduce PAYABLE
      const ledgerType = netBalance.gte(0) ? 'RECEIVABLE' : 'PAYABLE';

      // Settlement entry is negative to offset existing debt
      await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          userId,
          friendProfileId,
          amountChange: settlementAmount.neg(),
          type: ledgerType,
        },
      });

      const createdEntries = await tx.ledgerEntry.findMany({
        where: { transactionId: transaction.id },
      });

      return { transaction, ledgerEntries: createdEntries };
    });

    return res.status(201).json(result);
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Create settlement error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/transactions/balances
 * Returns net balance per friend: sum(RECEIVABLE) - sum(PAYABLE).
 * Positive = friend owes user. Negative = user owes friend.
 */
export const getBalances = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;

    // Get all ledger entries with friend profiles for this user
    const receivables = await prisma.ledgerEntry.groupBy({
      by: ['friendProfileId'],
      where: {
        userId,
        type: 'RECEIVABLE',
        friendProfileId: { not: null },
      },
      _sum: { amountChange: true },
    });

    const payables = await prisma.ledgerEntry.groupBy({
      by: ['friendProfileId'],
      where: {
        userId,
        type: 'PAYABLE',
        friendProfileId: { not: null },
      },
      _sum: { amountChange: true },
    });

    // Merge into a single balance map
    const balanceMap = new Map<string, Prisma.Decimal>();

    for (const r of receivables) {
      if (r.friendProfileId) {
        const current = balanceMap.get(r.friendProfileId) || new Prisma.Decimal(0);
        balanceMap.set(
          r.friendProfileId,
          current.add(r._sum.amountChange || new Prisma.Decimal(0))
        );
      }
    }

    for (const p of payables) {
      if (p.friendProfileId) {
        const current = balanceMap.get(p.friendProfileId) || new Prisma.Decimal(0);
        balanceMap.set(
          p.friendProfileId,
          current.sub(p._sum.amountChange || new Prisma.Decimal(0))
        );
      }
    }

    // Fetch friend names for display
    const friendIds = Array.from(balanceMap.keys());
    const friends = await prisma.friendProfile.findMany({
      where: { id: { in: friendIds } },
      select: { id: true, name: true },
    });

    const friendNameMap = new Map(friends.map((f) => [f.id, f.name]));

    const balances = Array.from(balanceMap.entries()).map(([friendProfileId, netBalance]) => ({
      friendProfileId,
      friendName: friendNameMap.get(friendProfileId) || 'Unknown',
      netBalance: netBalance.toNumber(),
    }));

    return res.status(200).json({ balances });
  } catch (error) {
    console.error('Get balances error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/transactions/budget
 * Returns budget status per category for the current calendar month.
 * Shows monthlyLimit, total spent (BUDGET_DEDUCTION), and remaining.
 */
export const getBudgetStatus = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;

    // Get all categories for the user
    const categories = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true, monthlyLimit: true },
    });

    // Calculate the current month boundaries
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // For each category, sum BUDGET_DEDUCTION entries in the current month
    const budgetStatuses = await Promise.all(
      categories.map(async (category) => {
        const deductions = await prisma.ledgerEntry.aggregate({
          where: {
            userId,
            type: 'BUDGET_DEDUCTION',
            transaction: {
              categoryId: category.id,
              createdAt: {
                gte: monthStart,
                lt: monthEnd,
              },
            },
          },
          _sum: { amountChange: true },
        });

        const spent = deductions._sum.amountChange
          ? new Prisma.Decimal(deductions._sum.amountChange.toString()).toNumber()
          : 0;
        const monthlyLimit = new Prisma.Decimal(category.monthlyLimit.toString()).toNumber();
        const remaining = monthlyLimit - spent;

        return {
          categoryId: category.id,
          categoryName: category.name,
          monthlyLimit,
          spent,
          remaining,
        };
      })
    );

    return res.status(200).json({ budgetStatuses });
  } catch (error) {
    console.error('Get budget status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
