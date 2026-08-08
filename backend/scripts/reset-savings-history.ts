/**
 * One-off script: Reset savings history for a specific user.
 *
 * 1. Deletes all SavingsUsage rows and their linked Transaction + LedgerEntry records.
 * 2. Resets `enabledAt` in SavingsSettings to NOW — this zeroes out the computed
 *    accrued savings because only closed periods AFTER enabledAt contribute.
 *
 * Usage:
 *   npx ts-node scripts/reset-savings-history.ts
 */

import { prisma } from '../src/config/db';

const TARGET_USERNAME = 'arjeldru_dev';

async function main() {
  // 1. Look up the user
  const user = await prisma.user.findUnique({
    where: { username: TARGET_USERNAME },
    select: { id: true, username: true, displayName: true },
  });

  if (!user) {
    console.error(`❌ User "${TARGET_USERNAME}" not found.`);
    process.exit(1);
  }

  console.log(`🔍 Found user: ${user.displayName ?? user.username} (${user.id})`);

  // 2. Fetch all SavingsUsage rows for this user (we need the transactionIds)
  const usages = await prisma.savingsUsage.findMany({
    where: { userId: user.id },
    select: { id: true, transactionId: true, amount: true, kind: true, createdAt: true },
  });

  const transactionIds = usages.map((u) => u.transactionId);

  // 3. Delete usages + reset enabledAt in a single transaction
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // 3a. Delete LedgerEntries tied to savings transactions
    const deletedLedger = transactionIds.length > 0
      ? await tx.ledgerEntry.deleteMany({ where: { transactionId: { in: transactionIds } } })
      : { count: 0 };

    // 3b. Delete SavingsUsage rows
    const deletedUsages = await tx.savingsUsage.deleteMany({
      where: { userId: user.id },
    });

    // 3c. Delete the linked Transactions
    const deletedTxns = transactionIds.length > 0
      ? await tx.transaction.deleteMany({ where: { id: { in: transactionIds } } })
      : { count: 0 };

    // 3d. Reset enabledAt to NOW — this zeroes out accrued savings
    //     because only closed periods after enabledAt contribute to the balance.
    const updatedSettings = await tx.savingsSettings.updateMany({
      where: { userId: user.id },
      data: { enabledAt: now },
    });

    return {
      deletedLedger: deletedLedger.count,
      deletedUsages: deletedUsages.count,
      deletedTxns: deletedTxns.count,
      settingsReset: updatedSettings.count,
    };
  });

  console.log(`\n🗑️  Deleted:`);
  console.log(`   • ${result.deletedUsages} savings usage(s)`);
  console.log(`   • ${result.deletedTxns} linked transaction(s)`);
  console.log(`   • ${result.deletedLedger} ledger entry/entries`);
  console.log(`\n🔄 Reset enabledAt to ${now.toISOString()}`);
  console.log(`   (${result.settingsReset} settings row(s) updated)`);
  console.log(`\n✅ Savings fully reset for @${TARGET_USERNAME} — accrued balance is now ₱0.`);
}

main()
  .catch((err) => {
    console.error('💥 Script failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
