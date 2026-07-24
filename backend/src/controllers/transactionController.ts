import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { Prisma } from '@prisma/client';
import { feedService } from '../services/feedService';
import { createNotification } from '../services/notificationService';
import { generateSpendingForecast } from '../services/forecastingService';
import { gamificationService } from '../services/gamificationService';
import { getPeriodWindow } from '../services/budgetPeriodService';
import {
  validateAmount,
  validateSplits,
  validateMessage,
} from '../services/transactionValidationService';
import { resolveTimezone } from './savingsController';
import crypto from 'crypto';

/**
 * POST /api/transactions
 * Creates an expense transaction with atomic dual-entry ledger records.
 *
 * Body: { amount, categoryId, payerId, splits }
 *   - amount: total expense amount (positive number)
 *   - categoryId: budget category UUID (must belong to req.user)
 *   - payerId: UUID of who paid — either req.user.id ('self') or a FriendProfile.id
 *   - splits: array of objects { profileId: 'self' | string, amount: number }
 */
export const createExpenseTransaction = async (req: Request, res: Response) => {
  try {
    const { amount, categoryId, payerId, splits, message, isPrivate, allowFriendToPrivate } = req.body;
    const userId: string = req.user.id;

    // ── Input Validation ──────────────────────────────────────────────
    if (amount === undefined || !categoryId || !payerId || !splits || !Array.isArray(splits)) {
      return res.status(400).json({
        error: 'All fields are required: amount, categoryId, payerId, splits array',
      });
    }

    // Hardened validation (rejects NaN/Infinity, over-limit, >2 decimals, and
    // malformed/negative splits). Throws ValidationError → 400 via the outer
    // catch, before any pending-approval rows or notifications are created.
    validateAmount(amount);
    const cleanMessage = validateMessage(message);
    validateSplits(splits, amount);

    // Determine payer
    const userIsPayer = payerId === userId || payerId === 'self';
    let payerUserId: string | null = null;
    let payerProfile: any = null;

    if (!userIsPayer) {
      payerProfile = await prisma.friendProfile.findUnique({
        where: { id: payerId },
      });
      if (!payerProfile || payerProfile.mainUserId !== userId) {
        return res.status(404).json({ error: 'Payer profile not found or forbidden' });
      }
      payerUserId = payerProfile.friendUserId;
    }

    // Check if splits involve registered friends.
    const involvedFriendUserIds: string[] = [];

    const splitProfileIds = splits
      .map((s: any) => s.profileId)
      .filter((id: string) => id && id !== 'self' && id !== userId);
    
    if (splitProfileIds.length > 0) {
      const friendProfiles = await prisma.friendProfile.findMany({
        where: { id: { in: splitProfileIds } },
        select: { friendUserId: true },
      });
      for (const fp of friendProfiles) {
        if (fp.friendUserId && fp.friendUserId !== userId && !involvedFriendUserIds.includes(fp.friendUserId)) {
          involvedFriendUserIds.push(fp.friendUserId);
        }
      }
    }

    if ((payerUserId && payerUserId !== userId) || involvedFriendUserIds.length > 0) {
      // Build the list of all friend user IDs that need to approve.
      // If a non-self payer exists, they must approve. Additionally,
      // every registered friend in the splits needs to approve.
      const approverUserIds: string[] = [];
      if (payerUserId && payerUserId !== userId) {
        approverUserIds.push(payerUserId);
      }
      for (const friendUserId of involvedFriendUserIds) {
        if (!approverUserIds.includes(friendUserId)) {
          approverUserIds.push(friendUserId);
        }
      }

      const groupId = crypto.randomUUID();
      const pendingTransactions = [];
      for (const approverUserId of approverUserIds) {
        const pendingTx = await prisma.pendingTransaction.create({
          data: {
            creatorId: userId,
            payerId,
            payerUserId: approverUserId,
            categoryId,
            amount: new Prisma.Decimal(amount),
            splits: splits as any,
            message: cleanMessage ?? null,
            isPrivate: isPrivate || false,
            allowFriendToPrivate: allowFriendToPrivate ?? true,
            type: 'EXPENSE',
            groupId,
          },
        });

        await createNotification({
          recipientId: approverUserId,
          actorId: userId,
          type: 'TRANSACTION_APPROVAL_REQUEST',
          data: {
            pendingTransactionId: pendingTx.id,
            amount,
          },
        });

        pendingTransactions.push(pendingTx);
      }

      return res.status(202).json({
        status: 'PENDING_APPROVAL',
        message: `Transaction sent to ${approverUserIds.length} friend(s) for approval.`,
        pendingTransactions,
      });
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

      // 3. Create the Transaction record
      const transaction = await tx.transaction.create({
        data: {
          creatorId: userId,
          categoryId,
          totalAmount: amount,
          type: 'EXPENSE',
        },
      });

      // 4. Create LedgerEntry records based on splits
      const ledgerEntries: Prisma.LedgerEntryCreateManyInput[] = [];
      const totalDecimal = new Prisma.Decimal(amount);
      const notifiedFriends: string[] = [];
      let friendBudgetEntry: any = null;
      let friendCategory: any = null;
      let payerUserId: string | null = null;

      if (userIsPayer) {
        const helperResult = await generateSelfPaidExpenseLedgerEntries(
          tx,
          transaction.id,
          userId,
          totalDecimal,
          splits
        );
        ledgerEntries.push(...helperResult.ledgerEntries);
        notifiedFriends.push(...helperResult.notifiedFriends);
      } else {
        // A friend paid. We record debts to the payer friend for everyone in the split.
        const payerProfile = await tx.friendProfile.findUnique({
          where: { id: payerId },
        });
        if (!payerProfile || payerProfile.mainUserId !== userId) {
           throw { statusCode: 404, message: 'Payer profile not found or forbidden' };
        }
        payerUserId = payerProfile.friendUserId;

        if (payerUserId) {
          const targetCategory = await tx.category.findUnique({ where: { id: categoryId } });
          if (targetCategory) {
            friendCategory = await tx.category.findFirst({
              where: {
                userId: payerUserId,
                name: {
                  equals: targetCategory.name,
                  mode: 'insensitive',
                },
              },
            });

            if (!friendCategory) {
              friendCategory = await tx.category.create({
                data: {
                  userId: payerUserId,
                  name: targetCategory.name,
                  limitAmount: targetCategory.limitAmount,
                  // Copy the full period config so the friend's mirror category
                  // tracks on the same cadence as the original.
                  period: targetCategory.period,
                  monthlyStartDay: targetCategory.monthlyStartDay,
                  weeklyStartDay: targetCategory.weeklyStartDay,
                  customPeriodDays: targetCategory.customPeriodDays,
                  anchorDate: targetCategory.anchorDate,
                },
              });
            }

            const friendTransaction = await tx.transaction.create({
              data: {
                creatorId: payerUserId,
                categoryId: friendCategory.id,
                totalAmount: amount,
                type: 'EXPENSE',
              },
            });

            friendBudgetEntry = await tx.ledgerEntry.create({
              data: {
                transactionId: friendTransaction.id,
                userId: payerUserId,
                friendProfileId: null,
                amountChange: totalDecimal,
                type: 'BUDGET_DEDUCTION',
              },
            });
          }
        }

        for (const split of splits) {
          if (split.amount <= 0) continue;
          if (split.profileId === payerId) continue; // Payer doesn't owe themselves
          
          const splitAmount = new Prisma.Decimal(split.amount);

          if (split.profileId === userId || split.profileId === 'self') {
            // 1. User owes the payer — NO budget deduction yet.
            //    The user's cash hasn't left their pocket; they'll pay later
            //    and choose a budget category during settlement.

            ledgerEntries.push({
              transactionId: transaction.id,
              userId,
              friendProfileId: payerId,
              amountChange: splitAmount,
              type: 'PAYABLE',
            });

            if (payerUserId) {
               if (!notifiedFriends.includes(payerUserId)) {
                 notifiedFriends.push(payerUserId);
               }
               let bProfileForA = await tx.friendProfile.findFirst({
                 where: { mainUserId: payerUserId, friendUserId: userId }
               });
               if (!bProfileForA) {
                 const currentUser = await tx.user.findUnique({ where: { id: userId } });
                 bProfileForA = await tx.friendProfile.create({
                   data: { mainUserId: payerUserId, friendUserId: userId, name: currentUser?.displayName || currentUser?.username || 'Friend', isGhost: false }
                 });
               }
               if (bProfileForA) {
                 ledgerEntries.push({
                   transactionId: transaction.id,
                   userId: payerUserId,
                   friendProfileId: bProfileForA.id,
                   amountChange: splitAmount,
                   type: 'RECEIVABLE',
                 });
               }
            }
          } else {
            // 2. A third-party friend owes the payer
            const splitProfile = await tx.friendProfile.findUnique({
              where: { id: split.profileId },
            });
            if (!splitProfile) continue;

            const cUserId = splitProfile.friendUserId;

            // If both payer and the splitting friend are registered users, they might be friends
            if (payerUserId && cUserId) {
              let bProfileForC = await tx.friendProfile.findFirst({
                where: { mainUserId: payerUserId, friendUserId: cUserId }
              });
              if (!bProfileForC) {
                 bProfileForC = await tx.friendProfile.create({
                   data: { mainUserId: payerUserId, friendUserId: cUserId, name: splitProfile.name, isGhost: false }
                 });
              }

              let cProfileForB = await tx.friendProfile.findFirst({
                where: { mainUserId: cUserId, friendUserId: payerUserId }
              });
              if (!cProfileForB) {
                 cProfileForB = await tx.friendProfile.create({
                   data: { mainUserId: cUserId, friendUserId: payerUserId, name: payerProfile.name, isGhost: false }
                 });
              }

              if (bProfileForC && cProfileForB) {
                 // Payer (B) receives from Friend (C)
                 ledgerEntries.push({
                   transactionId: transaction.id,
                   userId: payerUserId,
                   friendProfileId: bProfileForC.id,
                   amountChange: splitAmount,
                   type: 'RECEIVABLE',
                 });
                 // Friend (C) owes Payer (B)
                 ledgerEntries.push({
                   transactionId: transaction.id,
                   userId: cUserId,
                   friendProfileId: cProfileForB.id,
                   amountChange: splitAmount,
                   type: 'PAYABLE',
                 });

                 if (!notifiedFriends.includes(payerUserId)) notifiedFriends.push(payerUserId);
                 if (!notifiedFriends.includes(cUserId)) notifiedFriends.push(cUserId);
              }
            } else {
               // C is a ghost. A acts as middleman.
               // A owes B for C's share
               ledgerEntries.push({
                 transactionId: transaction.id,
                 userId,
                 friendProfileId: payerId,
                 amountChange: splitAmount,
                 type: 'PAYABLE',
               });
               
               if (payerUserId) {
                 let bProfileForA = await tx.friendProfile.findFirst({
                   where: { mainUserId: payerUserId, friendUserId: userId }
                 });
                 if (!bProfileForA) {
                   const currentUser = await tx.user.findUnique({ where: { id: userId } });
                   bProfileForA = await tx.friendProfile.create({
                     data: { mainUserId: payerUserId, friendUserId: userId, name: currentUser?.displayName || currentUser?.username || 'Friend', isGhost: false }
                   });
                 }
                 if (bProfileForA) {
                   ledgerEntries.push({
                     transactionId: transaction.id,
                     userId: payerUserId,
                     friendProfileId: bProfileForA.id,
                     amountChange: splitAmount,
                     type: 'RECEIVABLE',
                   });
                   if (!notifiedFriends.includes(payerUserId)) notifiedFriends.push(payerUserId);
                 }
               }

               // C owes A for C's share
               ledgerEntries.push({
                 transactionId: transaction.id,
                 userId,
                 friendProfileId: split.profileId,
                 amountChange: splitAmount,
                 type: 'RECEIVABLE',
               });
            }
          }
        }
      }

      await tx.ledgerEntry.createMany({ data: ledgerEntries });
      const createdEntries = await tx.ledgerEntry.findMany({
        where: { transactionId: transaction.id },
      });

      return {
        transaction,
        ledgerEntries: createdEntries,
        notifiedFriends,
        payerUserId,
        friendBudgetEntry,
        friendCategory
      };
    });

    // ── Notifications ─────────────────────────────────────────────────
    for (const friendUserId of result.notifiedFriends) {
      await createNotification({
        recipientId: friendUserId,
        actorId: userId,
        type: 'ADDED_TO_SPLIT',
        data: { transactionId: result.transaction.id, amount },
      });
    }

    // ── Feed Post Generation ──────────────────────────────────────────
    const involvedFriendIds = splits
      .filter((s: any) => s.profileId !== 'self' && s.profileId !== userId)
      .map((s: any) => s.profileId);
    const isPayerOutsideSplit = payerId !== 'self' && payerId !== userId && !involvedFriendIds.includes(payerId);
    const hasFullBudgetDeduction = result.ledgerEntries.some(
      le => le.type === 'BUDGET_DEDUCTION' && le.amountChange.toNumber() === amount
    );
    if (!hasFullBudgetDeduction && isPayerOutsideSplit) {
      involvedFriendIds.push(payerId);
    }
    
    // Convert to unique set
    const uniqueInvolvedFriendIds = Array.from(new Set(involvedFriendIds));

    // Call generateExpensePost with additional friends array
    await feedService.generateExpensePost(result.transaction.id, cleanMessage, isPrivate, allowFriendToPrivate, uniqueInvolvedFriendIds);

    // Check for budget milestones
    const budgetEntry = result.ledgerEntries.find(le => le.type === 'BUDGET_DEDUCTION');
    const budgetDeductionAmount = budgetEntry ? Number(budgetEntry.amountChange) : 0;
    if (budgetDeductionAmount > 0) {
      checkBudgetMilestones(userId, categoryId, budgetDeductionAmount).catch(console.error);
    }

    if (result.friendBudgetEntry && result.friendCategory) {
      const friendDeductionAmount = Number(result.friendBudgetEntry.amountChange);
      if (friendDeductionAmount > 0) {
        checkBudgetMilestones(result.payerUserId!, result.friendCategory.id, friendDeductionAmount).catch(console.error);
      }
    }

    // Fire-and-forget gamification evaluation
    gamificationService.triggerGamificationUpdates(userId).catch(console.error);

    if (result.payerUserId) {
      gamificationService.triggerGamificationUpdates(result.payerUserId).catch(console.error);
    }

    return res.status(201).json(result);
} catch (error: any) {
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
 * Body: { amount, friendProfileId, payerId, categoryId? }
 *   - amount: the settlement amount (positive number)
 *   - friendProfileId: the friend whose debt is being settled
 *   - payerId: 'self' if user pays, or friendProfileId if friend pays
 *   - categoryId: (optional) budget category to deduct from (user pays) or refund to (friend pays)
 */
export const createSettlement = async (req: Request, res: Response) => {
  try {
    const { amount, friendProfileId, payerId, categoryId, message, isPrivate, allowFriendToPrivate } = req.body;
    const userId: string = req.user.id;

    // ── Input Validation ──────────────────────────────────────────────
    if (amount === undefined || !friendProfileId || !payerId) {
      return res.status(400).json({
        error: 'All fields are required: amount, friendProfileId, payerId',
      });
    }

    if (!categoryId) {
      return res.status(400).json({ error: 'Budget category is required for settlement' });
    }

    validateAmount(amount);
    const cleanMessage = validateMessage(message);

    // Validate categoryId ownership if provided
    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        return res.status(404).json({ error: 'Budget category not found' });
      }
      if (category.userId !== userId) {
        return res.status(403).json({ error: 'Forbidden: You do not own this category' });
      }
    }

    // Validate friend profile ownership
    const friendProfile = await prisma.friendProfile.findUnique({
      where: { id: friendProfileId },
    });

    if (!friendProfile) {
      return res.status(404).json({ error: 'Friend profile not found' });
    }
    if (friendProfile.mainUserId !== userId) {
      return res.status(403).json({ error: 'Forbidden: You do not own this friend profile' });
    }

    if (friendProfile.friendUserId) {
      const pendingTx = await prisma.pendingTransaction.create({
        data: {
          creatorId: userId,
          payerId,
          payerUserId: friendProfile.friendUserId,
          categoryId: categoryId || null,
          amount: new Prisma.Decimal(amount),
          splits: [] as any,
          message: cleanMessage ?? null,
          isPrivate: isPrivate || false,
          allowFriendToPrivate: allowFriendToPrivate ?? true,
          type: 'SETTLEMENT',
          friendProfileId,
        },
      });

      await createNotification({
        recipientId: friendProfile.friendUserId,
        actorId: userId,
        type: 'TRANSACTION_APPROVAL_REQUEST',
        data: {
          pendingTransactionId: pendingTx.id,
          amount,
        },
      });

      return res.status(202).json({
        status: 'PENDING_APPROVAL',
        message: 'Settlement sent to the friend for approval.',
        pendingTransaction: pendingTx,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const settlementAmount = new Prisma.Decimal(amount);

      // Based on who paid, reduce the appropriate debt.
      // If user paid ('self'), user is reducing their PAYABLE to the friend.
      // If friend paid (friendProfileId), friend is reducing user's RECEIVABLE from the friend.
      const ledgerType = payerId === 'self' ? 'PAYABLE' : 'RECEIVABLE';
      const inverseLedgerType = payerId === 'self' ? 'RECEIVABLE' : 'PAYABLE';

      // Validate that the user has enough balance to settle
      const currentBalanceAgg = await tx.ledgerEntry.aggregate({
        where: {
          userId,
          friendProfileId,
          type: ledgerType,
        },
        _sum: { amountChange: true },
      });

      const currentBalance = currentBalanceAgg._sum.amountChange 
        ? new Prisma.Decimal(currentBalanceAgg._sum.amountChange.toString()) 
        : new Prisma.Decimal(0);

      if (currentBalance.lessThan(settlementAmount)) {
        throw { 
          statusCode: 400, 
          message: `Invalid settlement: You cannot settle more than your current ${ledgerType.toLowerCase()} balance with this friend.` 
        };
      }

      // Create the settlement transaction with optional category
      const transaction = await tx.transaction.create({
        data: {
          creatorId: userId,
          categoryId: categoryId || null,
          totalAmount: amount,
          type: 'SETTLEMENT',
        },
      });

      // Find inverse FriendProfile if the friend is a real user
      let inverseFriendProfile = null;
      if (friendProfile.friendUserId) {
        inverseFriendProfile = await tx.friendProfile.findFirst({
          where: {
            mainUserId: friendProfile.friendUserId,
            friendUserId: userId,
          },
        });
      }

      // Settlement entry is negative to offset existing debt
      const entriesToCreate: Prisma.LedgerEntryCreateManyInput[] = [
        {
          transactionId: transaction.id,
          userId,
          friendProfileId,
          amountChange: settlementAmount.neg(),
          type: ledgerType,
        }
      ];

      if (inverseFriendProfile) {
        entriesToCreate.push({
          transactionId: transaction.id,
          userId: friendProfile.friendUserId!,
          friendProfileId: inverseFriendProfile.id,
          amountChange: settlementAmount.neg(),
          type: inverseLedgerType,
        });
      }

      // ── Budget Impact (for the settlement creator) ─────────────────
      // If a categoryId was provided, create a budget entry.
      if (categoryId) {
        if (payerId === 'self') {
          // User is paying the friend → cash leaves pocket → DEDUCT from budget
          entriesToCreate.push({
            transactionId: transaction.id,
            userId,
            friendProfileId: null,
            amountChange: settlementAmount,
            type: 'BUDGET_DEDUCTION',
          });
        } else {
          // Friend is paying the user → cash returns to pocket → REFUND to budget
          entriesToCreate.push({
            transactionId: transaction.id,
            userId,
            friendProfileId: null,
            amountChange: settlementAmount.neg(),
            type: 'BUDGET_DEDUCTION',
          });
        }
      }

      await tx.ledgerEntry.createMany({ data: entriesToCreate });

      // ── Auto-refund the OTHER party's budget ─────────────────────────
      // When someone receives money back, their budget should be restored
      // using the original expense's category.
      if (friendProfile.friendUserId && inverseFriendProfile) {
        // Determine who is receiving money
        const receiverId = payerId === 'self'
          ? friendProfile.friendUserId   // Creator pays → friend receives
          : null;                        // Friend pays → creator receives (handled above via categoryId)

        if (receiverId) {
          // Find the original expense that created the RECEIVABLE for the receiver
          const originalEntry = await tx.ledgerEntry.findFirst({
            where: {
              userId: receiverId,
              friendProfileId: inverseFriendProfile.id,
              type: 'RECEIVABLE',
              amountChange: { gt: 0 },
              transaction: {
                type: 'EXPENSE',
                categoryId: { not: null },
              },
            },
            include: {
              transaction: { select: { categoryId: true } },
            },
            orderBy: { transaction: { createdAt: 'desc' } },
          });

          if (originalEntry?.transaction.categoryId) {
            // Create a budget refund transaction for the receiver
            // (needs its own transaction record so getBudgetStatus
            //  attributes the refund to the correct category)
            const refundTx = await tx.transaction.create({
              data: {
                creatorId: receiverId,
                categoryId: originalEntry.transaction.categoryId,
                totalAmount: amount,
                type: 'SETTLEMENT',
              },
            });

            await tx.ledgerEntry.create({
              data: {
                transactionId: refundTx.id,
                userId: receiverId,
                friendProfileId: null,
                amountChange: settlementAmount.neg(),
                type: 'BUDGET_DEDUCTION',
              },
            });
          }
        }
      }

      const createdEntries = await tx.ledgerEntry.findMany({
        where: { transactionId: transaction.id },
      });

      return { transaction, ledgerEntries: createdEntries, friendUserId: friendProfile.friendUserId };
    });

    // ── Notifications ─────────────────────────────────────────────────
    if (result.friendUserId) {
      await createNotification({
        recipientId: result.friendUserId,
        actorId: userId,
        type: 'BALANCE_CHANGED',
        data: { transactionId: result.transaction.id, amount },
      });
    }

    // ── Feed Post Generation ──────────────────────────────────────────
    await feedService.generateSettlementPost(result.transaction.id, cleanMessage, isPrivate, allowFriendToPrivate);

    // Fire-and-forget gamification evaluation
    gamificationService.triggerGamificationUpdates(userId).catch(console.error);

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

    // Merge into a single balance map containing both receivable and payable
    const balanceMap = new Map<string, { receivable: Prisma.Decimal; payable: Prisma.Decimal }>();

    for (const r of receivables) {
      if (r.friendProfileId) {
        const current = balanceMap.get(r.friendProfileId) || { receivable: new Prisma.Decimal(0), payable: new Prisma.Decimal(0) };
        current.receivable = current.receivable.add(r._sum.amountChange || new Prisma.Decimal(0));
        balanceMap.set(r.friendProfileId, current);
      }
    }

    for (const p of payables) {
      if (p.friendProfileId) {
        const current = balanceMap.get(p.friendProfileId) || { receivable: new Prisma.Decimal(0), payable: new Prisma.Decimal(0) };
        current.payable = current.payable.add(p._sum.amountChange || new Prisma.Decimal(0));
        balanceMap.set(p.friendProfileId, current);
      }
    }

    // Fetch friend names for display
    const friendIds = Array.from(balanceMap.keys());
    const friends = await prisma.friendProfile.findMany({
      where: { id: { in: friendIds } },
      select: { id: true, name: true },
    });

    const friendNameMap = new Map(friends.map((f) => [f.id, f.name]));

    const balances = Array.from(balanceMap.entries()).map(([friendProfileId, bals]) => ({
      friendProfileId,
      friendName: friendNameMap.get(friendProfileId) || 'Unknown',
      receivableBalance: Math.max(0, bals.receivable.toNumber()),
      payableBalance: Math.max(0, bals.payable.toNumber()),
    }));

    return res.status(200).json({ balances });
  } catch (error) {
    console.error('Get balances error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/transactions/budget
 * Returns budget status per category for that category's own recurring period
 * (daily / weekly / monthly / custom). Shows limitAmount, spent
 * (BUDGET_DEDUCTION within the window), remaining, and the forecast.
 *
 * Query params: `timezone` (IANA, optional) and `now` (ISO, optional — for testing).
 */
export const getBudgetStatus = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;

    const categories = await prisma.category.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        limitAmount: true,
        period: true,
        monthlyStartDay: true,
        weeklyStartDay: true,
        customPeriodDays: true,
        anchorDate: true,
        iconKey: true,
      },
    });

    if (categories.length === 0) {
      return res.status(200).json({ budgetStatuses: [] });
    }

    // Resolve timezone via the shared resolver (request param → stored → UTC),
    // the same precedence the savings endpoints use so a category's budget
    // window and its savings figures always agree.
    const gamification = await prisma.userGamification.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    const timezone = resolveTimezone(req.query.timezone, gamification?.timezone);

    // The `now` override is a test-only affordance; ignore it in production so a
    // client can never request budget status for an arbitrary instant.
    let now = new Date();
    if (process.env.NODE_ENV !== 'production') {
      const reqNow = req.query.now as string | undefined;
      const parsedNow = reqNow ? new Date(reqNow) : now;
      if (!isNaN(parsedNow.getTime())) now = parsedNow;
    }

    // Compute each category's active window.
    const windows = categories.map((category) => ({
      category,
      window: getPeriodWindow(
        category.period,
        {
          monthlyStartDay: category.monthlyStartDay,
          weeklyStartDay: category.weeklyStartDay,
          customPeriodDays: category.customPeriodDays,
          anchorDate: category.anchorDate,
        },
        now,
        timezone
      ),
    }));

    // Single bounded query over the union of all windows to avoid N+1.
    // reduce (not Math.min(...spread)) so a user with very many categories can
    // never blow the call-stack argument limit. `windows` is non-empty here.
    const minStart = new Date(
      windows.reduce((min, w) => Math.min(min, w.window.periodStart.getTime()), Infinity),
    );
    const maxEnd = new Date(
      windows.reduce((max, w) => Math.max(max, w.window.periodEnd.getTime()), -Infinity),
    );

    const allDeductions = await prisma.ledgerEntry.findMany({
      where: {
        userId,
        type: 'BUDGET_DEDUCTION',
        transaction: {
          createdAt: { gte: minStart, lt: maxEnd },
        },
      },
      include: {
        transaction: { select: { categoryId: true, createdAt: true } },
      },
    });

    // Bucket each deduction into the category whose window contains its timestamp.
    // Accumulate in Prisma.Decimal (not JS float) so summing many Decimal(10,2)
    // deductions stays exact; convert to a number once per category below.
    const windowByCategory = new Map(windows.map((w) => [w.category.id, w.window]));
    const spentByCategory = new Map<string, Prisma.Decimal>();
    for (const entry of allDeductions) {
      const catId = entry.transaction?.categoryId;
      const createdAt = entry.transaction?.createdAt;
      if (!catId || !createdAt) continue;
      const win = windowByCategory.get(catId);
      if (!win) continue;
      const t = createdAt.getTime();
      if (t >= win.periodStart.getTime() && t < win.periodEnd.getTime()) {
        const acc = spentByCategory.get(catId) ?? new Prisma.Decimal(0);
        spentByCategory.set(catId, acc.add(entry.amountChange.toString()));
      }
    }

    const budgetStatuses = windows.map(({ category, window }) => {
      const spent = (spentByCategory.get(category.id) ?? new Prisma.Decimal(0)).toNumber();
      const limitAmount = new Prisma.Decimal(category.limitAmount.toString()).toNumber();
      const remaining = limitAmount - spent;

      // --- Heuristic Spending Forecasting Engine ---
      const forecast = generateSpendingForecast({
        spent,
        limitAmount,
        daysElapsed: window.daysElapsed,
        daysRemaining: window.daysRemaining,
        categoryName: category.name,
        periodLabel: window.periodLabel,
        totalDays: window.totalDays,
      });

      return {
        categoryId: category.id,
        categoryName: category.name,
        iconKey: category.iconKey,
        limitAmount,
        period: category.period,
        monthlyStartDay: category.monthlyStartDay,
        weeklyStartDay: category.weeklyStartDay,
        customPeriodDays: category.customPeriodDays,
        anchorDate: category.anchorDate ? category.anchorDate.toISOString() : null,
        periodLabel: window.periodLabel,
        periodStart: window.periodStart.toISOString(),
        periodEnd: window.periodEnd.toISOString(),
        spent,
        remaining,
        ...forecast,
      };
    });

    return res.status(200).json({ budgetStatuses });
  } catch (error) {
    console.error('Get budget status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/transactions/topup
 * Manually replenishes a budget category by adding funds.
 *
 * Body: { amount, categoryId, message? }
 *   - amount: the top-up amount (positive number)
 *   - categoryId: budget category UUID (must belong to req.user)
 *   - message: optional note for the top-up
 */
export const createTopUp = async (req: Request, res: Response) => {
  try {
    const { amount, categoryId, message } = req.body;
    const userId: string = req.user.id;

    // ── Input Validation ──────────────────────────────────────────────
    if (amount === undefined || !categoryId) {
      return res.status(400).json({
        error: 'All fields are required: amount, categoryId',
      });
    }

    validateAmount(amount);
    validateMessage(message);

    const result = await prisma.$transaction(async (tx) => {
      // Validate category ownership
      const category = await tx.category.findUnique({ where: { id: categoryId } });

      if (!category) {
        throw { statusCode: 404, message: 'Category not found' };
      }
      if (category.userId !== userId) {
        throw { statusCode: 403, message: 'Forbidden: You do not own this category' };
      }

      // Create the top-up transaction
      const transaction = await tx.transaction.create({
        data: {
          creatorId: userId,
          categoryId,
          totalAmount: amount,
          type: 'TOP_UP',
        },
      });

      // Create a negative BUDGET_DEDUCTION to restore budget
      // (getBudgetStatus sums BUDGET_DEDUCTION entries; a negative value reduces "spent")
      const topUpAmount = new Prisma.Decimal(amount);

      await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          userId,
          friendProfileId: null,
          amountChange: topUpAmount.neg(),
          type: 'BUDGET_DEDUCTION',
        },
      });

      const createdEntries = await tx.ledgerEntry.findMany({
        where: { transactionId: transaction.id },
      });

      return { transaction, ledgerEntries: createdEntries };
    });

    // Fire-and-forget gamification evaluation
    gamificationService.triggerGamificationUpdates(userId).catch(console.error);

    return res.status(201).json(result);
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Create top-up error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Helper to check if an expense triggered a 50% or 100% budget milestone.
 */
async function checkBudgetMilestones(userId: string, categoryId: string, currentTransactionAmount: number = 0) {
  try {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: {
        limitAmount: true,
        period: true,
        monthlyStartDay: true,
        weeklyStartDay: true,
        customPeriodDays: true,
        anchorDate: true,
      },
    });

    if (!category) return;

    const gamification = await prisma.userGamification.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    // Same resolver as getBudgetStatus (no request param here → stored → UTC) so
    // milestone windows match what the user sees on the budget screen.
    const timezone = resolveTimezone(undefined, gamification?.timezone);

    // Compute milestone against the category's own period window.
    const window = getPeriodWindow(
      category.period,
      {
        monthlyStartDay: category.monthlyStartDay,
        weeklyStartDay: category.weeklyStartDay,
        customPeriodDays: category.customPeriodDays,
        anchorDate: category.anchorDate,
      },
      new Date(),
      timezone
    );

    const deductions = await prisma.ledgerEntry.aggregate({
      where: {
        userId,
        type: 'BUDGET_DEDUCTION',
        transaction: {
          categoryId,
          createdAt: {
            gte: window.periodStart,
            lt: window.periodEnd,
          },
        },
      },
      _sum: { amountChange: true },
    });

    const currentSpent = deductions._sum.amountChange
      ? new Prisma.Decimal(deductions._sum.amountChange.toString()).toNumber()
      : 0;
    const limit = category.limitAmount.toNumber();

    if (limit <= 0) return;

    const previousSpent = currentSpent - currentTransactionAmount;
    const currentPercentage = (currentSpent / limit) * 100;
    const previousPercentage = (previousSpent / limit) * 100;

    if (previousPercentage < 100 && currentPercentage >= 100) {
      await feedService.generateBudgetMilestonePost(userId, categoryId, 100);
    } else if (previousPercentage < 50 && currentPercentage >= 50) {
      await feedService.generateBudgetMilestonePost(userId, categoryId, 50);
    }
  } catch (error) {
    console.error('Check budget milestones error:', error);
  }
}

interface ApprovalResult {
  transaction?: any;
  friendTransaction?: any;
  ledgerEntries?: any[];
  notifiedFriends: string[];
  waitingForOthers?: boolean;
}

async function generateSelfPaidExpenseLedgerEntries(
  tx: any,
  transactionId: string,
  creatorId: string,
  amount: Prisma.Decimal,
  splits: any[]
): Promise<{ ledgerEntries: Prisma.LedgerEntryCreateManyInput[]; notifiedFriends: string[] }> {
  const ledgerEntries: Prisma.LedgerEntryCreateManyInput[] = [];
  const notifiedFriends: string[] = [];

  // Budget deduction for the creator
  ledgerEntries.push({
    transactionId,
    userId: creatorId,
    friendProfileId: null,
    amountChange: amount,
    type: 'BUDGET_DEDUCTION',
  });

  for (const split of splits) {
    if (split.profileId === creatorId || split.profileId === 'self') continue;
    if (split.amount <= 0) continue;

    const friendShare = new Prisma.Decimal(split.amount);

    const friendProfile = await tx.friendProfile.findUnique({
      where: { id: split.profileId },
    });
    if (!friendProfile || friendProfile.mainUserId !== creatorId) {
      throw { statusCode: 404, message: `Friend profile ${split.profileId} not found or forbidden` };
    }

    // Creator gets RECEIVABLE
    ledgerEntries.push({
      transactionId,
      userId: creatorId,
      friendProfileId: split.profileId,
      amountChange: friendShare,
      type: 'RECEIVABLE',
    });

    // Mirror: friend owes creator
    if (friendProfile.friendUserId) {
      if (!notifiedFriends.includes(friendProfile.friendUserId)) {
        notifiedFriends.push(friendProfile.friendUserId);
      }
      let inverseFriendProfile = await tx.friendProfile.findFirst({
        where: {
          mainUserId: friendProfile.friendUserId,
          friendUserId: creatorId,
        },
      });

      if (!inverseFriendProfile) {
        const creatorUser = await tx.user.findUnique({ where: { id: creatorId } });
        inverseFriendProfile = await tx.friendProfile.create({
          data: {
            mainUserId: friendProfile.friendUserId,
            friendUserId: creatorId,
            name: creatorUser?.displayName || creatorUser?.username || 'Friend',
            isGhost: false,
          },
        });
      }

      if (inverseFriendProfile) {
        ledgerEntries.push({
          transactionId,
          userId: friendProfile.friendUserId,
          friendProfileId: inverseFriendProfile.id,
          amountChange: friendShare,
          type: 'PAYABLE',
        });
      }
    }
  }

  return { ledgerEntries, notifiedFriends };
}

export const getPendingTransactions = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;
    const pendingTransactions = await prisma.pendingTransaction.findMany({
      where: {
        payerUserId: userId,
        status: 'PENDING',
      },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const nonSelfPayerIds = pendingTransactions
      .map(tx => tx.payerId)
      .filter(id => id && id !== 'self');

    const friendProfiles = await prisma.friendProfile.findMany({
      where: { id: { in: nonSelfPayerIds } },
      select: { id: true, friendUserId: true },
    });

    const payerUserMap = new Map<string, string | null>();
    for (const fp of friendProfiles) {
      payerUserMap.set(fp.id, fp.friendUserId);
    }

    const creatorIds = Array.from(new Set(pendingTransactions.map(tx => tx.creatorId)));
    const myProfilesForCreators = await prisma.friendProfile.findMany({
      where: {
        mainUserId: { in: creatorIds },
        friendUserId: userId,
      },
      select: { id: true, mainUserId: true },
    });

    const creatorToMyProfileIdMap = new Map<string, string>();
    for (const fp of myProfilesForCreators) {
      creatorToMyProfileIdMap.set(fp.mainUserId, fp.id);
    }

    const pendingWithFlags = pendingTransactions.map(tx => {
      const actualPayerUserId = tx.payerId === 'self' ? tx.creatorId : (payerUserMap.get(tx.payerId) || null);
      const categoryRequired = actualPayerUserId === userId;

      const splits = (tx.splits as any[]) || [];
      let userShare = Number(tx.amount); // default fallback

      if (tx.creatorId === userId) {
        const mySplit = splits.find((s: any) => s.profileId === 'self' || s.profileId === userId);
        if (mySplit) {
          userShare = Number(mySplit.amount);
        }
      } else {
        const myProfileId = creatorToMyProfileIdMap.get(tx.creatorId);
        if (myProfileId) {
          const mySplit = splits.find((s: any) => s.profileId === myProfileId);
          if (mySplit) {
            userShare = Number(mySplit.amount);
          }
        }
      }

      return {
        ...tx,
        categoryRequired,
        userShare,
      };
    });

    return res.status(200).json({ pendingTransactions: pendingWithFlags });
  } catch (error) {
    console.error('Get pending transactions error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const respondToPendingTransaction = async (req: Request, res: Response) => {
  try {
    const userId: string = req.user.id;
    const { id } = req.params;
    const { action, categoryId } = req.body;

    if (!action || !['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ error: 'Action must be APPROVE or REJECT' });
    }

    const pendingTx = await prisma.pendingTransaction.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            username: true,
            displayName: true,
          },
        },
      },
    });

    if (!pendingTx) {
      return res.status(404).json({ error: 'Pending transaction not found' });
    }

    if (pendingTx.payerUserId !== userId) {
      return res.status(403).json({ error: 'Forbidden: You are not the payer of this transaction' });
    }

    if (action === 'REJECT') {
      try {
        await prisma.$transaction(async (tx) => {
          if (pendingTx.groupId) {
            await tx.$queryRaw`
              SELECT 1 FROM pending_transactions 
              WHERE group_id = ${pendingTx.groupId}::uuid 
              FOR UPDATE
            `;
          } else {
            await tx.$queryRaw`
              SELECT 1 FROM pending_transactions 
              WHERE id = ${pendingTx.id}::uuid 
              FOR UPDATE
            `;
          }

          const freshTx = await tx.pendingTransaction.findUnique({ where: { id } });
          if (!freshTx || freshTx.status !== 'PENDING') {
            throw { statusCode: 400, message: 'Pending transaction has already been resolved' };
          }

          if (pendingTx.groupId) {
            await tx.pendingTransaction.updateMany({
              where: { groupId: pendingTx.groupId },
              data: { status: 'REJECTED' },
            });
          } else {
            await tx.pendingTransaction.update({
              where: { id },
              data: { status: 'REJECTED' },
            });
          }
        });
      } catch (error: any) {
        if (error && typeof error === 'object' && 'statusCode' in error && 'message' in error) {
          return res.status(error.statusCode).json({ error: error.message });
        }
        throw error;
      }

      await createNotification({
        recipientId: pendingTx.creatorId,
        actorId: userId,
        type: 'TRANSACTION_REJECTED',
        data: {
          pendingTransactionId: pendingTx.id,
          amount: pendingTx.amount.toNumber(),
          transactionType: pendingTx.type,
        },
      });

      return res.status(200).json({ message: 'Transaction request rejected successfully.' });
    }

    let resolvedPayerUserId: string | null = null;
    let categoryRequired = false;
    if (pendingTx.payerId !== 'self') {
      const payerProfile = await prisma.friendProfile.findUnique({
        where: { id: pendingTx.payerId },
      });
      if (payerProfile) {
        resolvedPayerUserId = payerProfile.friendUserId;
        if (resolvedPayerUserId === userId) {
          categoryRequired = true;
        }
      }
    } else {
      resolvedPayerUserId = pendingTx.creatorId;
    }

    if (categoryRequired && !categoryId) {
      return res.status(400).json({ error: 'Category ID is required for approval' });
    }

    let friendCategory: any = null;

    const result: ApprovalResult = await prisma.$transaction(async (tx) => {
      if (pendingTx.groupId) {
        await tx.$queryRaw`
          SELECT 1 FROM pending_transactions 
          WHERE group_id = ${pendingTx.groupId}::uuid 
          FOR UPDATE
        `;
      } else {
        await tx.$queryRaw`
          SELECT 1 FROM pending_transactions 
          WHERE id = ${pendingTx.id}::uuid 
          FOR UPDATE
        `;
      }

      const freshTx = await tx.pendingTransaction.findUnique({ where: { id } });
      if (!freshTx || freshTx.status !== 'PENDING') {
        throw { statusCode: 400, message: 'Pending transaction has already been resolved' };
      }

      // 1. Update this pending transaction status to APPROVED (storing categoryId if provided!)
      await tx.pendingTransaction.update({
        where: { id },
        data: { 
          status: 'APPROVED',
          categoryId: categoryId || undefined,
        },
      });

      // 2. Check if others in group are pending approval
      if (pendingTx.groupId && pendingTx.type === 'EXPENSE') {
        const groupTxs = await tx.pendingTransaction.findMany({
          where: { groupId: pendingTx.groupId },
        });
        const allApproved = groupTxs.every(t => t.status === 'APPROVED');
        if (!allApproved) {
          return {
            waitingForOthers: true,
            notifiedFriends: [],
          };
        }
      }

      // Determine correct payer category for Case 2 / Settlement
      let resolvedPayerCategoryId = categoryId;
      if (pendingTx.payerId !== 'self' && resolvedPayerUserId) {
        if (resolvedPayerUserId === userId) {
          resolvedPayerCategoryId = categoryId;
        } else {
          const payerPendingTx = await tx.pendingTransaction.findFirst({
            where: {
              groupId: pendingTx.groupId,
              payerUserId: resolvedPayerUserId,
            },
          });
          resolvedPayerCategoryId = payerPendingTx?.categoryId || null;
        }
      }

      // If category is required (the current user is the payer), fetch and validate inside the transaction
      if (categoryRequired && resolvedPayerCategoryId) {
        friendCategory = await tx.category.findUnique({
          where: { id: resolvedPayerCategoryId },
        });

        if (!friendCategory || friendCategory.userId !== userId) {
          throw { statusCode: 400, message: 'Invalid category selection' };
        }
      } else if (!categoryRequired && resolvedPayerCategoryId) {
        // Fetch friend's category if they are the payer
        friendCategory = await tx.category.findUnique({
          where: { id: resolvedPayerCategoryId },
        });
      }

      // ── TYPE: SETTLEMENT Approval ───────────────────────────────────
      if (pendingTx.type === 'SETTLEMENT') {
        const settlementAmount = pendingTx.amount;
        const ledgerType = pendingTx.payerId === 'self' ? 'PAYABLE' : 'RECEIVABLE';
        const inverseLedgerType = pendingTx.payerId === 'self' ? 'RECEIVABLE' : 'PAYABLE';

        const friendProfile = await tx.friendProfile.findUnique({
          where: { id: pendingTx.friendProfileId! },
        });
        if (!friendProfile) {
          throw new Error('Friend profile not found');
        }

        let inverseFriendProfile = null;
        if (friendProfile.friendUserId) {
          inverseFriendProfile = await tx.friendProfile.findFirst({
            where: {
              mainUserId: friendProfile.friendUserId,
              friendUserId: pendingTx.creatorId,
            },
          });
        }

        // Validate creator's balance
        const currentBalanceAgg = await tx.ledgerEntry.aggregate({
          where: {
            userId: pendingTx.creatorId,
            friendProfileId: pendingTx.friendProfileId!,
            type: ledgerType,
          },
          _sum: { amountChange: true },
        });

        const currentBalance = currentBalanceAgg._sum.amountChange 
          ? new Prisma.Decimal(currentBalanceAgg._sum.amountChange.toString()) 
          : new Prisma.Decimal(0);

        if (currentBalance.lessThan(settlementAmount)) {
          throw { 
            statusCode: 400, 
            message: `Invalid settlement: Creator does not have enough ${ledgerType.toLowerCase()} balance with this friend.` 
          };
        }

        // Validate approver's balance if inverse profile exists
        if (inverseFriendProfile) {
          const approverBalanceAgg = await tx.ledgerEntry.aggregate({
            where: {
              userId: pendingTx.payerUserId,
              friendProfileId: inverseFriendProfile.id,
              type: inverseLedgerType,
            },
            _sum: { amountChange: true },
          });

          const approverBalance = approverBalanceAgg._sum.amountChange
            ? new Prisma.Decimal(approverBalanceAgg._sum.amountChange.toString())
            : new Prisma.Decimal(0);

          if (approverBalance.lessThan(settlementAmount)) {
            throw {
              statusCode: 400,
              message: `Invalid settlement: Approver does not have enough ${inverseLedgerType.toLowerCase()} balance with this friend.`
            };
          }
        }

        const transaction = await tx.transaction.create({
          data: {
            creatorId: pendingTx.creatorId,
            categoryId: pendingTx.categoryId || null,
            totalAmount: pendingTx.amount,
            type: 'SETTLEMENT',
          },
        });

        const entriesToCreate: Prisma.LedgerEntryCreateManyInput[] = [
          {
            transactionId: transaction.id,
            userId: pendingTx.creatorId,
            friendProfileId: pendingTx.friendProfileId!,
            amountChange: settlementAmount.neg(),
            type: ledgerType,
          }
        ];

        if (inverseFriendProfile) {
          entriesToCreate.push({
            transactionId: transaction.id,
            userId: friendProfile.friendUserId!,
            friendProfileId: inverseFriendProfile.id,
            amountChange: settlementAmount.neg(),
            type: inverseLedgerType,
          });
        }

        // Creator budget impact
        if (pendingTx.categoryId) {
          if (pendingTx.payerId === 'self') {
            entriesToCreate.push({
              transactionId: transaction.id,
              userId: pendingTx.creatorId,
              friendProfileId: null,
              amountChange: settlementAmount,
              type: 'BUDGET_DEDUCTION',
            });
          } else {
            entriesToCreate.push({
              transactionId: transaction.id,
              userId: pendingTx.creatorId,
              friendProfileId: null,
              amountChange: settlementAmount.neg(),
              type: 'BUDGET_DEDUCTION',
            });
          }
        }

        // Approver budget impact (if B is payer and selected category)
        if (pendingTx.payerId !== 'self' && resolvedPayerCategoryId && resolvedPayerUserId) {
          const approverCategory = await tx.category.findUnique({
            where: { id: resolvedPayerCategoryId },
          });
          if (approverCategory && approverCategory.userId === resolvedPayerUserId) {
            const friendSettleTx = await tx.transaction.create({
              data: {
                creatorId: resolvedPayerUserId,
                categoryId: approverCategory.id,
                totalAmount: pendingTx.amount,
                type: 'SETTLEMENT',
              },
            });

            entriesToCreate.push({
              transactionId: friendSettleTx.id,
              userId: resolvedPayerUserId,
              friendProfileId: null,
              amountChange: settlementAmount,
              type: 'BUDGET_DEDUCTION',
            });
          }
        }

        // Auto-refund for budget
        if (friendProfile.friendUserId && inverseFriendProfile) {
          const receiverId = pendingTx.payerId === 'self'
            ? friendProfile.friendUserId
            : null;

          if (receiverId) {
            const originalEntry = await tx.ledgerEntry.findFirst({
              where: {
                userId: receiverId,
                friendProfileId: inverseFriendProfile.id,
                type: 'RECEIVABLE',
                amountChange: { gt: 0 },
                transaction: {
                  type: 'EXPENSE',
                  categoryId: { not: null },
                },
              },
              include: {
                transaction: { select: { categoryId: true } },
              },
              orderBy: { transaction: { createdAt: 'desc' } },
            });

            if (originalEntry?.transaction.categoryId) {
              const refundTx = await tx.transaction.create({
                data: {
                  creatorId: receiverId,
                  categoryId: originalEntry.transaction.categoryId,
                  totalAmount: pendingTx.amount,
                  type: 'SETTLEMENT',
                },
              });

              await tx.ledgerEntry.create({
                data: {
                  transactionId: refundTx.id,
                  userId: receiverId,
                  friendProfileId: null,
                  amountChange: settlementAmount.neg(),
                  type: 'BUDGET_DEDUCTION',
                },
              });
            }
          }
        }

        await tx.ledgerEntry.createMany({ data: entriesToCreate });

        const createdEntries = await tx.ledgerEntry.findMany({
          where: { transactionId: transaction.id },
        });

        return {
          transaction,
          ledgerEntries: createdEntries,
          notifiedFriends: [],
        };
      }

      // ── TYPE: EXPENSE Approval ──────────────────────────────────────
      // Case 1: Approver is NOT the payer (A paid, B splits)
      if (pendingTx.payerId === 'self') {
        const transaction = await tx.transaction.create({
          data: {
            creatorId: pendingTx.creatorId,
            categoryId: pendingTx.categoryId,
            totalAmount: pendingTx.amount,
            type: 'EXPENSE',
          },
        });

        const helperResult = await generateSelfPaidExpenseLedgerEntries(
          tx,
          transaction.id,
          pendingTx.creatorId,
          pendingTx.amount,
          pendingTx.splits as any[]
        );

        if (helperResult.ledgerEntries.length > 0) {
          await tx.ledgerEntry.createMany({ data: helperResult.ledgerEntries });
        }

        const createdEntries = await tx.ledgerEntry.findMany({
          where: { transactionId: transaction.id },
        });

        return {
          transaction,
          ledgerEntries: createdEntries,
          notifiedFriends: helperResult.notifiedFriends,
        };
      }

      // Case 2: Approver IS the payer (B paid, A created)
      const payerId = pendingTx.payerId;
      const payerProfile = await tx.friendProfile.findUnique({
        where: { id: payerId },
      });
      if (!payerProfile || !payerProfile.friendUserId) {
        throw new Error('Payer profile or registered payer user not found');
      }
      const actualPayerUserId = payerProfile.friendUserId;

      const transaction = await tx.transaction.create({
        data: {
          creatorId: pendingTx.creatorId,
          categoryId: pendingTx.categoryId,
          totalAmount: pendingTx.amount,
          type: 'EXPENSE',
        },
      });

      const friendTransaction = await tx.transaction.create({
        data: {
          creatorId: actualPayerUserId,
          categoryId: friendCategory.id,
          totalAmount: pendingTx.amount,
          type: 'EXPENSE',
        },
      });

      const friendBudgetEntry = await tx.ledgerEntry.create({
        data: {
          transactionId: friendTransaction.id,
          userId: actualPayerUserId,
          friendProfileId: null,
          amountChange: pendingTx.amount,
          type: 'BUDGET_DEDUCTION',
        },
      });

      const splits = pendingTx.splits as any[];
      const ledgerEntries: Prisma.LedgerEntryCreateManyInput[] = [];
      const notifiedFriends: string[] = [];

      const creatorId = pendingTx.creatorId;

      for (const split of splits) {
        if (split.amount <= 0) continue;
        if (split.profileId === payerId) continue;

        const splitAmount = new Prisma.Decimal(split.amount);

        if (split.profileId === creatorId || split.profileId === 'self') {
          ledgerEntries.push({
            transactionId: transaction.id,
            userId: creatorId,
            friendProfileId: payerId,
            amountChange: splitAmount,
            type: 'PAYABLE',
          });

          if (!notifiedFriends.includes(actualPayerUserId)) {
            notifiedFriends.push(actualPayerUserId);
          }

          let bProfileForA = await tx.friendProfile.findFirst({
            where: { mainUserId: actualPayerUserId, friendUserId: creatorId },
          });
          if (!bProfileForA) {
            const creatorUser = await tx.user.findUnique({ where: { id: creatorId } });
            bProfileForA = await tx.friendProfile.create({
              data: {
                mainUserId: actualPayerUserId,
                friendUserId: creatorId,
                name: creatorUser?.displayName || creatorUser?.username || 'Friend',
                isGhost: false,
              },
            });
          }

          if (bProfileForA) {
            ledgerEntries.push({
              transactionId: friendTransaction.id,
              userId: actualPayerUserId,
              friendProfileId: bProfileForA.id,
              amountChange: splitAmount,
              type: 'RECEIVABLE',
            });
          }
        } else {
          const splitProfile = await tx.friendProfile.findUnique({
            where: { id: split.profileId },
          });
          if (!splitProfile) continue;

          const cUserId = splitProfile.friendUserId;

          if (cUserId) {
            let bProfileForC = await tx.friendProfile.findFirst({
              where: { mainUserId: actualPayerUserId, friendUserId: cUserId },
            });
            if (!bProfileForC) {
              bProfileForC = await tx.friendProfile.create({
                data: {
                  mainUserId: actualPayerUserId,
                  friendUserId: cUserId,
                  name: splitProfile.name,
                  isGhost: false,
                },
              });
            }

            let cProfileForB = await tx.friendProfile.findFirst({
              where: { mainUserId: cUserId, friendUserId: actualPayerUserId },
            });
            if (!cProfileForB) {
              cProfileForB = await tx.friendProfile.create({
                data: {
                  mainUserId: cUserId,
                  friendUserId: actualPayerUserId,
                  name: payerProfile.name,
                  isGhost: false,
                },
              });
            }

            if (bProfileForC && cProfileForB) {
              ledgerEntries.push({
                transactionId: friendTransaction.id,
                userId: actualPayerUserId,
                friendProfileId: bProfileForC.id,
                amountChange: splitAmount,
                type: 'RECEIVABLE',
              });

              ledgerEntries.push({
                transactionId: transaction.id,
                userId: cUserId,
                friendProfileId: cProfileForB.id,
                amountChange: splitAmount,
                type: 'PAYABLE',
              });

              if (!notifiedFriends.includes(actualPayerUserId)) notifiedFriends.push(actualPayerUserId);
              if (!notifiedFriends.includes(cUserId)) notifiedFriends.push(cUserId);
            }
          } else {
            ledgerEntries.push({
              transactionId: transaction.id,
              userId: creatorId,
              friendProfileId: payerId,
              amountChange: splitAmount,
              type: 'PAYABLE',
            });

            let bProfileForA = await tx.friendProfile.findFirst({
              where: { mainUserId: actualPayerUserId, friendUserId: creatorId },
            });
            if (!bProfileForA) {
              const creatorUser = await tx.user.findUnique({ where: { id: creatorId } });
              bProfileForA = await tx.friendProfile.create({
                data: {
                  mainUserId: actualPayerUserId,
                  friendUserId: creatorId,
                  name: creatorUser?.displayName || creatorUser?.username || 'Friend',
                  isGhost: false,
                },
              });
            }

            if (bProfileForA) {
              ledgerEntries.push({
                transactionId: friendTransaction.id,
                userId: actualPayerUserId,
                friendProfileId: bProfileForA.id,
                amountChange: splitAmount,
                type: 'RECEIVABLE',
              });
              if (!notifiedFriends.includes(actualPayerUserId)) notifiedFriends.push(actualPayerUserId);
            }

            ledgerEntries.push({
              transactionId: transaction.id,
              userId: creatorId,
              friendProfileId: split.profileId,
              amountChange: splitAmount,
              type: 'RECEIVABLE',
            });
          }
        }
      }

      if (ledgerEntries.length > 0) {
        await tx.ledgerEntry.createMany({ data: ledgerEntries });
      }

      const createdEntries = await tx.ledgerEntry.findMany({
        where: {
          OR: [
            { transactionId: transaction.id },
            { transactionId: friendTransaction.id },
          ],
        },
      });

      return {
        transaction,
        friendTransaction,
        ledgerEntries: createdEntries,
        notifiedFriends,
      };
    });

    if (result.waitingForOthers) {
      await createNotification({
        recipientId: pendingTx.creatorId,
        actorId: userId,
        type: 'TRANSACTION_APPROVED',
        data: {
          pendingTransactionId: pendingTx.id,
          amount: pendingTx.amount.toNumber(),
        },
      });

      return res.status(200).json({
        message: 'Approval recorded. Waiting for other friends to approve.',
        status: 'WAITING_FOR_OTHERS',
      });
    }

    for (const friendUserId of result.notifiedFriends) {
      if (friendUserId !== resolvedPayerUserId) {
        await createNotification({
          recipientId: friendUserId,
          actorId: pendingTx.creatorId,
          type: 'ADDED_TO_SPLIT',
          data: { transactionId: result.transaction.id, amount: pendingTx.amount.toNumber() },
        });
      }
    }

    await createNotification({
      recipientId: pendingTx.creatorId,
      actorId: userId,
      type: 'TRANSACTION_APPROVED',
      data: {
        pendingTransactionId: pendingTx.id,
        amount: pendingTx.amount.toNumber(),
      },
    });

    if (pendingTx.type === 'SETTLEMENT') {
      await feedService.generateSettlementPost(
        result.transaction.id,
        pendingTx.message || undefined,
        pendingTx.isPrivate,
        pendingTx.allowFriendToPrivate
      );
    } else {
      const txSplits = (pendingTx.splits as any) || [];
      const involvedFriendIds = txSplits
        .filter((s: any) => s.profileId !== 'self' && s.profileId !== pendingTx.creatorId)
        .map((s: any) => s.profileId);
      if (pendingTx.payerId !== 'self' && pendingTx.payerId !== pendingTx.creatorId && !involvedFriendIds.includes(pendingTx.payerId)) {
        involvedFriendIds.push(pendingTx.payerId);
      }
      const uniqueInvolvedFriendIds: string[] = Array.from(new Set(involvedFriendIds)) as string[];

      const existingPost = await prisma.feedPost.findFirst({
        where: {
          userId: pendingTx.creatorId,
          type: 'EXPENSE_ADDED',
          content: { contains: `"transactionId":"${result.transaction.id}"` },
        },
      });

      if (!existingPost) {
        await feedService.generateExpensePost(
          result.transaction.id,
          pendingTx.message || undefined,
          pendingTx.isPrivate,
          pendingTx.allowFriendToPrivate,
          uniqueInvolvedFriendIds
        );
      }

      if (pendingTx.payerId === 'self') {
        if (pendingTx.categoryId) {
          await checkBudgetMilestones(pendingTx.creatorId, pendingTx.categoryId, pendingTx.amount.toNumber()).catch(console.error);
        }
      } else {
        if (friendCategory) {
          await checkBudgetMilestones(resolvedPayerUserId!, friendCategory.id, pendingTx.amount.toNumber()).catch(console.error);
        }
      }
    }

    const gamificationUsers = new Set<string>();
    if (pendingTx.creatorId) gamificationUsers.add(pendingTx.creatorId);
    if (resolvedPayerUserId) gamificationUsers.add(resolvedPayerUserId);
    const notifiedFriends = (result.notifiedFriends as string[]) || [];
    for (const friendId of notifiedFriends) {
      if (friendId) {
        gamificationUsers.add(friendId);
      }
    }

    for (const uid of gamificationUsers) {
      gamificationService.triggerGamificationUpdates(uid).catch(console.error);
    }

    return res.status(200).json({
      message: 'Transaction approved and recorded successfully.',
      transaction: result.transaction,
      friendTransaction: result.friendTransaction || null,
      ledgerEntries: result.ledgerEntries,
    });
  } catch (error: any) {
    console.error('Respond to pending transaction error:', error);
    if (error && typeof error === 'object' && 'statusCode' in error && 'message' in error) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
};
