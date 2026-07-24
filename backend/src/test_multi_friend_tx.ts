import './middleware/requireAuth';
import { prisma } from './config/db';
import { createExpenseTransaction, respondToPendingTransaction, getPendingTransactions } from './controllers/transactionController';
import { Prisma } from '@prisma/client';

async function runTests() {
  console.log('🧪 Starting Multi-Friend Transaction Group Approval Regression Tests...');

  // 1. Setup clean test users
  const emails = {
    creator: 'test_creator@example.com',
    friendB: 'test_friend_b@example.com',
    friendC: 'test_friend_c@example.com',
  };

  // Cleanup old records to prevent constraint issues
  await cleanup(emails.creator, emails.friendB, emails.friendC);

  console.log('👤 Creating test users...');
  const creator = await prisma.user.create({
    data: {
      username: 'test_creator_' + Date.now(),
      email: emails.creator,
      passwordHash: 'dummy_hash',
      displayName: 'Creator User',
    },
  });

  const friendB = await prisma.user.create({
    data: {
      username: 'test_friend_b_' + Date.now(),
      email: emails.friendB,
      passwordHash: 'dummy_hash',
      displayName: 'Friend B',
    },
  });

  const friendC = await prisma.user.create({
    data: {
      username: 'test_friend_c_' + Date.now(),
      email: emails.friendC,
      passwordHash: 'dummy_hash',
      displayName: 'Friend C',
    },
  });

  // Create Category for creator
  const category = await prisma.category.create({
    data: {
      userId: creator.id,
      name: 'Test Category',
      limitAmount: 1000.0,
    },
  });

  // Create Friend Profiles
  const profileB = await prisma.friendProfile.create({
    data: {
      mainUserId: creator.id,
      friendUserId: friendB.id,
      name: 'Friend B Profile',
      isGhost: false,
    },
  });

  const profileC = await prisma.friendProfile.create({
    data: {
      mainUserId: creator.id,
      friendUserId: friendC.id,
      name: 'Friend C Profile',
      isGhost: false,
    },
  });

  try {
    // --- Test Case 1: Multiple Approvals and Successful Completion ---
    console.log('\n--- Test Case 1: Multi-Friend Split (Group Approvals) ---');

    let responseCode: any = 0;
    let responseData: any = null;

    const mockRes = {
      status: (code: any) => {
        responseCode = code;
        return {
          json: (data: any) => {
            responseData = data;
          },
        };
      },
    } as any;

    // Log a 300 PHP expense split equally between creator, Friend B, and Friend C
    const createReq = {
      user: { id: creator.id },
      body: {
        amount: 300.0,
        categoryId: category.id,
        payerId: 'self',
        splits: [
          { profileId: 'self', amount: 100.0 },
          { profileId: profileB.id, amount: 100.0 },
          { profileId: profileC.id, amount: 100.0 },
        ],
        message: 'Equal test split',
        isPrivate: false,
        allowFriendToPrivate: true,
      },
    } as any;

    await createExpenseTransaction(createReq, mockRes);

    if (responseCode !== 202) {
      throw new Error(`Expected create status 202, got ${responseCode}. Data: ${JSON.stringify(responseData)}`);
    }

    console.log('✅ Expense creation returned 202 (Pending Approval)');

    // Verify 2 PendingTransactions were created with same groupId
    const pendingTxs = await prisma.pendingTransaction.findMany({
      where: { creatorId: creator.id },
    });

    if (pendingTxs.length !== 2) {
      throw new Error(`Expected 2 pending transactions, got ${pendingTxs.length}`);
    }

    const [tx1, tx2] = pendingTxs as any[];
    if (!tx1.groupId || tx1.groupId !== tx2.groupId) {
      throw new Error(`GroupId mismatch: tx1.groupId=${tx1.groupId}, tx2.groupId=${tx2.groupId}`);
    }

    console.log(`✅ Verified both pending transactions share groupId: ${tx1.groupId}`);

    // Reset code/data for next call
    responseCode = 0;
    responseData = null;

    // Friend B Approves
    const approveReqB = {
      user: { id: friendB.id },
      params: { id: tx1.payerUserId === friendB.id ? tx1.id : tx2.id },
      body: { action: 'APPROVE' },
    } as any;

    await respondToPendingTransaction(approveReqB, mockRes);

    if (responseCode !== 200 || responseData?.status !== 'WAITING_FOR_OTHERS') {
      throw new Error(`Expected first approval to wait, got status ${responseCode}. Data: ${JSON.stringify(responseData)}`);
    }

    console.log('✅ Friend B approval recorded, returned WAITING_FOR_OTHERS');

    // Verify no Transaction or Ledger entries created yet
    let dbTransactions = await prisma.transaction.findMany({ where: { creatorId: creator.id } });
    if (dbTransactions.length !== 0) {
      throw new Error(`Transaction created prematurely: ${JSON.stringify(dbTransactions)}`);
    }

    const dbLedgers = await prisma.ledgerEntry.findMany({ where: { userId: creator.id } });
    if (dbLedgers.length !== 0) {
      throw new Error(`Ledger entries created prematurely: ${JSON.stringify(dbLedgers)}`);
    }

    console.log('✅ Verified no database transactions or ledger entries created after first approval');

    // Reset code/data for next call
    responseCode = 0;
    responseData = null;

    // Friend C Approves (the final approval)
    const approveReqC = {
      user: { id: friendC.id },
      params: { id: tx1.payerUserId === friendC.id ? tx1.id : tx2.id },
      body: { action: 'APPROVE' },
    } as any;

    await respondToPendingTransaction(approveReqC, mockRes);

    if (responseCode !== 200 || responseData?.message?.includes('Waiting')) {
      throw new Error(`Expected final approval to complete, got status ${responseCode}. Data: ${JSON.stringify(responseData)}`);
    }

    console.log('✅ Friend C approval recorded, transaction completed successfully');

    // Verify exactly one Transaction was created
    dbTransactions = await prisma.transaction.findMany({ where: { creatorId: creator.id } });
    if (dbTransactions.length !== 1) {
      throw new Error(`Expected exactly 1 transaction, got ${dbTransactions.length}`);
    }

    const createdTx = dbTransactions[0];
    if (Number(createdTx.totalAmount) !== 300.0) {
      throw new Error(`Expected transaction amount 300, got ${createdTx.totalAmount}`);
    }

    console.log(`✅ Verified exactly 1 transaction created with totalAmount: ${createdTx.totalAmount}`);

    // Verify ledger entries for creator User A
    // Expected: BUDGET_DEDUCTION of 300, RECEIVABLE from B of 100, RECEIVABLE from C of 100
    const creatorLedgers = await prisma.ledgerEntry.findMany({
      where: { userId: creator.id, transactionId: createdTx.id },
    });

    const budgetDeduction = creatorLedgers.find(l => l.type === 'BUDGET_DEDUCTION');
    const receivables = creatorLedgers.filter(l => l.type === 'RECEIVABLE');

    if (!budgetDeduction || Number(budgetDeduction.amountChange) !== 300.0) {
      throw new Error(`Invalid budget deduction for creator: ${JSON.stringify(budgetDeduction)}`);
    }

    if (receivables.length !== 2) {
      throw new Error(`Expected 2 receivables for creator, got ${receivables.length}`);
    }

    for (const rec of receivables) {
      if (Number(rec.amountChange) !== 100.0) {
        throw new Error(`Expected receivable amount 100, got ${rec.amountChange}`);
      }
    }

    console.log('✅ Verified creator ledger entries: 300 BUDGET_DEDUCTION, and 2x 100 RECEIVABLE');

    // Verify feed posts
    const feedPosts = await prisma.feedPost.findMany({
      where: { userId: creator.id, content: { contains: createdTx.id } },
    });

    if (feedPosts.length !== 1) {
      throw new Error(`Expected exactly 1 feed post, got ${feedPosts.length}`);
    }

    console.log('✅ Verified exactly 1 feed post created (no duplicates!)');

    // --- Test Case 2: Rejection cancels all pending transactions in group ---
    console.log('\n--- Test Case 2: Group Rejection ---');

    // Clean up from Case 1
    await prisma.pendingTransaction.deleteMany({ where: { creatorId: creator.id } });

    // Reset code/data for next call
    responseCode = 0;
    responseData = null;

    // Create a new expense split
    await createExpenseTransaction(createReq, mockRes);
    const newPendingTxs = await prisma.pendingTransaction.findMany({
      where: { creatorId: creator.id },
    });

    const [newTx1, newTx2] = newPendingTxs;

    // Reset code/data for next call
    responseCode = 0;
    responseData = null;

    // Friend B Rejects
    const rejectReqB = {
      user: { id: friendB.id },
      params: { id: newTx1.payerUserId === friendB.id ? newTx1.id : newTx2.id },
      body: { action: 'REJECT' },
    } as any;

    await respondToPendingTransaction(rejectReqB, mockRes);

    if (responseCode !== 200) {
      throw new Error(`Expected reject status 200, got ${responseCode}`);
    }

    // Verify BOTH pending transactions are now marked REJECTED
    const finalPendingTxs = await prisma.pendingTransaction.findMany({
      where: { creatorId: creator.id },
    });

    for (const t of finalPendingTxs) {
      if (t.status !== 'REJECTED') {
        throw new Error(`Expected transaction to be REJECTED, but was ${t.status}: ${JSON.stringify(t)}`);
      }
    }

    console.log('✅ Verified rejection of one pending transaction rejects all related group transactions');

    // --- Test Case 3: Creator splits but Friend B pays ---
    console.log('\n--- Test Case 3: Creator splits but Friend B pays ---');

    // Clean up from Case 2
    await prisma.pendingTransaction.deleteMany({ where: { creatorId: creator.id } });

    // Creator Category for Friend B
    const categoryB = await prisma.category.create({
      data: {
        userId: friendB.id,
        name: 'Friend B Category',
        limitAmount: 1000.0,
      },
    });

    responseCode = 0;
    responseData = null;

    // Log a 300 PHP expense split equally between creator, Friend B, and Friend C, where Friend B paid
    const createReqCase3 = {
      user: { id: creator.id },
      body: {
        amount: 300.0,
        categoryId: category.id,
        payerId: profileB.id, // Friend B paid!
        splits: [
          { profileId: 'self', amount: 100.0 },
          { profileId: profileB.id, amount: 100.0 },
          { profileId: profileC.id, amount: 100.0 },
        ],
        message: 'B paid split test',
        isPrivate: false,
        allowFriendToPrivate: true,
      },
    } as any;

    await createExpenseTransaction(createReqCase3, mockRes);

    if (responseCode !== 202) {
      throw new Error(`Expected create status 202, got ${responseCode}. Data: ${JSON.stringify(responseData)}`);
    }

    console.log('✅ Friend-paid expense creation returned 202 (Pending Approval)');

    // Verify 2 PendingTransactions were created
    const pendingTxsCase3 = await prisma.pendingTransaction.findMany({
      where: { creatorId: creator.id, status: 'PENDING' },
    });

    if (pendingTxsCase3.length !== 2) {
      throw new Error(`Expected 2 pending transactions, got ${pendingTxsCase3.length}`);
    }

    console.log(`✅ Verified 2 pending transactions exist for B and C`);

    // Let's retrieve pending transactions as B to verify categoryRequired is true, and check userShare
    const getPendingReqB = {
      user: { id: friendB.id },
    } as any;

    responseCode = 0;
    responseData = null;

    await getPendingTransactions(getPendingReqB, mockRes);
    if (responseCode !== 200) {
      throw new Error(`Expected 200 getting pending for B, got ${responseCode}`);
    }

    const bPending = responseData.pendingTransactions.find((tx: any) => tx.payerUserId === friendB.id);
    if (!bPending || bPending.categoryRequired !== true || bPending.userShare !== 100) {
      throw new Error(`Invalid pending data for B: ${JSON.stringify(bPending)}`);
    }
    console.log('✅ Friend B successfully retrieved pending transaction with categoryRequired = true and userShare = 100');

    // Retrieve pending transactions as C to verify categoryRequired is false, and check userShare
    const getPendingReqC = {
      user: { id: friendC.id },
    } as any;

    responseCode = 0;
    responseData = null;

    await getPendingTransactions(getPendingReqC, mockRes);
    if (responseCode !== 200) {
      throw new Error(`Expected 200 getting pending for C, got ${responseCode}`);
    }

    const cPending = responseData.pendingTransactions.find((tx: any) => tx.payerUserId === friendC.id);
    if (!cPending || cPending.categoryRequired !== false || cPending.userShare !== 100) {
      throw new Error(`Invalid pending data for C: ${JSON.stringify(cPending)}`);
    }
    console.log('✅ Friend C successfully retrieved pending transaction with categoryRequired = false and userShare = 100');

    // Reset code/data
    responseCode = 0;
    responseData = null;

    // Friend C Approves (C does NOT require categoryId)
    const approveReqCase3C = {
      user: { id: friendC.id },
      params: { id: cPending.id },
      body: { action: 'APPROVE' },
    } as any;

    await respondToPendingTransaction(approveReqCase3C, mockRes);

    if (responseCode !== 200 || responseData?.status !== 'WAITING_FOR_OTHERS') {
      throw new Error(`Expected first approval from C to wait, got status ${responseCode}. Data: ${JSON.stringify(responseData)}`);
    }

    console.log('✅ Friend C approval recorded (without category), returned WAITING_FOR_OTHERS');

    // Reset code/data
    responseCode = 0;
    responseData = null;

    // Friend B Approves (B requires categoryId, should fail if not provided)
    const approveReqCase3BNoCat = {
      user: { id: friendB.id },
      params: { id: bPending.id },
      body: { action: 'APPROVE' },
    } as any;

    await respondToPendingTransaction(approveReqCase3BNoCat, mockRes);
    if (responseCode !== 400) {
      throw new Error(`Expected 400 for B approving without category, got ${responseCode}`);
    }
    console.log('✅ Friend B approval correctly rejected with 400 when categoryId is missing');

    // Reset code/data
    responseCode = 0;
    responseData = null;

    // Friend B Approves with categoryId
    const approveReqCase3BWithCat = {
      user: { id: friendB.id },
      params: { id: bPending.id },
      body: { action: 'APPROVE', categoryId: categoryB.id },
    } as any;

    await respondToPendingTransaction(approveReqCase3BWithCat, mockRes);
    if (responseCode !== 200 || responseData?.message?.includes('Waiting')) {
      throw new Error(`Expected final approval from B to complete, got status ${responseCode}. Data: ${JSON.stringify(responseData)}`);
    }
    console.log('✅ Friend B approval completed successfully with category ID');

    // Clean up categoryB
    await prisma.category.deleteMany({ where: { id: categoryB.id } });

    console.log('\n🎉 ALL multi-friend transaction regression tests PASSED successfully!');
  } catch (error) {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  } finally {
    // Final cleanup of test data
    console.log('\n🧠 Cleaning up test data...');
    await cleanup(emails.creator, emails.friendB, emails.friendC);
  }
}

async function cleanup(creatorEmail: string, bEmail: string, cEmail: string) {
  const users = await prisma.user.findMany({
    where: { email: { in: [creatorEmail, bEmail, cEmail] } },
  });

  const userIds = users.map(u => u.id);

  if (userIds.length > 0) {
    await prisma.feedPost.deleteMany({ where: { userId: { in: inArrayOrNone(userIds) } } });
    await prisma.ledgerEntry.deleteMany({ where: { userId: { in: inArrayOrNone(userIds) } } });
    await prisma.transaction.deleteMany({ where: { creatorId: { in: inArrayOrNone(userIds) } } });
    await prisma.pendingTransaction.deleteMany({ where: { creatorId: { in: inArrayOrNone(userIds) } } });
    await prisma.friendProfile.deleteMany({ where: { mainUserId: { in: inArrayOrNone(userIds) } } });
    await prisma.category.deleteMany({ where: { userId: { in: inArrayOrNone(userIds) } } });
    await prisma.user.deleteMany({ where: { id: { in: inArrayOrNone(userIds) } } });
  }
}

function inArrayOrNone(arr: string[]) {
  return arr.length > 0 ? arr : [];
}

runTests();
