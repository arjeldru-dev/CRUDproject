import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { Prisma } from '@prisma/client';
import { feedService } from '../services/feedService';
import { createNotification } from '../services/notificationService';
import { generateSpendingForecast } from '../services/forecastingService';
import { gamificationService, getLocalDateParts, getUtcDateOfLocalTime } from '../services/gamificationService';

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
    console.log('createExpenseTransaction req.body:', req.body);
    const { amount, categoryId, payerId, splits, message, isPrivate, allowFriendToPrivate } = req.body;
    const userId: string = req.user.id;

    // ── Input Validation ──────────────────────────────────────────────
    if (amount === undefined || !categoryId || !payerId || !splits || !Array.isArray(splits)) {
      return res.status(400).json({
        error: 'All fields are required: amount, categoryId, payerId, splits array',
      });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    // Verify sum of splits matches amount (allow small floating point difference)
    const splitSum = splits.reduce((acc, split) => acc + (split.amount || 0), 0);
    if (Math.abs(splitSum - amount) > 0.05) {
      return res.status(400).json({ error: 'Sum of splits must equal total amount' });
    }

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

    if (payerUserId && payerUserId !== userId) {
      const pendingTx = await prisma.pendingTransaction.create({
        data: {
          creatorId: userId,
          payerId,
          payerUserId,
          categoryId,
          amount: new Prisma.Decimal(amount),
          splits: splits as any,
          message: message || null,
          isPrivate: isPrivate || false,
          allowFriendToPrivate: allowFriendToPrivate || true,
        },
      });

      await createNotification({
        recipientId: payerUserId,
        actorId: userId,
        type: 'TRANSACTION_APPROVAL_REQUEST',
        data: {
          pendingTransactionId: pendingTx.id,
          amount,
        },
      });

      return res.status(202).json({
        status: 'PENDING_APPROVAL',
        message: 'Transaction sent to the payer for approval.',
        pendingTransaction: pendingTx,
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
        // User paid the full amount: Budget deduction for the FULL amount
        // (cash left the user's pocket, so the budget drops by the total)
        ledgerEntries.push({
          transactionId: transaction.id,
          userId,
          friendProfileId: null,
          amountChange: totalDecimal,
          type: 'BUDGET_DEDUCTION',
        });

        // Each friend in splits owes the user
        for (const split of splits) {
          if (split.profileId === userId || split.profileId === 'self') continue;
          if (split.amount <= 0) continue;

          const friendShare = new Prisma.Decimal(split.amount);

          // Verify friend profile
          const friendProfile = await tx.friendProfile.findUnique({
            where: { id: split.profileId },
          });
          if (!friendProfile || friendProfile.mainUserId !== userId) {
            throw { statusCode: 404, message: `Friend profile ${split.profileId} not found or forbidden` };
          }

          // User gets RECEIVABLE
          ledgerEntries.push({
            transactionId: transaction.id,
            userId,
            friendProfileId: split.profileId,
            amountChange: friendShare,
            type: 'RECEIVABLE',
          });

          // Mirror: friend owes user
          if (friendProfile.friendUserId) {
            if (!notifiedFriends.includes(friendProfile.friendUserId)) {
               notifiedFriends.push(friendProfile.friendUserId);
            }
            let inverseFriendProfile = await tx.friendProfile.findFirst({
              where: {
                mainUserId: friendProfile.friendUserId,
                friendUserId: userId,
              },
            });

            if (!inverseFriendProfile) {
               const currentUser = await tx.user.findUnique({ where: { id: userId } });
               inverseFriendProfile = await tx.friendProfile.create({
                 data: {
                   mainUserId: friendProfile.friendUserId,
                   friendUserId: userId,
                   name: currentUser?.displayName || currentUser?.username || 'Friend',
                   isGhost: false,
                 }
               });
            }

            if (inverseFriendProfile) {
              ledgerEntries.push({
                transactionId: transaction.id,
                userId: friendProfile.friendUserId,
                friendProfileId: inverseFriendProfile.id,
                amountChange: friendShare,
                type: 'PAYABLE',
              });
            }
          }
        }
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
                  monthlyLimit: targetCategory.monthlyLimit,
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
    if (!result.ledgerEntries.find(le => le.type === 'BUDGET_DEDUCTION' && le.amountChange.toNumber() === amount) && payerId !== 'self' && payerId !== userId && !involvedFriendIds.includes(payerId)) {
      involvedFriendIds.push(payerId);
    }
    
    // Convert to unique set
    const uniqueInvolvedFriendIds = Array.from(new Set(involvedFriendIds));

    // Call generateExpensePost with additional friends array
    feedService.generateExpensePost(result.transaction.id, message, isPrivate, allowFriendToPrivate, uniqueInvolvedFriendIds);

    // Check for budget milestones
    const budgetEntry = result.ledgerEntries.find(le => le.type === 'BUDGET_DEDUCTION');
    const budgetDeductionAmount = budgetEntry ? Number(budgetEntry.amountChange) : 0;
    if (budgetDeductionAmount > 0) {
      checkBudgetMilestones(userId, categoryId, budgetDeductionAmount);
    }

    if (result.friendBudgetEntry && result.friendCategory) {
      const friendDeductionAmount = Number(result.friendBudgetEntry.amountChange);
      if (friendDeductionAmount > 0) {
        checkBudgetMilestones(result.payerUserId!, result.friendCategory.id, friendDeductionAmount);
      }
    }

    // Fire-and-forget gamification evaluation
    gamificationService.updateStreak(userId).catch(console.error);
    gamificationService.evaluateAndAwardBadges(userId).catch(console.error);
    gamificationService.evaluateChallenges(userId).catch(console.error);

    if (result.payerUserId) {
      gamificationService.updateStreak(result.payerUserId).catch(console.error);
      gamificationService.evaluateAndAwardBadges(result.payerUserId).catch(console.error);
      gamificationService.evaluateChallenges(result.payerUserId).catch(console.error);
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

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

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
    feedService.generateSettlementPost(result.transaction.id, message, isPrivate, allowFriendToPrivate);

    // Fire-and-forget gamification evaluation
    gamificationService.updateStreak(userId).catch(console.error);
    gamificationService.evaluateAndAwardBadges(userId).catch(console.error);
    gamificationService.evaluateChallenges(userId).catch(console.error);

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

    // Get client timezone parameters if provided, fallback to server time
    const reqMonthStart = req.query.monthStart as string;
    const reqMonthEnd = req.query.monthEnd as string;
    const reqNow = req.query.now as string;
    const reqDaysInMonth = req.query.daysInMonth as string;

    const parseDateSafe = (dateStr: string | undefined, fallback: Date) => {
      if (!dateStr) return fallback;
      const parsed = new Date(dateStr);
      return isNaN(parsed.getTime()) ? fallback : parsed;
    };

    const now = parseDateSafe(reqNow, new Date());
    const monthStart = parseDateSafe(reqMonthStart, new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = parseDateSafe(reqMonthEnd, new Date(now.getFullYear(), now.getMonth() + 1, 1));

    // Forecasting metrics: Calculate whole days elapsed to prevent the projection from changing every minute
    const timeElapsedMs = now.getTime() - monthStart.getTime();
    
    // Floor to get completed 24-hour periods, add 1 to represent the current day
    const currentDay = Math.floor(timeElapsedMs / (1000 * 60 * 60 * 24)) + 1;
    
    const daysInMonthSafe = reqDaysInMonth && !isNaN(parseInt(reqDaysInMonth, 10)) 
      ? parseInt(reqDaysInMonth, 10) 
      : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    // Clamp to at least 1 to prevent division by zero or infinite spikes on day 1
    const daysElapsed = Math.max(1, currentDay); 
    const daysRemaining = Math.max(0, daysInMonthSafe - currentDay);

    // Fetch all deductions for the month in one query to avoid N+1 queries
    const allDeductions = await prisma.ledgerEntry.findMany({
      where: {
        userId,
        type: 'BUDGET_DEDUCTION',
        transaction: {
          createdAt: {
            gte: monthStart,
            lt: monthEnd,
          },
        },
      },
      include: {
        transaction: {
          select: { categoryId: true },
        },
      },
    });

    // Group spent amounts by categoryId in memory
    const spentByCategory = allDeductions.reduce((acc, entry) => {
      const catId = entry.transaction?.categoryId;
      if (catId) {
        acc[catId] = (acc[catId] || 0) + new Prisma.Decimal(entry.amountChange.toString()).toNumber();
      }
      return acc;
    }, {} as Record<string, number>);

    // Map categories synchronously
    const budgetStatuses = categories.map((category) => {
        const spent = spentByCategory[category.id] || 0;
        const monthlyLimit = new Prisma.Decimal(category.monthlyLimit.toString()).toNumber();
        const remaining = monthlyLimit - spent;

        // --- Heuristic Spending Forecasting Engine ---
        const forecast = generateSpendingForecast({
          spent,
          monthlyLimit,
          daysElapsed,
          daysRemaining,
          categoryName: category.name,
        });

        return {
          categoryId: category.id,
          categoryName: category.name,
          monthlyLimit,
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

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

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
    gamificationService.updateStreak(userId).catch(console.error);
    gamificationService.evaluateAndAwardBadges(userId).catch(console.error);
    gamificationService.evaluateChallenges(userId).catch(console.error);

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
      select: { monthlyLimit: true },
    });

    if (!category) return;

    const gamification = await prisma.userGamification.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    const timezone = gamification?.timezone || 'UTC';

    const now = new Date();
    const parts = getLocalDateParts(now, timezone);
    const monthStart = getUtcDateOfLocalTime(parts.year, parts.month, 1, 0, 0, 0, timezone);
    const nextMonthYear = parts.month === 12 ? parts.year + 1 : parts.year;
    const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
    const monthEnd = getUtcDateOfLocalTime(nextMonthYear, nextMonth, 1, 0, 0, 0, timezone);

    const deductions = await prisma.ledgerEntry.aggregate({
      where: {
        userId,
        type: 'BUDGET_DEDUCTION',
        transaction: {
          categoryId,
          createdAt: {
            gte: monthStart,
            lt: monthEnd,
          },
        },
      },
      _sum: { amountChange: true },
    });

    const currentSpent = deductions._sum.amountChange
      ? new Prisma.Decimal(deductions._sum.amountChange.toString()).toNumber()
      : 0;
    const limit = category.monthlyLimit.toNumber();

    if (limit <= 0) return;

    const previousSpent = currentSpent - currentTransactionAmount;
    const currentPercentage = (currentSpent / limit) * 100;
    const previousPercentage = (previousSpent / limit) * 100;

    if (previousPercentage < 100 && currentPercentage >= 100) {
      feedService.generateBudgetMilestonePost(userId, categoryId, 100);
    } else if (previousPercentage < 50 && currentPercentage >= 50) {
      feedService.generateBudgetMilestonePost(userId, categoryId, 50);
    }
  } catch (error) {
    console.error('Check budget milestones error:', error);
  }
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

    return res.status(200).json({ pendingTransactions });
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

    if (pendingTx.status !== 'PENDING') {
      return res.status(400).json({ error: 'Pending transaction has already been resolved' });
    }

    if (action === 'REJECT') {
      await prisma.pendingTransaction.update({
        where: { id },
        data: { status: 'REJECTED' },
      });

      await createNotification({
        recipientId: pendingTx.creatorId,
        actorId: userId,
        type: 'BALANCE_CHANGED',
        data: {
          message: 'rejected your transaction request',
        },
      });

      return res.status(200).json({ message: 'Transaction request rejected successfully.' });
    }

    if (!categoryId) {
      return res.status(400).json({ error: 'Category ID is required for approval' });
    }

    const friendCategory = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!friendCategory || friendCategory.userId !== userId) {
      return res.status(400).json({ error: 'Invalid category selection' });
    }

    const result = await prisma.$transaction(async (tx) => {
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
          creatorId: pendingTx.payerUserId,
          categoryId: friendCategory.id,
          totalAmount: pendingTx.amount,
          type: 'EXPENSE',
        },
      });

      const friendBudgetEntry = await tx.ledgerEntry.create({
        data: {
          transactionId: friendTransaction.id,
          userId: pendingTx.payerUserId,
          friendProfileId: null,
          amountChange: pendingTx.amount,
          type: 'BUDGET_DEDUCTION',
        },
      });

      const splits = pendingTx.splits as any[];
      const ledgerEntries: Prisma.LedgerEntryCreateManyInput[] = [];
      const notifiedFriends: string[] = [];

      const creatorId = pendingTx.creatorId;
      const payerId = pendingTx.payerId;

      const payerProfile = await tx.friendProfile.findUnique({
        where: { id: payerId },
      });
      if (!payerProfile) {
        throw new Error('Payer profile not found');
      }

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

          if (!notifiedFriends.includes(pendingTx.payerUserId)) {
            notifiedFriends.push(pendingTx.payerUserId);
          }

          let bProfileForA = await tx.friendProfile.findFirst({
            where: { mainUserId: pendingTx.payerUserId, friendUserId: creatorId },
          });
          if (!bProfileForA) {
            const creatorUser = await tx.user.findUnique({ where: { id: creatorId } });
            bProfileForA = await tx.friendProfile.create({
              data: {
                mainUserId: pendingTx.payerUserId,
                friendUserId: creatorId,
                name: creatorUser?.displayName || creatorUser?.username || 'Friend',
                isGhost: false,
              },
            });
          }

          if (bProfileForA) {
            ledgerEntries.push({
              transactionId: friendTransaction.id,
              userId: pendingTx.payerUserId,
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
              where: { mainUserId: pendingTx.payerUserId, friendUserId: cUserId },
            });
            if (!bProfileForC) {
              bProfileForC = await tx.friendProfile.create({
                data: {
                  mainUserId: pendingTx.payerUserId,
                  friendUserId: cUserId,
                  name: splitProfile.name,
                  isGhost: false,
                },
              });
            }

            let cProfileForB = await tx.friendProfile.findFirst({
              where: { mainUserId: cUserId, friendUserId: pendingTx.payerUserId },
            });
            if (!cProfileForB) {
              cProfileForB = await tx.friendProfile.create({
                data: {
                  mainUserId: cUserId,
                  friendUserId: pendingTx.payerUserId,
                  name: payerProfile.name,
                  isGhost: false,
                },
              });
            }

            if (bProfileForC && cProfileForB) {
              ledgerEntries.push({
                transactionId: friendTransaction.id,
                userId: pendingTx.payerUserId,
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

              if (!notifiedFriends.includes(pendingTx.payerUserId)) notifiedFriends.push(pendingTx.payerUserId);
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
              where: { mainUserId: pendingTx.payerUserId, friendUserId: creatorId },
            });
            if (!bProfileForA) {
              const creatorUser = await tx.user.findUnique({ where: { id: creatorId } });
              bProfileForA = await tx.friendProfile.create({
                data: {
                  mainUserId: pendingTx.payerUserId,
                  friendUserId: creatorId,
                  name: creatorUser?.displayName || creatorUser?.username || 'Friend',
                  isGhost: false,
                },
              });
            }

            if (bProfileForA) {
              ledgerEntries.push({
                transactionId: friendTransaction.id,
                userId: pendingTx.payerUserId,
                friendProfileId: bProfileForA.id,
                amountChange: splitAmount,
                type: 'RECEIVABLE',
              });
              if (!notifiedFriends.includes(pendingTx.payerUserId)) notifiedFriends.push(pendingTx.payerUserId);
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

      await tx.pendingTransaction.update({
        where: { id },
        data: { status: 'APPROVED' },
      });

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

    for (const friendUserId of result.notifiedFriends) {
      if (friendUserId !== pendingTx.payerUserId) {
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

    const txSplits = (pendingTx.splits as any) || [];
    const involvedFriendIds = txSplits
      .filter((s: any) => s.profileId !== 'self' && s.profileId !== pendingTx.creatorId)
      .map((s: any) => s.profileId);
    if (!involvedFriendIds.includes(pendingTx.payerId)) {
      involvedFriendIds.push(pendingTx.payerId);
    }
    const uniqueInvolvedFriendIds: string[] = Array.from(new Set(involvedFriendIds)) as string[];

    feedService.generateExpensePost(
      result.transaction.id,
      pendingTx.message || undefined,
      pendingTx.isPrivate,
      pendingTx.allowFriendToPrivate,
      uniqueInvolvedFriendIds
    );

    const friendDeductionAmount = pendingTx.amount.toNumber();
    await checkBudgetMilestones(pendingTx.payerUserId, friendCategory.id, friendDeductionAmount);

    gamificationService.updateStreak(pendingTx.creatorId).catch(console.error);
    gamificationService.evaluateAndAwardBadges(pendingTx.creatorId).catch(console.error);
    gamificationService.evaluateChallenges(pendingTx.creatorId).catch(console.error);

    gamificationService.updateStreak(pendingTx.payerUserId).catch(console.error);
    gamificationService.evaluateAndAwardBadges(pendingTx.payerUserId).catch(console.error);
    gamificationService.evaluateChallenges(pendingTx.payerUserId).catch(console.error);

    const notifiedFriends = (result.notifiedFriends as string[]) || [];
    for (const friendId of notifiedFriends) {
      if (friendId !== pendingTx.creatorId && friendId !== pendingTx.payerUserId) {
        gamificationService.updateStreak(friendId).catch(console.error);
        gamificationService.evaluateAndAwardBadges(friendId).catch(console.error);
        gamificationService.evaluateChallenges(friendId).catch(console.error);
      }
    }

    return res.status(200).json({
      message: 'Transaction approved and recorded successfully.',
      transaction: result.transaction,
      friendTransaction: result.friendTransaction,
      ledgerEntries: result.ledgerEntries,
    });
  } catch (error: any) {
    console.error('Respond to pending transaction error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
