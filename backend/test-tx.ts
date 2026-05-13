import { PrismaClient } from '@prisma/client';
// fetch is available globally in Node 18+

const prisma = new PrismaClient();

async function main() {
  // Find two users to act as A and B
  const users = await prisma.user.findMany({ take: 2 });
  if (users.length < 2) return console.log('Need 2 users');
  const [userA, userB] = users;

  // Find userA's friend profile for userB
  const friendProfile = await prisma.friendProfile.findFirst({
    where: { mainUserId: userA.id, friendUserId: userB.id }
  });

  if (!friendProfile) return console.log('Need friend profile');

  // Find a category for userA
  const category = await prisma.category.findFirst({ where: { userId: userA.id } });
  if (!category) return console.log('Need category');

  // Construct the payload the frontend would send
  const payload = {
    amount: 100,
    categoryId: category.id,
    payerId: 'self',
    splits: [
      { profileId: 'self', amount: 50 },
      { profileId: friendProfile.id, amount: 50 }
    ],
    message: 'Test Transaction'
  };

  console.log('Sending payload:', JSON.stringify(payload, null, 2));

  // We can't easily mock the auth token, so we'll just insert directly using the controller logic?
  // No, we can just look at the DB after.
}

main().catch(console.error).finally(() => prisma.$disconnect());
