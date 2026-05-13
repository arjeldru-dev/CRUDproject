import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ take: 2 });
  if (users.length < 2) return console.log('Need 2 users');
  const [userA, userB] = users;

  const category = await prisma.category.findFirst({ where: { userId: userA.id } });
  if (!category) return console.log('Need category');

  // Let's manually trigger the logic used in transactionController
  const amount = 100;
  const payerId = 'self';
  const splits = [
    { profileId: 'self', amount: 50 },
    { profileId: 'some-friend-id', amount: 50 }
  ];
  
  const userId = userA.id;
  const userIsPayer = payerId === userId || payerId === 'self';

  console.log('userIsPayer:', userIsPayer);
  
  const userSplit = splits.find((s: any) => s.profileId === userId || s.profileId === 'self');
  console.log('userSplit:', userSplit);
  
  const userShare = userSplit && userSplit.amount > 0 ? Number(userSplit.amount) : 0;
  console.log('userShare:', userShare);
}

main().catch(console.error).finally(() => prisma.$disconnect());
