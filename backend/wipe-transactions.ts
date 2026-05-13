import { prisma } from './src/config/db';

async function wipeTransactions() {
  console.log('Starting wipe of transaction data...');

  try {
    console.log('Deleting all feed comments...');
    await prisma.comment.deleteMany({});
    
    console.log('Deleting all feed reactions...');
    await prisma.reaction.deleteMany({});
    
    console.log('Deleting all feed posts...');
    await prisma.feedPost.deleteMany({});

    console.log('Deleting all ledger entries...');
    await prisma.ledgerEntry.deleteMany({});

    console.log('Deleting all notifications...');
    await prisma.notification.deleteMany({});

    console.log('Deleting all transactions...');
    await prisma.transaction.deleteMany({});

    console.log('✅ Wipe completed successfully! Database is ready for clean testing.');
  } catch (error) {
    console.error('Error during wipe:', error);
  } finally {
    await prisma.$disconnect();
  }
}

wipeTransactions();
