import { prisma } from './src/config/db';
import { Prisma } from '@prisma/client';

async function main() {
  const users = await prisma.user.findMany({ take: 2 });
  const [userA, userB] = users;

  const friendProfile = await prisma.friendProfile.findFirst({
    where: { mainUserId: userA.id, friendUserId: userB.id }
  });
  const category = await prisma.category.findFirst({ where: { userId: userA.id } });

  const userId = userA.id;
  const amount = 100;
  const categoryId = category?.id;
  const payerId = 'self';
  const splits = [
    { profileId: 'self', amount: 50 },
    { profileId: friendProfile?.id, amount: 50 }
  ];

  // Try logic:
  const userSplit = splits.find((s: any) => s.profileId === userId || s.profileId === 'self');
  console.log('userSplit:', userSplit);
  const userShare = userSplit && userSplit.amount > 0 ? new Prisma.Decimal(userSplit.amount) : new Prisma.Decimal(0);
  
  console.log('userShare:', userShare.toString(), userShare.greaterThan(0));
}

main().finally(() => prisma.$disconnect());
