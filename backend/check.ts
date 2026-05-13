import { prisma } from './src/config/db';

async function main() {
  const txs = await prisma.transaction.findMany({
    where: { type: 'EXPENSE' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      ledgerEntries: {
        include: {
          user: { select: { displayName: true } },
          friendProfile: { select: { name: true } }
        }
      }
    }
  });
  console.log(JSON.stringify(txs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
