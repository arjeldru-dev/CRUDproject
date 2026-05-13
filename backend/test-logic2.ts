import { prisma } from './src/config/db';
import { Prisma } from '@prisma/client';

async function main() {
  const amount = 100;
  const userId = '6e6d22a9-775e-4ff1-a0c9-e490bbd4a994'; // The user ID from db
  const splits = [
    { profileId: 'self', amount: 50 },
    { profileId: 'a751783c-ffc7-42a4-bf20-8feb78e3bffe', amount: 50 }
  ];

  const userIsPayer = true;

  const ledgerEntries: Prisma.LedgerEntryCreateManyInput[] = [];
  const totalDecimal = new Prisma.Decimal(amount);

  if (userIsPayer) {
    const userSplit = splits.find((s: any) => s.profileId === userId || s.profileId === 'self');
    const userShare = userSplit && userSplit.amount > 0 ? new Prisma.Decimal(userSplit.amount) : new Prisma.Decimal(0);

    console.log('userShare:', userShare.toString(), userShare.greaterThan(0));

    if (userShare.greaterThan(0)) {
      ledgerEntries.push({
        transactionId: 'dummy',
        userId,
        friendProfileId: null,
        amountChange: userShare,
        type: 'BUDGET_DEDUCTION',
      });
    }

    for (const split of splits) {
      if (split.profileId === userId || split.profileId === 'self') continue;
      if (split.amount <= 0) continue;

      const friendShare = new Prisma.Decimal(split.amount);
      console.log('friendShare:', friendShare.toString());
      ledgerEntries.push({
        transactionId: 'dummy',
        userId,
        friendProfileId: split.profileId,
        amountChange: friendShare,
        type: 'RECEIVABLE',
      });
    }
  }

  console.log(JSON.stringify(ledgerEntries, null, 2));
}

main().catch(console.error);
