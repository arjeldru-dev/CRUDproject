import { prisma } from '../src/config/db';
import { BadgeRarity } from '@prisma/client';

/**
 * Seed data for the gamification system.
 * Uses upsert keyed on `slug` so the script is idempotent — safe to re-run.
 */
async function main() {
  console.log('🎮 Seeding gamification data...');

  // ── Badges ────────────────────────────────────────────────────────────
  const badges: Array<{
    slug: string;
    name: string;
    description: string;
    iconUrl: string;
    rarity: BadgeRarity;
    pointsAwarded: number;
    requirement: string;
  }> = [
    {
      slug: 'first_expense',
      name: 'First Step',
      description: 'Log your first expense',
      iconUrl: '👣',
      rarity: 'COMMON',
      pointsAwarded: 10,
      requirement: JSON.stringify({ type: 'expense_count', value: 1 }),
    },
    {
      slug: 'first_settle',
      name: 'Peacemaker',
      description: 'Complete your first settlement',
      iconUrl: '🤝',
      rarity: 'COMMON',
      pointsAwarded: 10,
      requirement: JSON.stringify({ type: 'settlement_count', value: 1 }),
    },
    {
      slug: 'streak_3',
      name: 'Warming Up',
      description: '3-day under-budget streak',
      iconUrl: '🌱',
      rarity: 'COMMON',
      pointsAwarded: 25,
      requirement: JSON.stringify({ type: 'streak', value: 3 }),
    },
    {
      slug: 'streak_7',
      name: 'Week Warrior',
      description: '7-day under-budget streak',
      iconUrl: '🔥',
      rarity: 'UNCOMMON',
      pointsAwarded: 50,
      requirement: JSON.stringify({ type: 'streak', value: 7 }),
    },
    {
      slug: 'streak_14',
      name: 'Fortnight Force',
      description: '14-day under-budget streak',
      iconUrl: '⚡',
      rarity: 'RARE',
      pointsAwarded: 100,
      requirement: JSON.stringify({ type: 'streak', value: 14 }),
    },
    {
      slug: 'streak_30',
      name: 'Monthly Master',
      description: '30-day under-budget streak',
      iconUrl: '👑',
      rarity: 'EPIC',
      pointsAwarded: 250,
      requirement: JSON.stringify({ type: 'streak', value: 30 }),
    },
    {
      slug: 'streak_100',
      name: 'Legendary Saver',
      description: '100-day under-budget streak',
      iconUrl: '💎',
      rarity: 'LEGENDARY',
      pointsAwarded: 500,
      requirement: JSON.stringify({ type: 'streak', value: 100 }),
    },
    {
      slug: 'budget_under_50',
      name: 'Half Saver',
      description: 'End a month using less than 50% of any budget',
      iconUrl: '💰',
      rarity: 'UNCOMMON',
      pointsAwarded: 50,
      requirement: JSON.stringify({ type: 'budget_pct_under', value: 50 }),
    },
    {
      slug: 'challenge_creator_1',
      name: 'Spark',
      description: 'Create your first group challenge',
      iconUrl: '🌟',
      rarity: 'COMMON',
      pointsAwarded: 20,
      requirement: JSON.stringify({ type: 'challenge_create_count', value: 1 }),
    },
    {
      slug: 'challenge_creator_5',
      name: 'Master Strategist',
      description: 'Create 5 group challenges for your friends',
      iconUrl: '🗺️',
      rarity: 'RARE',
      pointsAwarded: 100,
      requirement: JSON.stringify({ type: 'challenge_create_count', value: 5 }),
    },
    {
      slug: 'challenge_creator_10',
      name: 'Grand Architect',
      description: 'Create 10 group challenges for your friends',
      iconUrl: '🏰',
      rarity: 'EPIC',
      pointsAwarded: 250,
      requirement: JSON.stringify({ type: 'challenge_create_count', value: 10 }),
    },
    {
      slug: 'challenge_no_overspend_week',
      name: 'Week of Discipline',
      description: 'Successfully complete a "No Overspend Week" challenge',
      iconUrl: '📅',
      rarity: 'COMMON',
      pointsAwarded: 50,
      requirement: JSON.stringify({ type: 'challenge_type_complete', type_value: 'NO_OVERSPEND_WEEK', value: 1 }),
    },
    {
      slug: 'challenge_coffee_free',
      name: 'Caffeine Shield',
      description: 'Successfully complete a "Coffee-Free Week" challenge',
      iconUrl: '☕',
      rarity: 'UNCOMMON',
      pointsAwarded: 80,
      requirement: JSON.stringify({ type: 'challenge_type_complete', type_value: 'COFFEE_FREE_WEEK', value: 1 }),
    },
    {
      slug: 'challenge_transport_saver',
      name: 'Commuter Champion',
      description: 'Successfully complete a "Transport Saver" challenge',
      iconUrl: '🚗',
      rarity: 'UNCOMMON',
      pointsAwarded: 80,
      requirement: JSON.stringify({ type: 'challenge_type_complete', type_value: 'TRANSPORT_SAVER', value: 1 }),
    },
    {
      slug: 'challenge_custom_complete',
      name: 'Rules Maker',
      description: 'Successfully complete a "Custom" challenge',
      iconUrl: '🛠️',
      rarity: 'COMMON',
      pointsAwarded: 50,
      requirement: JSON.stringify({ type: 'challenge_type_complete', type_value: 'CUSTOM', value: 1 }),
    },
    {
      slug: 'challenge_no_overspend_month',
      name: 'Thrifty Elite',
      description: 'Successfully complete a "No Overspend Month" challenge',
      iconUrl: '🏔️',
      rarity: 'EPIC',
      pointsAwarded: 300,
      requirement: JSON.stringify({ type: 'challenge_type_complete', type_value: 'NO_OVERSPEND_MONTH', value: 1 }),
    },
    {
      slug: 'challenge_complete',
      name: 'Team Player',
      description: 'Complete your first group challenge',
      iconUrl: '🏆',
      rarity: 'UNCOMMON',
      pointsAwarded: 75,
      requirement: JSON.stringify({ type: 'challenge_complete_count', value: 1 }),
    },
    {
      slug: 'challenge_3',
      name: 'Challenge Champ',
      description: 'Complete 3 group challenges',
      iconUrl: '🥇',
      rarity: 'RARE',
      pointsAwarded: 150,
      requirement: JSON.stringify({ type: 'challenge_complete_count', value: 3 }),
    },
    {
      slug: 'challenge_5',
      name: 'Challenge Veteran',
      description: 'Complete 5 group challenges',
      iconUrl: '🎖️',
      rarity: 'RARE',
      pointsAwarded: 200,
      requirement: JSON.stringify({ type: 'challenge_complete_count', value: 5 }),
    },
    {
      slug: 'challenge_10',
      name: 'Unstoppable Force',
      description: 'Complete 10 group challenges',
      iconUrl: '🦾',
      rarity: 'EPIC',
      pointsAwarded: 350,
      requirement: JSON.stringify({ type: 'challenge_complete_count', value: 10 }),
    },
    {
      slug: 'challenge_25',
      name: 'Savings Gladiator',
      description: 'Complete 25 group challenges',
      iconUrl: '🛡️',
      rarity: 'LEGENDARY',
      pointsAwarded: 600,
      requirement: JSON.stringify({ type: 'challenge_complete_count', value: 25 }),
    },
    {
      slug: 'challenge_last_standing',
      name: 'Last Standing',
      description: 'Complete a group challenge where at least one other participant failed',
      iconUrl: '🤺',
      rarity: 'RARE',
      pointsAwarded: 100,
      requirement: JSON.stringify({ type: 'challenge_completed_with_failure', value: 1 }),
    },
    {
      slug: 'challenge_perfect_group',
      name: 'Perfect Cooperation',
      description: 'Complete a group challenge with 3+ participants where everyone succeeded',
      iconUrl: '🕊️',
      rarity: 'RARE',
      pointsAwarded: 150,
      requirement: JSON.stringify({ type: 'challenge_perfect_group', value: 1 }),
    },
    {
      slug: 'social_butterfly',
      name: 'Social Butterfly',
      description: 'Have 5 or more friends',
      iconUrl: '🦋',
      rarity: 'COMMON',
      pointsAwarded: 25,
      requirement: JSON.stringify({ type: 'friend_count', value: 5 }),
    },
    {
      slug: 'social_champion',
      name: 'Barkada Lead',
      description: 'Have 10 or more friends',
      iconUrl: '👑',
      rarity: 'RARE',
      pointsAwarded: 100,
      requirement: JSON.stringify({ type: 'friend_count', value: 10 }),
    },
    {
      slug: 'top_up_master',
      name: 'Top-Up Pro',
      description: 'Add funds to your budget 5 times',
      iconUrl: '💳',
      rarity: 'UNCOMMON',
      pointsAwarded: 40,
      requirement: JSON.stringify({ type: 'topup_count', value: 5 }),
    },
    {
      slug: 'top_up_grandmaster',
      name: 'Treasury Lord',
      description: 'Add funds to your budget 20 times',
      iconUrl: '🏛️',
      rarity: 'RARE',
      pointsAwarded: 150,
      requirement: JSON.stringify({ type: 'topup_count', value: 20 }),
    },
    {
      slug: 'peacemaker_elite',
      name: 'Chief Diplomat',
      description: 'Complete 10 settlements',
      iconUrl: '🕊️',
      rarity: 'RARE',
      pointsAwarded: 100,
      requirement: JSON.stringify({ type: 'settlement_count', value: 10 }),
    },
    {
      slug: 'expense_veteran',
      name: 'Split Expert',
      description: 'Log 50 expenses',
      iconUrl: '📊',
      rarity: 'RARE',
      pointsAwarded: 150,
      requirement: JSON.stringify({ type: 'expense_count', value: 50 }),
    },
    {
      slug: 'streak_60',
      name: 'Two-Month Titan',
      description: '60-day under-budget streak',
      iconUrl: '🌟',
      rarity: 'EPIC',
      pointsAwarded: 350,
      requirement: JSON.stringify({ type: 'streak', value: 60 }),
    },
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { slug: badge.slug },
      update: {
        name: badge.name,
        description: badge.description,
        iconUrl: badge.iconUrl,
        rarity: badge.rarity,
        pointsAwarded: badge.pointsAwarded,
        requirement: badge.requirement,
      },
      create: badge,
    });
  }

  console.log(`  ✅ ${badges.length} badges seeded`);

  // ── Avatar Frames ─────────────────────────────────────────────────────
  const frames: Array<{
    slug: string;
    name: string;
    cssClass: string;
    pointsRequired: number;
    sortOrder: number;
  }> = [
    { slug: 'default', name: 'Default', cssClass: '', pointsRequired: 0, sortOrder: 0 },
    { slug: 'bronze_ring', name: 'Bronze Saver', cssClass: 'ring-2 ring-amber-600', pointsRequired: 50, sortOrder: 1 },
    { slug: 'silver_ring', name: 'Silver Saver', cssClass: 'ring-2 ring-gray-400', pointsRequired: 150, sortOrder: 2 },
    { slug: 'gold_ring', name: 'Gold Saver', cssClass: 'ring-2 ring-yellow-400', pointsRequired: 300, sortOrder: 3 },
    { slug: 'emerald_glow', name: 'Emerald Elite', cssClass: 'ring-2 ring-emerald-400 shadow-emerald-400/40 shadow-lg', pointsRequired: 500, sortOrder: 4 },
    { slug: 'fire_border', name: 'On Fire', cssClass: 'ring-2 ring-orange-500 animate-pulse', pointsRequired: 750, sortOrder: 5 },
    { slug: 'diamond_ring', name: 'Diamond Legend', cssClass: 'ring-4 ring-primary shadow-primary/30 shadow-xl', pointsRequired: 1000, sortOrder: 6 },
  ];

  for (const frame of frames) {
    await prisma.avatarFrame.upsert({
      where: { slug: frame.slug },
      update: {
        name: frame.name,
        cssClass: frame.cssClass,
        pointsRequired: frame.pointsRequired,
        sortOrder: frame.sortOrder,
      },
      create: frame,
    });
  }

  console.log(`  ✅ ${frames.length} avatar frames seeded`);
  console.log('🎮 Gamification seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Gamification seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
