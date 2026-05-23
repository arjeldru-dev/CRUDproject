import { prisma } from '../config/db';
import { Prisma, UserGamification, UserBadge, Badge, BadgeRarity } from '@prisma/client';
import { feedService } from './feedService';
import { createNotification } from './notificationService';

export interface GamificationProfileDTO {
  profile: {
    currentStreak: number;
    longestStreak: number;
    totalPoints: number;
    lastStreakDate: Date | null;
    activeFrame: {
      id: string;
      slug: string;
      name: string;
      cssClass: string;
    } | null;
  };
  badges: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    iconUrl: string;
    rarity: BadgeRarity;
    unlockedAt: Date;
  }>;
  allBadges: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    iconUrl: string;
    rarity: BadgeRarity;
    pointsAwarded: number;
    unlocked: boolean;
    unlockedAt: Date | null;
  }>;
  availableFrames: Array<{
    id: string;
    slug: string;
    name: string;
    cssClass: string;
    pointsRequired: number;
    unlocked: boolean;
    isActive: boolean;
  }>;
}

export interface LeaderboardEntryDTO {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  activeFrame: {
    cssClass: string;
  } | null;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  badgeCount: number;
  isCurrentUser: boolean;
  rank: number;
}


export function getLocalDateParts(date: Date, tz?: string) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const partMap = new Map(parts.map(p => [p.type, p.value]));
    return {
      year: parseInt(partMap.get('year')!, 10),
      month: parseInt(partMap.get('month')!, 10),
      day: parseInt(partMap.get('day')!, 10),
      hour: parseInt(partMap.get('hour')!, 10),
      minute: parseInt(partMap.get('minute')!, 10),
      second: parseInt(partMap.get('second')!, 10)
    };
  } catch (e) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds()
    };
  }
}

export function getUtcDateOfLocalTime(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, tz = 'UTC') {
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(candidate);
    const partMap = new Map(parts.map(p => [p.type, p.value]));
    
    const formattedYear = parseInt(partMap.get('year')!, 10);
    const formattedMonth = parseInt(partMap.get('month')!, 10);
    const formattedDay = parseInt(partMap.get('day')!, 10);
    const formattedHour = parseInt(partMap.get('hour')!, 10);
    const formattedMinute = parseInt(partMap.get('minute')!, 10);
    const formattedSecond = parseInt(partMap.get('second')!, 10);

    const formattedUtc = Date.UTC(formattedYear, formattedMonth - 1, formattedDay, formattedHour, formattedMinute, formattedSecond);
    const offset = candidate.getTime() - formattedUtc;
    return new Date(candidate.getTime() + offset);
  } catch (e) {
    return candidate;
  }
}

export function getLocalDateStr(date: Date, tz?: string) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  } catch (e) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  }
}


export const gamificationService = {
  /**
   * Ensure UserGamification row exists (upsert on first access)
   */
  async ensureGamificationProfile(userId: string): Promise<UserGamification> {
    return await prisma.userGamification.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        currentStreak: 0,
        longestStreak: 0,
        totalPoints: 0,
        activeFrameId: null,
        timezone: 'UTC',
      },
    });
  },

  /**
   * Update the user's stored timezone if it changed
   */
  async updateUserTimezone(userId: string, timezone: string): Promise<void> {
    try {
      const gamification = await this.ensureGamificationProfile(userId);
      if (gamification.timezone !== timezone) {
        await prisma.userGamification.update({
          where: { userId },
          data: { timezone },
        });
      }
    } catch (error) {
      console.error(`Failed to update timezone for user ${userId}:`, error);
    }
  },

  /**
   * Called after every expense/settlement/topup — checks all badge conditions
   */
  async evaluateAndAwardBadges(userId: string): Promise<UserBadge[]> {
    try {
      const gamification = await this.ensureGamificationProfile(userId);
      
      // Get all earned badge IDs
      const earnedBadges = await prisma.userBadge.findMany({
        where: { userId },
        select: { badgeId: true },
      });
      const earnedBadgeIds = new Set(earnedBadges.map((eb) => eb.badgeId));

      // Get all badges in the database
      const allBadges = await prisma.badge.findMany();
      const unearnedBadges = allBadges.filter((b) => !earnedBadgeIds.has(b.id));

      if (unearnedBadges.length === 0) {
        return [];
      }

      const awardedUserBadges: UserBadge[] = [];

      // Pre-fetch all simple counts and lists in a single batch to avoid N+1 queries
      const [
        expenseCount,
        settlementCount,
        topupCount,
        friendCount,
        challengeCreateCount,
        completedParticipations,
      ] = await Promise.all([
        prisma.transaction.count({ where: { creatorId: userId, type: 'EXPENSE' } }),
        prisma.transaction.count({ where: { creatorId: userId, type: 'SETTLEMENT' } }),
        prisma.transaction.count({ where: { creatorId: userId, type: 'TOP_UP' } }),
        prisma.friendship.count({
          where: {
            OR: [
              { userAId: userId },
              { userBId: userId },
            ],
          },
        }),
        prisma.challenge.count({ where: { creatorId: userId } }),
        prisma.challengeParticipant.findMany({
          where: {
            userId,
            completedAt: { not: null },
            failedAt: null,
          },
          include: {
            challenge: {
              include: {
                participants: true,
              },
            },
          },
        }),
      ]);

      for (const badge of unearnedBadges) {
        let requirementMet = false;
        try {
          const req = JSON.parse(badge.requirement);
          
          switch (req.type) {
            case 'expense_count': {
              requirementMet = expenseCount >= req.value;
              break;
            }
            case 'settlement_count': {
              requirementMet = settlementCount >= req.value;
              break;
            }
            case 'topup_count': {
              requirementMet = topupCount >= req.value;
              break;
            }
            case 'streak': {
              // Note: Using longestStreak instead of currentStreak to reward the user's highest historical achievement.
              // This is a forgiving, user-friendly gamification choice where earned badges are not lost upon streak reset.
              requirementMet = gamification.longestStreak >= req.value;
              break;
            }
            case 'friend_count': {
              requirementMet = friendCount >= req.value;
              break;
            }
            case 'challenge_complete_count': {
              requirementMet = completedParticipations.length >= req.value;
              break;
            }
            case 'challenge_create_count': {
              requirementMet = challengeCreateCount >= req.value;
              break;
            }
            case 'challenge_type_complete': {
              const typeCount = completedParticipations.filter(
                (p) => p.challenge.type === req.type_value
              ).length;
              requirementMet = typeCount >= req.value;
              break;
            }
            case 'challenge_completed_with_failure': {
              // Fix: Added cp.accepted to ensure only accepted/invited members who failed are counted
              const withFailureCount = completedParticipations.filter((p) =>
                p.challenge.participants.some(
                  (cp) => cp.userId !== userId && cp.accepted && cp.failedAt !== null
                )
              ).length;
              requirementMet = withFailureCount >= req.value;
              break;
            }
            case 'challenge_perfect_group': {
              let perfectChallengesCount = 0;
              for (const part of completedParticipations) {
                const acceptedParticipants = part.challenge.participants.filter((p) => p.accepted);
                if (acceptedParticipants.length >= 3) {
                  const anyFailed = acceptedParticipants.some((p) => p.failedAt !== null);
                  const allCompleted = acceptedParticipants.every((p) => p.completedAt !== null);
                  if (!anyFailed && allCompleted) {
                    perfectChallengesCount++;
                  }
                }
              }
              requirementMet = perfectChallengesCount >= req.value;
              break;
            }
            case 'budget_pct_under': {
              requirementMet = await this.checkBudgetPctUnderRequirement(userId, req.value);
              break;
            }
          }
        } catch (err) {
          console.error(`Error parsing/evaluating requirement for badge ${badge.slug}:`, err);
        }

        if (requirementMet) {
          // Award badge
          const userBadge = await prisma.userBadge.create({
            data: {
              userId,
              badgeId: badge.id,
            },
          });
          awardedUserBadges.push(userBadge);

          // Add points
          await this.addPoints(userId, badge.pointsAwarded);

          // Create notification
          await createNotification({
            recipientId: userId,
            type: 'BADGE_UNLOCKED',
            data: { badgeName: badge.name, badgeSlug: badge.slug },
          });

          // Generate feed post
          await feedService.generateBadgeEarnedPost(userId, badge.slug, badge.name);
        }
      }

      return awardedUserBadges;
    } catch (error) {
      console.error('Failed to evaluate and award badges:', error);
      return [];
    }
  },

  /**
   * Helper to check if any past month has budget categories under a specific percent of limit.
   */
  async checkBudgetPctUnderRequirement(userId: string, targetPct: number): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });
    if (!user) return false;

    const gamification = await this.ensureGamificationProfile(userId);
    const timezone = gamification.timezone || 'UTC';

    const now = new Date();
    const parts = getLocalDateParts(now, timezone);

    // We only evaluate completed months.
    // The most recent completed month is the month before the current local month.
    let tempYear = parts.year;
    let tempMonth = parts.month - 1;
    if (tempMonth === 0) {
      tempMonth = 12;
      tempYear -= 1;
    }

    const minDate = new Date(user.createdAt);
    const minParts = getLocalDateParts(minDate, timezone);
    // Align minDate to the start of its local month
    const minMonthStart = getUtcDateOfLocalTime(minParts.year, minParts.month, 1, 0, 0, 0, timezone);

    let tempMonthStart = getUtcDateOfLocalTime(tempYear, tempMonth, 1, 0, 0, 0, timezone);

    while (tempMonthStart >= minMonthStart) {
      const monthStart = tempMonthStart;
      const nextMonthYear = tempMonth === 12 ? tempYear + 1 : tempYear;
      const nextMonth = tempMonth === 12 ? 1 : tempMonth + 1;
      const monthEnd = getUtcDateOfLocalTime(nextMonthYear, nextMonth, 1, 0, 0, 0, timezone);

      // Get categories for that month
      const categories = await prisma.category.findMany({
        where: { userId },
      });

      for (const cat of categories) {
        const limit = Number(cat.monthlyLimit);
        if (limit <= 0) continue;

        const spentAgg = await prisma.ledgerEntry.aggregate({
          where: {
            userId,
            type: 'BUDGET_DEDUCTION',
            transaction: {
              categoryId: cat.id,
              createdAt: {
                gte: monthStart,
                lt: monthEnd,
              },
            },
          },
          _sum: { amountChange: true },
        });

        const spent = spentAgg._sum.amountChange ? Number(spentAgg._sum.amountChange) : 0;
        const percentageUsed = (spent / limit) * 100;

        // If spent less than target percent (e.g. 50%)
        if (percentageUsed < targetPct) {
          return true;
        }
      }

      // Decrement by one month
      tempMonth -= 1;
      if (tempMonth === 0) {
        tempMonth = 12;
        tempYear -= 1;
      }
      tempMonthStart = getUtcDateOfLocalTime(tempYear, tempMonth, 1, 0, 0, 0, timezone);
    }

    return false;
  },

  /**
   * Called daily (or after each transaction) — checks if ALL categories are under budget today.
   */
  async updateStreak(userId: string): Promise<{ currentStreak: number; newMilestone: boolean }> {
    try {
      const gamification = await this.ensureGamificationProfile(userId);
      const timezone = gamification.timezone || 'UTC';
      
      const now = new Date();
      const todayStr = getLocalDateStr(now, timezone);
      const today = new Date(todayStr + 'T00:00:00Z');

      const parts = getLocalDateParts(now, timezone);
      const monthStart = getUtcDateOfLocalTime(parts.year, parts.month, 1, 0, 0, 0, timezone);
      const nextMonthYear = parts.month === 12 ? parts.year + 1 : parts.year;
      const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
      const monthEnd = getUtcDateOfLocalTime(nextMonthYear, nextMonth, 1, 0, 0, 0, timezone);

      // Get all budget categories
      const categories = await prisma.category.findMany({
        where: { userId },
      });

      if (categories.length === 0) {
        return { currentStreak: gamification.currentStreak, newMilestone: false };
      }

      // Check spent amount for each category
      const deductions = await prisma.ledgerEntry.findMany({
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

      const spentByCategory: Record<string, number> = {};
      for (const entry of deductions) {
        const catId = entry.transaction?.categoryId;
        if (catId) {
          spentByCategory[catId] = (spentByCategory[catId] || 0) + Number(entry.amountChange);
        }
      }

      let anyOverBudget = false;
      for (const cat of categories) {
        const spent = spentByCategory[cat.id] || 0;
        const limit = Number(cat.monthlyLimit);
        if (spent > limit) {
          anyOverBudget = true;
          break;
        }
      }

      let newStreak = gamification.currentStreak;
      let updatedDate: Date | null = gamification.lastStreakDate;
      let newMilestone = false;

      if (anyOverBudget) {
        newStreak = 0;
        updatedDate = null;
      } else {
        if (!gamification.lastStreakDate) {
          newStreak = 1;
          updatedDate = today;
        } else {
          const lastStreakUtc = new Date(Date.UTC(
            gamification.lastStreakDate.getUTCFullYear(),
            gamification.lastStreakDate.getUTCMonth(),
            gamification.lastStreakDate.getUTCDate()
          ));

          const diffTime = today.getTime() - lastStreakUtc.getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            newStreak = gamification.currentStreak + 1;
            updatedDate = today;
          } else if (diffDays === 0) {
            // Already counted today
            newStreak = gamification.currentStreak;
            updatedDate = gamification.lastStreakDate;
          } else {
            // Gap of 2 or more days, reset to 1
            newStreak = 1;
            updatedDate = today;
          }
        }
      }

      const updates: Prisma.UserGamificationUpdateInput = {
        currentStreak: newStreak,
        lastStreakDate: updatedDate,
      };

      if (newStreak > gamification.longestStreak) {
        updates.longestStreak = newStreak;
      }

      await prisma.userGamification.update({
        where: { userId },
        data: updates,
      });

      // Handle Milestone notifications / Feed posts
      if (newStreak > gamification.currentStreak && [3, 7, 14, 30, 100].includes(newStreak)) {
        newMilestone = true;
        
        await createNotification({
          recipientId: userId,
          type: 'STREAK_MILESTONE',
          data: { streakDays: newStreak },
        });

        // Feed Post for streak milestone
        await feedService.generateStreakMilestonePost(userId, newStreak);
      }

      return { currentStreak: newStreak, newMilestone };
    } catch (error) {
      console.error('Failed to update streak:', error);
      return { currentStreak: 0, newMilestone: false };
    }
  },

  /**
   * Add points and check if new avatar frames are unlocked
   */
  async addPoints(userId: string, points: number): Promise<void> {
    try {
      await this.ensureGamificationProfile(userId);
      await prisma.userGamification.update({
        where: { userId },
        data: {
          totalPoints: {
            increment: points,
          },
        },
      });
    } catch (error) {
      console.error('Failed to add points:', error);
    }
  },

  /**
   * Get user's gamification profile with badges and available frames
   */
  async getGamificationProfile(userId: string): Promise<GamificationProfileDTO> {
    const profile = await this.ensureGamificationProfile(userId);
    
    // Fetch full profile info with active frame
    const profileWithFrame = await prisma.userGamification.findUnique({
      where: { userId },
      include: {
        activeFrame: true,
      },
    });

    const userBadges = await prisma.userBadge.findMany({
      where: { userId },
      include: {
        badge: true,
      },
      orderBy: {
        unlockedAt: 'desc',
      },
    });

    const allBadges = await prisma.badge.findMany();
    
    // Sort allBadges by rarity (COMMON -> UNCOMMON -> RARE -> EPIC -> LEGENDARY),
    // and pointsAwarded ascending as a tie-breaker.
    const rarityOrder: Record<BadgeRarity, number> = {
      COMMON: 1,
      UNCOMMON: 2,
      RARE: 3,
      EPIC: 4,
      LEGENDARY: 5,
    };
    allBadges.sort((a, b) => {
      const orderA = rarityOrder[a.rarity] || 0;
      const orderB = rarityOrder[b.rarity] || 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.pointsAwarded - b.pointsAwarded;
    });

    const allFrames = await prisma.avatarFrame.findMany({
      orderBy: {
        sortOrder: 'asc',
      },
    });

    const earnedBadgeIds = new Set(userBadges.map((ub) => ub.badgeId));
    const earnedBadgeUnlockedAtMap = new Map(userBadges.map((ub) => [ub.badgeId, ub.unlockedAt]));

    return {
      profile: {
        currentStreak: profile.currentStreak,
        longestStreak: profile.longestStreak,
        totalPoints: profile.totalPoints,
        lastStreakDate: profile.lastStreakDate,
        activeFrame: profileWithFrame?.activeFrame
          ? {
              id: profileWithFrame.activeFrame.id,
              slug: profileWithFrame.activeFrame.slug,
              name: profileWithFrame.activeFrame.name,
              cssClass: profileWithFrame.activeFrame.cssClass,
            }
          : null,
      },
      badges: userBadges.map((ub) => ({
        id: ub.badge.id,
        slug: ub.badge.slug,
        name: ub.badge.name,
        description: ub.badge.description,
        iconUrl: ub.badge.iconUrl,
        rarity: ub.badge.rarity,
        unlockedAt: ub.unlockedAt,
      })),
      allBadges: allBadges.map((b) => ({
        id: b.id,
        slug: b.slug,
        name: b.name,
        description: b.description,
        iconUrl: b.iconUrl,
        rarity: b.rarity,
        pointsAwarded: b.pointsAwarded,
        unlocked: earnedBadgeIds.has(b.id),
        unlockedAt: earnedBadgeUnlockedAtMap.get(b.id) || null,
      })),
      availableFrames: allFrames.map((f) => ({
        id: f.id,
        slug: f.slug,
        name: f.name,
        cssClass: f.cssClass,
        pointsRequired: f.pointsRequired,
        unlocked: profile.totalPoints >= f.pointsRequired,
        isActive: profile.activeFrameId === f.id,
      })),
    };
  },

  /**
   * Get leaderboard among user's friends (and self)
   */
  async getLeaderboard(userId: string): Promise<LeaderboardEntryDTO[]> {
    try {
      const friendships = await prisma.friendship.findMany({
        where: {
          OR: [
            { userAId: userId },
            { userBId: userId },
          ],
        },
      });

      const friendUserIds = friendships.map((f) => (f.userAId === userId ? f.userBId : f.userAId));
      const allUserIds = Array.from(new Set([userId, ...friendUserIds]));

      // Bulk insert missing gamification profiles in one query to optimize database performance
      await prisma.userGamification.createMany({
        data: allUserIds.map((id) => ({
          userId: id,
          currentStreak: 0,
          longestStreak: 0,
          totalPoints: 0,
          activeFrameId: null,
        })),
        skipDuplicates: true,
      });

      const users = await prisma.user.findMany({
        where: { id: { in: allUserIds } },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          gamification: {
            include: {
              activeFrame: {
                select: {
                  cssClass: true,
                },
              },
            },
          },
          _count: {
            select: {
              badges: true,
            },
          },
        },
      });

      const entries = users.map((u) => {
        const g = u.gamification;
        return {
          userId: u.id,
          username: u.username,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
          activeFrame: g?.activeFrame ? { cssClass: g.activeFrame.cssClass } : null,
          totalPoints: g?.totalPoints || 0,
          currentStreak: g?.currentStreak || 0,
          longestStreak: g?.longestStreak || 0,
          badgeCount: u._count.badges,
          isCurrentUser: u.id === userId,
        };
      });

      // Sort by totalPoints desc, then longestStreak desc
      entries.sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) {
          return b.totalPoints - a.totalPoints;
        }
        return b.longestStreak - a.longestStreak;
      });

      // Assign rank
      return entries.map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));
    } catch (error) {
      console.error('Failed to retrieve leaderboard:', error);
      return [];
    }
  },

  /**
   * Evaluate active challenges for a user.
   * If a user overspent, mark their participation as failed.
   * Checks for expired challenges and handles completion.
   */
  async evaluateChallenges(userId: string): Promise<void> {
    try {
      const now = new Date();

      // Lazy evaluation: complete any active challenges that have expired
      const expiredChallenges = await prisma.challenge.findMany({
        where: {
          status: 'ACTIVE',
          endDate: { lt: now },
        },
        include: {
          participants: true,
        },
      });

      for (const challenge of expiredChallenges) {
        await prisma.$transaction(async (tx) => {
          // Set challenge status to COMPLETED
          await tx.challenge.update({
            where: { id: challenge.id },
            data: { status: 'COMPLETED' },
          });

          // Process winners (failedAt is null)
          const winners = challenge.participants.filter((p) => p.failedAt === null && p.accepted);

          for (const winner of winners) {
            await tx.challengeParticipant.update({
              where: { id: winner.id },
              data: { completedAt: challenge.endDate },
            });

            // Trigger reward / notification / feed post for completed challenge
            await createNotification({
              recipientId: winner.userId,
              type: 'CHALLENGE_COMPLETED',
              data: { challengeName: challenge.name, challengeId: challenge.id },
            });

            await feedService.generateChallengeCompletedPost(winner.userId, challenge.id, challenge.name);
          }
        });

        // Trigger badge checks for winners
        const winners = challenge.participants.filter((p) => p.failedAt === null && p.accepted);
        for (const winner of winners) {
          await this.evaluateAndAwardBadges(winner.userId).catch(console.error);
        }
      }

      // Check current active challenges for overspend
      const activeParticipations = await prisma.challengeParticipant.findMany({
        where: {
          userId,
          accepted: true,
          failedAt: null,
          completedAt: null,
          challenge: {
            status: 'ACTIVE',
            startDate: { lte: now },
            endDate: { gte: now },
          },
        },
        include: {
          challenge: true,
        },
      });

      if (activeParticipations.length === 0) return;

      const gamification = await this.ensureGamificationProfile(userId);
      const timezone = gamification.timezone || 'UTC';
      const parts = getLocalDateParts(now, timezone);
      const monthStart = getUtcDateOfLocalTime(parts.year, parts.month, 1, 0, 0, 0, timezone);
      const nextMonthYear = parts.month === 12 ? parts.year + 1 : parts.year;
      const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
      const monthEnd = getUtcDateOfLocalTime(nextMonthYear, nextMonth, 1, 0, 0, 0, timezone);

      // Get budget status for current month
      const categories = await prisma.category.findMany({
        where: { userId },
      });

      const deductions = await prisma.ledgerEntry.findMany({
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

      const spentByCategory: Record<string, number> = {};
      for (const entry of deductions) {
        const catId = entry.transaction?.categoryId;
        if (catId) {
          spentByCategory[catId] = (spentByCategory[catId] || 0) + Number(entry.amountChange);
        }
      }

      for (const p of activeParticipations) {
        const challenge = p.challenge;
        let hasFailed = false;

        if (challenge.categoryId) {
          const category = categories.find((c) => c.id === challenge.categoryId);
          if (category) {
            const spent = spentByCategory[category.id] || 0;
            if (spent > Number(category.monthlyLimit)) {
              hasFailed = true;
            }
          }
        } else {
          // Check all categories
          for (const cat of categories) {
            const spent = spentByCategory[cat.id] || 0;
            if (spent > Number(cat.monthlyLimit)) {
              hasFailed = true;
              break;
            }
          }
        }

        if (hasFailed) {
          await prisma.challengeParticipant.update({
            where: { id: p.id },
            data: { failedAt: now },
          });
        }
      }
    } catch (error) {
      console.error('Failed to evaluate challenges:', error);
    }
  },
};
