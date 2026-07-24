import { prisma } from '../config/db';
import { Prisma, UserGamification, UserBadge, BadgeRarity } from '@prisma/client';
import { feedService } from './feedService';
import { createNotification } from './notificationService';
import { getPeriodWindow, BudgetPeriod, PeriodOpts } from './budgetPeriodService';
import { effectiveCurrentStreak } from './streakFreshness';
import {
  getUserSavingsSnapshot,
  getAccruedSavingsInWindow,
  getClosedBudgetPeriods,
  UserSavingsSnapshot,
} from './savingsSnapshotService';

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
    requiresSavings: boolean;
    isActive: boolean;
  }>;
}

/**
 * Frames whose theme is the savings feature. In addition to their points
 * requirement, these only unlock while the account has savings enabled, so a
 * savings-themed frame can never be equipped by someone who has never turned the
 * feature on. Budget/streak-themed frames stay points-only.
 */
export const SAVINGS_GATED_FRAME_SLUGS = new Set<string>(['blush_piggy', 'aurora_vault']);

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

/**
 * Offset in milliseconds that local wall-clock time is AHEAD of UTC at `instant`
 * for the given timezone (e.g. +13:45 → 49_500_000). Positive east of UTC.
 */
function tzOffsetMsAt(instant: Date, tz: string): number {
  const p = getLocalDateParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instant.getTime();
}

export function getUtcDateOfLocalTime(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, tz = 'UTC') {
  // The desired wall-clock instant interpreted as if it were UTC.
  const wallUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  try {
    // First approximation: subtract the offset sampled at `wallUtc`.
    const firstOffset = tzOffsetMsAt(new Date(wallUtc), tz);
    let result = wallUtc - firstOffset;

    // Refinement pass: the first sample can pick the offset on the WRONG side of
    // a DST transition (the estimate and the true instant can straddle a
    // spring-forward or fall-back boundary). Re-sample the offset at the
    // approximate instant and correct. One pass converges for a single
    // transition, which covers every real-world timezone rule and eliminates the
    // ~1h drift that otherwise put local-midnight boundaries an hour off (e.g.
    // Australia/Sydney fall-back or Pacific/Chatham spring-forward).
    const refinedOffset = tzOffsetMsAt(new Date(result), tz);
    if (refinedOffset !== firstOffset) {
      result = wallUtc - refinedOffset;
    }
    return new Date(result);
  } catch (e) {
    return new Date(wallUtc);
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


/**
 * Map a Prisma Category's period fields onto the PeriodOpts shape that
 * `getPeriodWindow` expects. Shared by the period-aware streak and challenge
 * evaluators.
 */
function categoryPeriodOpts(cat: {
  monthlyStartDay: number | null;
  weeklyStartDay: number | null;
  customPeriodDays: number | null;
  anchorDate: Date | null;
}): PeriodOpts {
  return {
    monthlyStartDay: cat.monthlyStartDay,
    weeklyStartDay: cat.weeklyStartDay,
    customPeriodDays: cat.customPeriodDays,
    anchorDate: cat.anchorDate,
  };
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

      // Pre-fetch all simple counts and lists in a single batch to avoid N+1 queries.
      // The savings snapshot is computed ONCE here and shared across every savings
      // requirement check below (mirrors the batched prefetch — no N+1).
      const [
        expenseCount,
        settlementCount,
        topupCount,
        friendCount,
        challengeCreateCount,
        completedParticipations,
        savingsSnapshot,
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
        getUserSavingsSnapshot(userId).catch((err): UserSavingsSnapshot => {
          console.error('Failed to compute savings snapshot for badges:', err);
          return {
            enabled: false,
            totalAccruedSavings: 0,
            totalSavingsBalance: 0,
            usageCount: 0,
            noOverspendPeriodCount: 0,
          };
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
            case 'savings_enabled': {
              requirementMet = savingsSnapshot.enabled;
              break;
            }
            case 'savings_accrued_total': {
              requirementMet = savingsSnapshot.totalAccruedSavings >= req.value;
              break;
            }
            case 'savings_balance': {
              // Evaluated against the currently computed balance. Balance can drop
              // after spending, but earned UserBadge rows are never deleted, so the
              // badge is retained once awarded (forgiving model).
              requirementMet = savingsSnapshot.totalSavingsBalance >= req.value;
              break;
            }
            case 'savings_usage_count': {
              requirementMet = savingsSnapshot.usageCount >= req.value;
              break;
            }
            case 'period_no_overspend_count': {
              requirementMet = savingsSnapshot.noOverspendPeriodCount >= req.value;
              break;
            }
          }
        } catch (err) {
          console.error(`Error parsing/evaluating requirement for badge ${badge.slug}:`, err);
        }

        if (requirementMet) {
          try {
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
          } catch (err: any) {
            // P2002 = unique constraint violation (badge already awarded by concurrent execution)
            if (err.code === 'P2002') {
              console.log(`Badge ${badge.slug} already awarded concurrently to user ${userId}, skipping duplicate award.`);
              continue;
            }
            throw err;
          }
        }
      }

      return awardedUserBadges;
    } catch (error) {
      console.error('Failed to evaluate and award badges:', error);
      return [];
    }
  },

  /**
   * Run gamification updates sequentially to prevent race conditions on streaks, points, and badges.
   */
  async triggerGamificationUpdates(userId: string): Promise<void> {
    try {
      // 1. Update streak first
      await this.updateStreak(userId);
      // 2. Evaluate and award badges (after streak is updated, so streak badges have correct value)
      await this.evaluateAndAwardBadges(userId);
      // 3. Evaluate challenges (which can award badges to challenge winners sequentially)
      await this.evaluateChallenges(userId);
    } catch (error) {
      console.error(`Failed to trigger gamification updates for user ${userId}:`, error);
    }
  },

  /**
   * Period-aware check: did any CLOSED budget period (per category, using that
   * category's own configured period window) end using less than `targetPct` of
   * the category limit?
   *
   * The closed-period WINDOWS come from the savings engine's authoritative
   * enumeration (`getClosedBudgetPeriods`) so this badge respects weekly/custom
   * periods instead of the calendar month. Spend within each window is measured
   * from `BUDGET_DEDUCTION` ledger entries — the SAME source the streak and the
   * budget-status page use (net of top-ups/settlements) — so the badge agrees with
   * them rather than the savings engine's funded EXPENSE totals. It is ungated by
   * savings enablement (a budget reward, independent of savings). Deductions across
   * the union of all windows are fetched once (no N+1). Earned badges are never
   * revoked.
   */
  async checkBudgetPctUnderRequirement(userId: string, targetPct: number): Promise<boolean> {
    try {
      const periods = await getClosedBudgetPeriods(userId);
      if (periods.length === 0) return false;

      // Single batched ledger fetch across the union of every closed window.
      let minStart = periods[0].periodStart;
      let maxEnd = periods[0].periodEnd;
      for (const p of periods) {
        if (p.periodStart < minStart) minStart = p.periodStart;
        if (p.periodEnd > maxEnd) maxEnd = p.periodEnd;
      }

      const deductions = await prisma.ledgerEntry.findMany({
        where: {
          userId,
          type: 'BUDGET_DEDUCTION',
          transaction: { createdAt: { gte: minStart, lt: maxEnd } },
        },
        include: { transaction: { select: { categoryId: true, createdAt: true } } },
      });

      for (const period of periods) {
        if (period.limitAmount <= 0) continue;
        let spent = 0;
        for (const entry of deductions) {
          const tx = entry.transaction;
          if (!tx || tx.categoryId !== period.categoryId || !tx.createdAt) continue;
          const t = tx.createdAt.getTime();
          if (t >= period.periodStart.getTime() && t < period.periodEnd.getTime()) {
            spent += Number(entry.amountChange);
          }
        }
        const percentageUsed = (spent / period.limitAmount) * 100;
        if (percentageUsed < targetPct) {
          return true;
        }
      }
    } catch (error) {
      console.error('Failed to check budget_pct_under requirement:', error);
    }
    return false;
  },

  /**
   * Return the set of a user's category ids that are currently OVER budget, each
   * evaluated against its own current period window (`getPeriodWindow`). Shared by
   * the period-aware streak and challenge evaluators.
   *
   * A category whose stored period config cannot be resolved is skipped (never
   * counted as over). Deductions spanning the union of all category windows are
   * fetched once, then summed per category within its own window (no N+1).
   */
  async getOverBudgetCategoryIds(
    userId: string,
    timezone: string,
    now: Date,
    preloadedCategories?: Array<{
      id: string;
      limitAmount: Prisma.Decimal;
      period: string;
      monthlyStartDay: number | null;
      weeklyStartDay: number | null;
      customPeriodDays: number | null;
      anchorDate: Date | null;
    }>,
  ): Promise<Set<string>> {
    const over = new Set<string>();
    const categories =
      preloadedCategories ?? (await prisma.category.findMany({ where: { userId } }));
    if (categories.length === 0) return over;

    const catWindows = categories
      .map((cat) => {
        try {
          const window = getPeriodWindow(
            cat.period as BudgetPeriod,
            categoryPeriodOpts(cat),
            now,
            timezone,
          );
          return { cat, window };
        } catch {
          return null;
        }
      })
      .filter(
        (cw): cw is { cat: (typeof categories)[number]; window: ReturnType<typeof getPeriodWindow> } =>
          cw !== null,
      );

    if (catWindows.length === 0) return over;

    let minStart = catWindows[0].window.periodStart;
    let maxEnd = catWindows[0].window.periodEnd;
    for (const { window } of catWindows) {
      if (window.periodStart < minStart) minStart = window.periodStart;
      if (window.periodEnd > maxEnd) maxEnd = window.periodEnd;
    }

    const deductions = await prisma.ledgerEntry.findMany({
      where: {
        userId,
        type: 'BUDGET_DEDUCTION',
        transaction: { createdAt: { gte: minStart, lt: maxEnd } },
      },
      include: { transaction: { select: { categoryId: true, createdAt: true } } },
    });

    for (const { cat, window } of catWindows) {
      const limit = Number(cat.limitAmount);
      let spent = 0;
      for (const entry of deductions) {
        const tx = entry.transaction;
        if (!tx || tx.categoryId !== cat.id || !tx.createdAt) continue;
        const t = tx.createdAt.getTime();
        if (t >= window.periodStart.getTime() && t < window.periodEnd.getTime()) {
          spent += Number(entry.amountChange);
        }
      }
      if (spent > limit) over.add(cat.id);
    }

    return over;
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

      // Get all budget categories
      const categories = await prisma.category.findMany({
        where: { userId },
      });

      if (categories.length === 0) {
        return { currentStreak: gamification.currentStreak, newMilestone: false };
      }

      // Period-aware: a category is "over" when its spend exceeds its limit within
      // ITS OWN current period window (getPeriodWindow), not a shared calendar
      // month. The streak breaks if ANY category is over.
      const overBudgetCategoryIds = await this.getOverBudgetCategoryIds(userId, timezone, now, categories);
      const anyOverBudget = overBudgetCategoryIds.size > 0;

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

    // Savings-themed frames only unlock while savings is enabled (see
    // SAVINGS_GATED_FRAME_SLUGS).
    const savingsSettings = await prisma.savingsSettings.findUnique({
      where: { userId },
      select: { enabled: true },
    });
    const savingsEnabled = savingsSettings?.enabled ?? false;

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

    // Order chronologically by the points needed to unlock (cheapest first),
    // tie-broken by the curated sortOrder so newly-appended frames slot into the
    // right price position instead of always trailing the original set.
    const allFrames = await prisma.avatarFrame.findMany({
      orderBy: [{ pointsRequired: 'asc' }, { sortOrder: 'asc' }],
    });

    const earnedBadgeIds = new Set(userBadges.map((ub) => ub.badgeId));
    const earnedBadgeUnlockedAtMap = new Map(userBadges.map((ub) => [ub.badgeId, ub.unlockedAt]));

    return {
      profile: {
        // Expire stale snapshots: an abandoned streak must not read as active.
        currentStreak: effectiveCurrentStreak(profile.currentStreak, profile.lastStreakDate, profile.timezone ?? undefined),
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
      availableFrames: allFrames.map((f) => {
        const requiresSavings = SAVINGS_GATED_FRAME_SLUGS.has(f.slug);
        const meetsPoints = profile.totalPoints >= f.pointsRequired;
        return {
          id: f.id,
          slug: f.slug,
          name: f.name,
          cssClass: f.cssClass,
          pointsRequired: f.pointsRequired,
          // Savings-gated frames also require savings to be enabled.
          unlocked: requiresSavings ? savingsEnabled && meetsPoints : meetsPoints,
          requiresSavings,
          isActive: profile.activeFrameId === f.id,
        };
      }),
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
          // Expire stale snapshots: an abandoned streak must not read as active.
          currentStreak: effectiveCurrentStreak(g?.currentStreak || 0, g?.lastStreakDate ?? null, g?.timezone ?? undefined),
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

      // ── Lazy expiry: finalize active challenges past their endDate ──
      const expiredChallenges = await prisma.challenge.findMany({
        where: {
          status: 'ACTIVE',
          endDate: { lt: now },
          participants: { some: { userId } },
        },
        include: { participants: true },
      });

      for (const challenge of expiredChallenges) {
        if (challenge.type === 'SAVINGS_TARGET') {
          // Each accepted participant COMPLETES iff they accrued >= targetAmount of
          // new savings within the window; otherwise they FAIL (no overspend
          // penalty — overspend is non-destructive to savings). A SAVINGS_TARGET
          // is created with a required positive target; if it is somehow missing
          // (data drift) we fail closed — no participant auto-completes.
          const target =
            challenge.targetAmount !== null && Number(challenge.targetAmount) > 0
              ? Number(challenge.targetAmount)
              : null;
          const accepted = challenge.participants.filter((p) => p.accepted);

          const outcomes: Array<{ participant: (typeof accepted)[number]; won: boolean }> = [];
          for (const part of accepted) {
            if (part.completedAt) {
              outcomes.push({ participant: part, won: true });
              continue;
            }
            if (part.failedAt) {
              outcomes.push({ participant: part, won: false });
              continue;
            }
            if (target === null) {
              outcomes.push({ participant: part, won: false });
              continue;
            }
            const accrued = await getAccruedSavingsInWindow(
              part.userId,
              challenge.startDate,
              challenge.endDate,
              now,
            ).catch(() => 0);
            outcomes.push({ participant: part, won: accrued >= target });
          }

          await prisma.$transaction(async (tx) => {
            await tx.challenge.update({ where: { id: challenge.id }, data: { status: 'COMPLETED' } });
            for (const { participant, won } of outcomes) {
              if (won && !participant.completedAt) {
                await tx.challengeParticipant.update({
                  where: { id: participant.id },
                  data: { completedAt: challenge.endDate },
                });
                await createNotification({
                  recipientId: participant.userId,
                  type: 'CHALLENGE_COMPLETED',
                  data: { challengeName: challenge.name, challengeId: challenge.id },
                });
                await feedService.generateChallengeCompletedPost(
                  participant.userId,
                  challenge.id,
                  challenge.name,
                );
              } else if (!won && !participant.failedAt) {
                await tx.challengeParticipant.update({
                  where: { id: participant.id },
                  data: { failedAt: challenge.endDate },
                });
              }
            }
          });

          for (const { participant, won } of outcomes) {
            if (won) await this.evaluateAndAwardBadges(participant.userId).catch(console.error);
          }
        } else {
          await prisma.$transaction(async (tx) => {
            await tx.challenge.update({ where: { id: challenge.id }, data: { status: 'COMPLETED' } });
            const winners = challenge.participants.filter((p) => p.failedAt === null && p.accepted);
            for (const winner of winners) {
              await tx.challengeParticipant.update({
                where: { id: winner.id },
                data: { completedAt: challenge.endDate },
              });
              await createNotification({
                recipientId: winner.userId,
                type: 'CHALLENGE_COMPLETED',
                data: { challengeName: challenge.name, challengeId: challenge.id },
              });
              await feedService.generateChallengeCompletedPost(winner.userId, challenge.id, challenge.name);
            }
          });

          const winners = challenge.participants.filter((p) => p.failedAt === null && p.accepted);
          for (const winner of winners) {
            await this.evaluateAndAwardBadges(winner.userId).catch(console.error);
          }
        }
      }

      // ── Active participations for THIS user ──
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
        include: { challenge: true },
      });

      if (activeParticipations.length === 0) return;

      const gamification = await this.ensureGamificationProfile(userId);
      const timezone = gamification.timezone || 'UTC';

      // Period-aware overspend: which of this user's categories are currently over
      // budget, each against its OWN period window. Computed once for all budget-
      // type participations. SAVINGS_TARGET participations ignore this entirely.
      const hasBudgetTypeParticipation = activeParticipations.some(
        (p) => p.challenge.type !== 'SAVINGS_TARGET',
      );
      const overBudgetCategoryIds = hasBudgetTypeParticipation
        ? await this.getOverBudgetCategoryIds(userId, timezone, now)
        : new Set<string>();

      for (const p of activeParticipations) {
        const challenge = p.challenge;

        if (challenge.type === 'SAVINGS_TARGET') {
          // Early completion the instant the target is met (better UX). Finalized
          // participants below target are marked failed at expiry above. A missing
          // target (data drift) can never early-complete — fail closed.
          const target =
            challenge.targetAmount !== null && Number(challenge.targetAmount) > 0
              ? Number(challenge.targetAmount)
              : null;
          const accrued =
            target === null
              ? 0
              : await getAccruedSavingsInWindow(
                  userId,
                  challenge.startDate,
                  challenge.endDate,
                  now,
                ).catch(() => 0);
          if (target !== null && accrued >= target) {
            await prisma.challengeParticipant.update({
              where: { id: p.id },
              data: { completedAt: now },
            });
            await createNotification({
              recipientId: userId,
              type: 'CHALLENGE_COMPLETED',
              data: { challengeName: challenge.name, challengeId: challenge.id },
            });
            await feedService.generateChallengeCompletedPost(userId, challenge.id, challenge.name);
            await this.evaluateAndAwardBadges(userId).catch(console.error);
          }
          continue;
        }

        // Budget-type challenges: fail on overspend (period-aware).
        let hasFailed = false;
        if (challenge.categoryId) {
          if (overBudgetCategoryIds.has(challenge.categoryId)) hasFailed = true;
        } else if (overBudgetCategoryIds.size > 0) {
          hasFailed = true;
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
