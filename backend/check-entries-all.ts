import { prisma } from './src/config/db';

async function main() {
  console.log("=== RECENT PENDING TRANSACTIONS ===");
  const pending = await prisma.pendingTransaction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(pending, null, 2));

  console.log("\n=== RECENT TRANSACTIONS ===");
  const txs = await prisma.transaction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(txs, null, 2));

  console.log("\n=== RECENT LEDGER ENTRIES ===");
  const entries = await prisma.ledgerEntry.findMany({
    orderBy: { id: 'desc' },
    take: 10,
    include: {
      transaction: true
    }
  });
  console.log(JSON.stringify(entries.map(e => ({
    id: e.id,
    userId: e.userId,
    transactionId: e.transactionId,
    type: e.type,
    amountChange: e.amountChange,
    txCategoryId: e.transaction?.categoryId,
    txCreatorId: e.transaction?.creatorId,
    txType: e.transaction?.type
  })), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
