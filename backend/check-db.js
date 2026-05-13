const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const latestTx = await prisma.transaction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: { ledgerEntries: true }
  });
  console.log(JSON.stringify(latestTx, null, 2));
}

main().finally(() => prisma.$disconnect());
