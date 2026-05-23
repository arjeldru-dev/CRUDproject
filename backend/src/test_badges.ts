import { prisma } from './config/db';
import { gamificationService } from './services/gamificationService';

async function runTests() {
  console.log('🧪 Starting badge evaluation automated tests...');
  
  // Find or create a test user
  let user = await prisma.user.findFirst({
    where: { email: 'test_badges@example.com' },
  });
  
  if (!user) {
    user = await prisma.user.create({
      data: {
        username: 'test_badges_user',
        email: 'test_badges@example.com',
        passwordHash: 'dummy_hash',
        displayName: 'Test Badge User',
      },
    });
    console.log(`👤 Created temporary test user with ID: ${user.id}`);
  } else {
    console.log(`👤 Found existing test user with ID: ${user.id}`);
  }

  try {
    // 1. Check get or ensure gamification profile works
    const profile = await gamificationService.ensureGamificationProfile(user.id);
    console.log('✅ ensureGamificationProfile succeeded:', { totalPoints: profile.totalPoints, longestStreak: profile.longestStreak });

    // Clean up any existing test user badges, transactions, friendships, and participations
    await prisma.userBadge.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { creatorId: user.id } });
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: user.id }, { userBId: user.id }] } });
    await prisma.challengeParticipant.deleteMany({ where: { userId: user.id } });
    await prisma.challenge.deleteMany({ where: { creatorId: user.id } });

    console.log('🧹 Cleaned up existing test data.');

    // Let's run a test for expense count badge trigger!
    console.log('\n--- Test Case 1: First Expense Badge ---');
    // Ensure "first_expense" badge is seeded
    const firstExpenseBadge = await prisma.badge.findFirst({ where: { slug: 'first_expense' } });
    if (!firstExpenseBadge) {
      throw new Error('first_expense badge not seeded in the database. Please run npm run seed:gamification first.');
    }

    // Evaluate before expense
    let awarded = await gamificationService.evaluateAndAwardBadges(user.id);
    console.log(`- Awards before logging expense (expected 0): ${awarded.length}`);
    if (awarded.length !== 0) throw new Error('Badges awarded prematurely');

    // Create an expense
    await prisma.transaction.create({
      data: {
        creatorId: user.id,
        type: 'EXPENSE',
        totalAmount: 10.0,
      },
    });
    console.log('- Created 1 expense transaction');

    // Evaluate after expense
    awarded = await gamificationService.evaluateAndAwardBadges(user.id);
    console.log(`- Awards after logging expense (expected 1): ${awarded.length}`);
    if (awarded.length !== 1) throw new Error('Expense badge was not awarded');
    console.log(`🏆 Successfully awarded badge: ${firstExpenseBadge.name}`);

    // Let's run a test for friends count badge trigger!
    console.log('\n--- Test Case 2: Social Butterfly Badge ---');
    const socialButterflyBadge = await prisma.badge.findFirst({ where: { slug: 'social_butterfly' } });
    if (socialButterflyBadge) {
      // Evaluate before having friends
      awarded = await gamificationService.evaluateAndAwardBadges(user.id);
      console.log(`- Awards before adding friends (expected 0): ${awarded.length}`);

      // Create 5 dummy users to be friends
      const friends = [];
      for (let i = 0; i < 5; i++) {
        const friend = await prisma.user.create({
          data: {
            username: `badge_friend_${i}_${Date.now()}`,
            email: `badge_friend_${i}_${Date.now()}@example.com`,
            passwordHash: 'dummy_hash',
            displayName: `Friend ${i}`,
          },
        });
        friends.push(friend);
        
        await prisma.friendship.create({
          data: {
            userAId: user.id < friend.id ? user.id : friend.id,
            userBId: user.id < friend.id ? friend.id : user.id,
          },
        });
      }
      console.log('- Created 5 friendships');

      // Evaluate after having 5 friends
      awarded = await gamificationService.evaluateAndAwardBadges(user.id);
      console.log(`- Awards after adding 5 friends (expected 1): ${awarded.length}`);
      if (awarded.length !== 1) throw new Error('Social Butterfly badge was not awarded');
      console.log(`🏆 Successfully awarded badge: ${socialButterflyBadge.name}`);

      // Clean up the dummy friends
      for (const friend of friends) {
        await prisma.friendship.deleteMany({ where: { OR: [{ userAId: friend.id }, { userBId: friend.id }] } });
        await prisma.user.delete({ where: { id: friend.id } });
      }
    }

    console.log('\n--- Test Case 3: N+1 Performance & Challenge Creator Badge ---');
    const challengeCreatorBadge = await prisma.badge.findFirst({ where: { slug: 'challenge_creator_1' } });
    if (challengeCreatorBadge) {
      // Create a challenge
      await prisma.challenge.create({
        data: {
          creatorId: user.id,
          type: 'CUSTOM',
          name: 'Test Challenge',
          description: 'A test challenge',
          startDate: new Date(),
          endDate: new Date(),
          status: 'ACTIVE',
        },
      });
      console.log('- Created 1 challenge');

      // Measure performance of evaluation
      const startTime = performance.now();
      awarded = await gamificationService.evaluateAndAwardBadges(user.id);
      const endTime = performance.now();
      console.log(`- Awards after challenge creation (expected 1): ${awarded.length}`);
      console.log(`⚡ Badge evaluation execution time: ${(endTime - startTime).toFixed(2)}ms`);
      if (awarded.length !== 1) throw new Error('Challenge Creator badge was not awarded');
      console.log(`🏆 Successfully awarded badge: ${challengeCreatorBadge.name}`);
    }

    console.log('\n🎉 ALL automated test cases PASSED successfully!');
  } catch (error) {
    console.error('\n❌ Test execution failed with error:', error);
    process.exit(1);
  } finally {
    // Clean up test user completely
    await prisma.userBadge.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { creatorId: user.id } });
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: user.id }, { userBId: user.id }] } });
    await prisma.challengeParticipant.deleteMany({ where: { userId: user.id } });
    await prisma.challenge.deleteMany({ where: { creatorId: user.id } });
    await prisma.userGamification.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log('\n🧹 Final cleanup of temporary test user completed.');
  }
}

runTests();
