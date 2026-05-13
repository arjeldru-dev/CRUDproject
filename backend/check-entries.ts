import { prisma } from './src/config/db';

async function main() {
  const userId = 'daa969e2-c084-4a3a-a154-5505c91028f0'; // Tester3

  const entries = await prisma.ledgerEntry.findMany({
    where: { userId, type: 'RECEIVABLE' },
    select: { amountChange: true, transactionId: true }
  });

  console.log("Tester3 RECEIVABLE entries:", JSON.stringify(entries, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
