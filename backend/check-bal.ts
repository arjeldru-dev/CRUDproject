import { prisma } from './src/config/db';

async function main() {
  const userId = 'daa969e2-c084-4a3a-a154-5505c91028f0'; // Tester3

  const receivables = await prisma.ledgerEntry.groupBy({
    by: ['friendProfileId'],
    where: {
      userId,
      type: 'RECEIVABLE',
      friendProfileId: { not: null },
    },
    _sum: { amountChange: true },
  });

  const payables = await prisma.ledgerEntry.groupBy({
    by: ['friendProfileId'],
    where: {
      userId,
      type: 'PAYABLE',
      friendProfileId: { not: null },
    },
    _sum: { amountChange: true },
  });

  console.log("Raw Receivables from Prisma:", JSON.stringify(receivables, null, 2));
  console.log("Raw Payables from Prisma:", JSON.stringify(payables, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
