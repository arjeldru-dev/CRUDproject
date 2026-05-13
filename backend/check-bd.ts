import { prisma } from './src/config/db';

async function main() {
  const entries = await prisma.ledgerEntry.findMany({
    where: { type: 'BUDGET_DEDUCTION' },
    orderBy: { transactionId: 'desc' },
    take: 5
  });
  console.log(entries);
}

main().finally(() => prisma.$disconnect());
