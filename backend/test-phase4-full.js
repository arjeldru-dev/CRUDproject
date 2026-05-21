/**
 * Phase 4 COMPREHENSIVE Verification Script — Dual-Entry Engine API Core
 *
 * Covers ALL edge cases including:
 *   - Friend paid / user tagged (PAYABLE path)
 *   - Uneven splits
 *   - Boundary splits (0.0 and 1.0 with friend)
 *   - Negative/zero/missing amounts
 *   - Missing required fields
 *   - Friend profile belonging to another user (403)
 *   - Settlement with no debt
 *   - Settlement exceeding debt (overpayment)
 *   - Multiple expenses stacking
 *   - Budget across multiple categories
 *   - Registered friend budget deduction when they pay for a shared expense
 *
 * Prerequisites:
 *   1. Backend running: npm run dev (port 5000)
 *   2. Database accessible
 *
 * Run: node test-phase4-full.js
 */

const BASE = 'http://localhost:5000/api';
let passed = 0;
let failed = 0;

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  return { status: res.status, data };
}

function assert(condition, label) {
  if (condition) {
    console.log(`    ✅ ${label}`);
    passed++;
  } else {
    console.log(`    ❌ ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

async function run() {
  console.log('\n🧪 Phase 4 COMPREHENSIVE Test Suite\n');

  // ══════════════════════════════════════════════════════════════════
  //  SETUP: Create two separate users for cross-ownership tests
  // ══════════════════════════════════════════════════════════════════
  section('SETUP: Creating test users, categories, and friends');

  const ts = Date.now();
  const userA = await request('POST', '/auth/register', { email: `userA_${ts}@test.com`, password: 'Pass123!' });
  const userB = await request('POST', '/auth/register', { email: `userB_${ts}@test.com`, password: 'Pass123!' });
  assert(userA.status === 201, 'User A registered');
  assert(userB.status === 201, 'User B registered');

  const tokenA = userA.data.token;
  const tokenB = userB.data.token;
  const userAId = userA.data.user.id;
  const userBId = userB.data.user.id;

  // User A creates categories
  const catFood = await request('POST', '/categories', { name: 'Food', monthlyLimit: 5000 }, tokenA);
  const catTransport = await request('POST', '/categories', { name: 'Transport', monthlyLimit: 2000 }, tokenA);
  assert(catFood.status === 201, 'Category "Food" created for User A');
  assert(catTransport.status === 201, 'Category "Transport" created for User A');
  const foodId = catFood.data.category.id;
  const transportId = catTransport.data.category.id;

  // User B creates a category (for cross-ownership testing)
  const catBonly = await request('POST', '/categories', { name: 'B-Only', monthlyLimit: 1000 }, tokenB);
  assert(catBonly.status === 201, 'Category created for User B');
  const bOnlyCatId = catBonly.data.category.id;

  // User A creates friends (ghosts)
  const friendJuan = await request('POST', '/friends', { name: 'Juan', isGhost: true }, tokenA);
  const friendMaria = await request('POST', '/friends', { name: 'Maria', isGhost: true }, tokenA);
  assert(friendJuan.status === 201, 'Ghost friend "Juan" created');
  assert(friendMaria.status === 201, 'Ghost friend "Maria" created');
  const juanId = friendJuan.data.friend.id;
  const mariaId = friendMaria.data.friend.id;

  // User B creates a friend (for cross-ownership testing)
  const friendBonly = await request('POST', '/friends', { name: 'B-Friend', isGhost: true }, tokenB);
  assert(friendBonly.status === 201, 'Friend created for User B');
  const bOnlyFriendId = friendBonly.data.friend.id;

  // ══════════════════════════════════════════════════════════════════
  //  TEST GROUP 1: INPUT VALIDATION
  // ══════════════════════════════════════════════════════════════════
  section('TEST 1: Input Validation — Missing Fields');

  const t1a = await request('POST', '/transactions', {}, tokenA);
  assert(t1a.status === 400, 'Empty body → 400');

  const t1b = await request('POST', '/transactions', { amount: 100 }, tokenA);
  assert(t1b.status === 400, 'Only amount → 400');

  const t1c = await request('POST', '/transactions', {
    amount: 100, categoryId: foodId, payerId: 'self',
    // missing splits
  }, tokenA);
  assert(t1c.status === 400, 'Missing splits → 400');

  section('TEST 2: Input Validation — Invalid Values');

  const t2a = await request('POST', '/transactions', {
    amount: -50, categoryId: foodId, payerId: 'self', splits: [{ profileId: 'self', amount: -25 }, { profileId: juanId, amount: -25 }]
  }, tokenA);
  assert(t2a.status === 400, 'Negative amount → 400');

  const t2b = await request('POST', '/transactions', {
    amount: 0, categoryId: foodId, payerId: 'self', splits: [{ profileId: 'self', amount: 0 }, { profileId: juanId, amount: 0 }]
  }, tokenA);
  assert(t2b.status === 400, 'Zero amount → 400');

  const t2c = await request('POST', '/transactions', {
    amount: 100, categoryId: foodId, payerId: 'self', splits: [{ profileId: 'self', amount: 30 }, { profileId: juanId, amount: 50 }]
  }, tokenA);
  assert(t2c.status === 400, 'Splits sum !== amount → 400');

  const t2e = await request('POST', '/transactions', {
    amount: 'abc', categoryId: foodId, payerId: 'self', splits: [{ profileId: 'self', amount: 50 }, { profileId: juanId, amount: 50 }]
  }, tokenA);
  assert(t2e.status === 400, 'String amount → 400');

  // ══════════════════════════════════════════════════════════════════
  //  TEST GROUP 2: OWNERSHIP VALIDATION
  // ══════════════════════════════════════════════════════════════════
  section('TEST 3: Ownership — Category belongs to another user');

  const t3a = await request('POST', '/transactions', {
    amount: 100, categoryId: bOnlyCatId, payerId: 'self', splits: [{ profileId: 'self', amount: 50 }, { profileId: juanId, amount: 50 }]
  }, tokenA);
  assert(t3a.status === 403, 'User A using User B category → 403');

  section('TEST 4: Ownership — Friend profile belongs to another user');

  const t4a = await request('POST', '/transactions', {
    amount: 100, categoryId: foodId, payerId: 'self', splits: [{ profileId: 'self', amount: 50 }, { profileId: bOnlyFriendId, amount: 50 }]
  }, tokenA);
  assert(t4a.status === 403 || t4a.status === 404, 'User A tagging User B friend → 403 or 404');

  section('TEST 5: Ownership — Non-existent IDs');

  const fakeUuid = '00000000-0000-0000-0000-000000000000';

  const t5a = await request('POST', '/transactions', {
    amount: 100, categoryId: fakeUuid, payerId: 'self', splits: [{ profileId: 'self', amount: 50 }, { profileId: juanId, amount: 50 }]
  }, tokenA);
  assert(t5a.status === 404, 'Fake category ID → 404');

  const t5b = await request('POST', '/transactions', {
    amount: 100, categoryId: foodId, payerId: 'self', splits: [{ profileId: 'self', amount: 50 }, { profileId: fakeUuid, amount: 50 }]
  }, tokenA);
  assert(t5b.status === 404, 'Fake friend ID → 404');

  section('TEST 6: Auth — No token');

  const t6a = await request('POST', '/transactions', {
    amount: 100, categoryId: foodId, payerId: 'self', splits: [{ profileId: 'self', amount: 50 }, { profileId: juanId, amount: 50 }]
  });
  assert(t6a.status === 401, 'No token on POST /transactions → 401');

  const t6b = await request('GET', '/transactions/balances');
  assert(t6b.status === 401, 'No token on GET /balances → 401');

  const t6c = await request('GET', '/transactions/budget');
  assert(t6c.status === 401, 'No token on GET /budget → 401');

  const t6d = await request('POST', '/transactions/settle', { amount: 100, friendProfileId: juanId, payerId: juanId });
  assert(t6d.status === 401, 'No token on POST /settle → 401');

  // ══════════════════════════════════════════════════════════════════
  //  TEST GROUP 3: EXPENSE SCENARIOS — ALL PATHS
  // ══════════════════════════════════════════════════════════════════
  section('TEST 7: Expense — User paid, 50/50 split (RECEIVABLE path)');

  const t7 = await request('POST', '/transactions', {
    amount: 1000, categoryId: foodId, payerId: 'self', splits: [{ profileId: 'self', amount: 500 }, { profileId: juanId, amount: 500 }]
  }, tokenA);
  assert(t7.status === 201, 'Created: 201');
  assert(t7.data.transaction.type === 'EXPENSE', 'Type = EXPENSE');
  assert(t7.data.ledgerEntries.length === 2, '2 ledger entries');

  const t7budget = t7.data.ledgerEntries.find(e => e.type === 'BUDGET_DEDUCTION');
  const t7recv = t7.data.ledgerEntries.find(e => e.type === 'RECEIVABLE');
  assert(t7budget && parseFloat(t7budget.amountChange) === 1000, 'BUDGET_DEDUCTION = ₱1000 (full amount)');
  assert(t7recv && parseFloat(t7recv.amountChange) === 500, 'RECEIVABLE = ₱500 (friend owes 50%)');

  section('TEST 8: Expense — Friend paid, user tagged (PAYABLE path)');

  const t8 = await request('POST', '/transactions', {
    amount: 800, categoryId: foodId, payerId: juanId, splits: [{ profileId: 'self', amount: 400 }, { profileId: juanId, amount: 400 }]
  }, tokenA);
  assert(t8.status === 201, 'Created: 201');
  assert(t8.data.ledgerEntries.length === 1, '1 ledger entry (PAYABLE only)');

  const t8pay = t8.data.ledgerEntries.find(e => e.type === 'PAYABLE');
  const t8budget = t8.data.ledgerEntries.find(e => e.type === 'BUDGET_DEDUCTION');
  assert(t8pay && parseFloat(t8pay.amountChange) === 400, 'PAYABLE = ₱400 (user owes friend 50%)');
  assert(!t8budget, 'No BUDGET_DEDUCTION immediately for the debtor');

  section('TEST 9: Expense — Solo (user paid, user tagged, no friend)');

  const t9 = await request('POST', '/transactions', {
    amount: 300, categoryId: transportId, payerId: 'self', splits: [{ profileId: 'self', amount: 300 }]
  }, tokenA);
  assert(t9.status === 201, 'Created: 201');
  assert(t9.data.ledgerEntries.length === 1, '1 ledger entry only');
  assert(t9.data.ledgerEntries[0].type === 'BUDGET_DEDUCTION', 'Type = BUDGET_DEDUCTION');
  assert(parseFloat(t9.data.ledgerEntries[0].amountChange) === 300, 'Amount = ₱300');
  assert(t9.data.ledgerEntries[0].friendProfileId === null, 'No friend profile attached');

  section('TEST 10: Expense — Uneven split 70/30 (user pays 70%)');

  const t10 = await request('POST', '/transactions', {
    amount: 1000, categoryId: foodId, payerId: 'self', splits: [{ profileId: 'self', amount: 700 }, { profileId: juanId, amount: 300 }]
  }, tokenA);
  assert(t10.status === 201, 'Created: 201');

  const t10budget = t10.data.ledgerEntries.find(e => e.type === 'BUDGET_DEDUCTION');
  const t10recv = t10.data.ledgerEntries.find(e => e.type === 'RECEIVABLE');
  assert(t10budget && parseFloat(t10budget.amountChange) === 1000, 'BUDGET_DEDUCTION = ₱1000 (full, user paid)');
  assert(t10recv && parseFloat(t10recv.amountChange) === 300, 'RECEIVABLE = ₱300 (friend owes 30%)');

  section('TEST 11: Expense — Uneven split 30/70 (user pays 30%)');

  const t11 = await request('POST', '/transactions', {
    amount: 1000, categoryId: foodId, payerId: 'self', splits: [{ profileId: 'self', amount: 300 }, { profileId: mariaId, amount: 700 }]
  }, tokenA);
  assert(t11.status === 201, 'Created: 201');

  const t11recv = t11.data.ledgerEntries.find(e => e.type === 'RECEIVABLE');
  assert(t11recv && parseFloat(t11recv.amountChange) === 700, 'RECEIVABLE = ₱700 (Maria owes 70%)');

  section('TEST 12: Expense — splits = 0.0 self / 500 friend (friend pays everything, user paid upfront)');

  const t12 = await request('POST', '/transactions', {
    amount: 500, categoryId: foodId, payerId: 'self', splits: [{ profileId: 'self', amount: 0 }, { profileId: juanId, amount: 500 }]
  }, tokenA);
  assert(t12.status === 201, 'Created: 201');

  const t12budget = t12.data.ledgerEntries.find(e => e.type === 'BUDGET_DEDUCTION');
  const t12recv = t12.data.ledgerEntries.find(e => e.type === 'RECEIVABLE');
  assert(t12budget && parseFloat(t12budget.amountChange) === 500, 'BUDGET_DEDUCTION = ₱500 (user fronted it)');
  assert(t12recv && parseFloat(t12recv.amountChange) === 500, 'RECEIVABLE = ₱500 (friend owes ALL)');

  section('TEST 13: Expense — splits = 400 self / 0 friend with friend tagged (user pays 100%)');

  const t13 = await request('POST', '/transactions', {
    amount: 400, categoryId: foodId, payerId: 'self', splits: [{ profileId: 'self', amount: 400 }, { profileId: juanId, amount: 0 }]
  }, tokenA);
  assert(t13.status === 201, 'Created: 201');

  const t13budget = t13.data.ledgerEntries.find(e => e.type === 'BUDGET_DEDUCTION');
  const t13recv = t13.data.ledgerEntries.find(e => e.type === 'RECEIVABLE');
  assert(t13budget && parseFloat(t13budget.amountChange) === 400, 'BUDGET_DEDUCTION = ₱400 (full)');
  assert(!t13recv, 'No RECEIVABLE entry (friend owes ₱0, so no entry created)');

  // ══════════════════════════════════════════════════════════════════
  //  TEST GROUP 4: BALANCE AGGREGATION
  // ══════════════════════════════════════════════════════════════════
  section('TEST 14: Balance aggregation — multiple expenses with Juan');

  // Juan running total:
  //   Test 7: +500 RECEIVABLE (user paid 1000, 50/50)
  //   Test 8: -400 PAYABLE (juan paid 800, 50/50)
  //   Test 10: +300 RECEIVABLE (user paid 1000, 70/30)
  //   Test 12: +500 RECEIVABLE (user paid 500, 0/100)
  //   Test 13: +0 (no RECEIVABLE, user paid 100%)
  //   Net = 500 - 400 + 300 + 500 = 900

  const bal = await request('GET', '/transactions/balances', null, tokenA);
  assert(bal.status === 200, 'GET /balances → 200');

  const juanBal = bal.data.balances.find(b => b.friendProfileId === juanId);
  const mariaBal = bal.data.balances.find(b => b.friendProfileId === mariaId);

  const juanNet = juanBal ? (juanBal.receivableBalance - juanBal.payableBalance) : undefined;
  const mariaNet = mariaBal ? (mariaBal.receivableBalance - mariaBal.payableBalance) : undefined;

  assert(juanBal && juanNet === 900, `Juan net = ₱900 (got ₱${juanNet})`);
  assert(mariaBal && mariaNet === 700, `Maria net = ₱700 (got ₱${mariaNet})`);

  section('TEST 15: Balance — User B has no transactions');

  const balB = await request('GET', '/transactions/balances', null, tokenB);
  assert(balB.status === 200, 'GET /balances for User B → 200');
  assert(balB.data.balances.length === 0, 'User B has 0 balances (no transactions)');

  // ══════════════════════════════════════════════════════════════════
  //  TEST GROUP 5: BUDGET STATUS
  // ══════════════════════════════════════════════════════════════════
  section('TEST 16: Budget status — multi-category tracking');

  // Food category deductions:
  //   Test 7: 1000 (user paid, full deduction)
  //   Test 8: 0 (friend paid, user share 50% -> NO deduction yet)
  //   Test 10: 1000 (user paid, full deduction)
  //   Test 11: 1000 (user paid, full deduction — Maria)
  //   Test 12: 500 (user paid, full deduction)
  //   Test 13: 400 (user paid, full deduction)
  //   Food total = 1000 + 1000 + 1000 + 500 + 400 = 3900

  // Transport category deductions:
  //   Test 9: 300
  //   Transport total = 300

  const budget = await request('GET', '/transactions/budget', null, tokenA);
  assert(budget.status === 200, 'GET /budget → 200');

  const foodBudget = budget.data.budgetStatuses.find(b => b.categoryId === foodId);
  const transportBudget = budget.data.budgetStatuses.find(b => b.categoryId === transportId);

  assert(foodBudget && foodBudget.spent === 3900, `Food spent = ₱3900 (got ₱${foodBudget?.spent})`);
  assert(foodBudget && foodBudget.remaining === 1100, `Food remaining = ₱1100 (got ₱${foodBudget?.remaining})`);
  assert(foodBudget && foodBudget.monthlyLimit === 5000, `Food limit = ₱5000`);

  assert(transportBudget && transportBudget.spent === 300, `Transport spent = ₱300 (got ₱${transportBudget?.spent})`);
  assert(transportBudget && transportBudget.remaining === 1700, `Transport remaining = ₱1700 (got ₱${transportBudget?.remaining})`);

  // ══════════════════════════════════════════════════════════════════
  //  TEST GROUP 6: SETTLEMENT EDGE CASES
  // ══════════════════════════════════════════════════════════════════
  section('TEST 17: Settlement — basic payback');

  // Juan net was ₱900. Settle ₱400. Payer is Juan (juanId) who is paying A back.
  const settle1 = await request('POST', '/transactions/settle', {
    amount: 400, friendProfileId: juanId, payerId: juanId
  }, tokenA);
  assert(settle1.status === 201, 'Settlement created: 201');
  assert(settle1.data.transaction.type === 'SETTLEMENT', 'Type = SETTLEMENT');
  assert(settle1.data.transaction.categoryId === null, 'No category on settlement');

  // Check balance: 900 - 400 = 500
  const bal2 = await request('GET', '/transactions/balances', null, tokenA);
  const juanAfterSettle = bal2.data.balances.find(b => b.friendProfileId === juanId);
  const juanAfterSettleNet = juanAfterSettle ? (juanAfterSettle.receivableBalance - juanAfterSettle.payableBalance) : undefined;
  assert(juanAfterSettle && juanAfterSettleNet === 500, `Juan net after ₱400 settle = ₱500 (got ₱${juanAfterSettleNet})`);

  section('TEST 18: Settlement — exact full payoff');

  // Settle remaining ₱500 exactly. Payer is Juan.
  const settle2 = await request('POST', '/transactions/settle', {
    amount: 500, friendProfileId: juanId, payerId: juanId
  }, tokenA);
  assert(settle2.status === 201, 'Full settlement created: 201');

  const bal3 = await request('GET', '/transactions/balances', null, tokenA);
  const juanAfterFull = bal3.data.balances.find(b => b.friendProfileId === juanId);
  const juanAfterFullNet = juanAfterFull ? (juanAfterFull.receivableBalance - juanAfterFull.payableBalance) : undefined;
  assert(juanAfterFull && juanAfterFullNet === 0, `Juan net after full settle = ₱0 (got ₱${juanAfterFullNet})`);

  section('TEST 19: Settlement — overpayment (settling more than owed)');

  // Juan now owes ₱0. Settling ₱200 more. Payer is Juan.
  const settle3 = await request('POST', '/transactions/settle', {
    amount: 200, friendProfileId: juanId, payerId: juanId
  }, tokenA);
  assert(settle3.status === 201, 'Overpayment settlement created: 201');

  const bal4 = await request('GET', '/transactions/balances', null, tokenA);
  const juanOverpaid = bal4.data.balances.find(b => b.friendProfileId === juanId);
  const juanOverpaidNet = juanOverpaid ? (juanOverpaid.receivableBalance - juanOverpaid.payableBalance) : undefined;
  // Net was 0, settled 200 more as RECEIVABLE (negative) → net = -200
  console.log(`    ℹ️  Juan net after overpayment: ₱${juanOverpaidNet} (overpaid by ₱200)`);
  assert(juanOverpaid && juanOverpaidNet === -200, `Juan net = -₱200 (got ₱${juanOverpaidNet})`);

  section('TEST 20: Settlement — validation errors');

  const s20a = await request('POST', '/transactions/settle', {}, tokenA);
  assert(s20a.status === 400, 'Empty body → 400');

  const s20b = await request('POST', '/transactions/settle', { amount: -100, friendProfileId: juanId, payerId: juanId }, tokenA);
  assert(s20b.status === 400, 'Negative amount → 400');

  const s20c = await request('POST', '/transactions/settle', { amount: 0, friendProfileId: juanId, payerId: juanId }, tokenA);
  assert(s20c.status === 400, 'Zero amount → 400');

  const s20d = await request('POST', '/transactions/settle', { amount: 100, friendProfileId: fakeUuid, payerId: juanId }, tokenA);
  assert(s20d.status === 404, 'Fake friend ID → 404');

  const s20e = await request('POST', '/transactions/settle', { amount: 100, friendProfileId: bOnlyFriendId, payerId: bOnlyFriendId }, tokenA);
  assert(s20e.status === 403, 'User A settling User B friend → 403');

  // ══════════════════════════════════════════════════════════════════
  //  TEST GROUP 7: DATA ISOLATION
  // ══════════════════════════════════════════════════════════════════
  section('TEST 21: Data isolation — User B cannot see User A data');

  const balBcheck = await request('GET', '/transactions/balances', null, tokenB);
  assert(balBcheck.data.balances.length === 0, 'User B sees 0 balances (User A data is isolated)');

  const budgetBcheck = await request('GET', '/transactions/budget', null, tokenB);
  const bOnlyBudget = budgetBcheck.data.budgetStatuses.find(b => b.categoryId === bOnlyCatId);
  assert(bOnlyBudget && bOnlyBudget.spent === 0, 'User B "B-Only" category has ₱0 spent');
  assert(budgetBcheck.data.budgetStatuses.length === 1, 'User B sees only their 1 category');

  // ══════════════════════════════════════════════════════════════════
  //  TEST GROUP 8: REGISTERED FRIEND BUDGET DEDUCTION
  // ══════════════════════════════════════════════════════════════════
  section('TEST 22: Registered friend budget deduction (Shared expense payer gets budget deduction)');

  // 1. Send friend request User A -> User B
  const req1 = await request('POST', '/friends/request', { targetUserId: userBId }, tokenA);
  assert(req1.status === 201, 'Friend request sent User A -> User B');

  // 2. Accept friend request by User B
  const req2 = await request('POST', `/friends/request/${req1.data.request.id}/accept`, {}, tokenB);
  assert(req2.status === 200, 'Friend request accepted by User B');

  // 3. Find FriendProfile of B from User A perspective
  const friendsA = await request('GET', '/friends', null, tokenA);
  const friendProfileB = friendsA.data.friends.find(f => f.friendUserId === userBId);
  assert(friendProfileB !== undefined, 'User A has a FriendProfile for User B');
  const friendProfileBId = friendProfileB.id;

  // 4. Create category "Leisure" for both User A and User B
  const catLeisureA = await request('POST', '/categories', { name: 'Leisure', monthlyLimit: 5000 }, tokenA);
  const catLeisureB = await request('POST', '/categories', { name: 'Leisure', monthlyLimit: 5000 }, tokenB);
  assert(catLeisureA.status === 201 && catLeisureB.status === 201, 'Category "Leisure" created for both users');
  const leisureCatBId = catLeisureB.data.category.id;

  // 5. User A logs an expense transaction of amount 2000, category "Leisure", paid by User B, split 50/50
  const sharedExp = await request('POST', '/transactions', {
    amount: 2000,
    categoryId: catLeisureA.data.category.id,
    payerId: friendProfileBId, // Friend paid
    splits: [
      { profileId: 'self', amount: 1000 },
      { profileId: friendProfileBId, amount: 1000 }
    ],
    message: 'Coachella tickets'
  }, tokenA);

  assert(sharedExp.status === 202, 'Expense transaction returns 202 Accepted (Pending Approval)');
  assert(sharedExp.data.status === 'PENDING_APPROVAL', 'Response status is PENDING_APPROVAL');

  // 6. User B fetches pending transactions
  const pendingB = await request('GET', '/transactions/pending', null, tokenB);
  assert(pendingB.status === 200, 'User B fetched pending transactions successfully');
  assert(pendingB.data.pendingTransactions.length === 1, 'User B has exactly 1 pending transaction');
  const pendingTxId = pendingB.data.pendingTransactions[0].id;
  assert(Number(pendingB.data.pendingTransactions[0].amount) === 2000, 'Pending transaction amount is 2000');

  // 7. User B approves the pending transaction and selects category "Leisure"
  const approveRes = await request('POST', `/transactions/pending/${pendingTxId}/respond`, {
    action: 'APPROVE',
    categoryId: leisureCatBId
  }, tokenB);
  assert(approveRes.status === 200, 'User B approved the transaction request');

  // 8. Verify User B budget deduction: B paid the total 2000 upfront, so B's budget should decrease by 2000
  const budgetB = await request('GET', '/transactions/budget', null, tokenB);
  const leisureBudgetB = budgetB.data.budgetStatuses.find(b => b.categoryId === leisureCatBId);
  assert(leisureBudgetB && leisureBudgetB.spent === 2000, `User B leisure budget spent = ₱2000 (got ₱${leisureBudgetB?.spent})`);

  // 9. Rejection flow test
  const sharedExp2 = await request('POST', '/transactions', {
    amount: 500,
    categoryId: catLeisureA.data.category.id,
    payerId: friendProfileBId,
    splits: [
      { profileId: 'self', amount: 250 },
      { profileId: friendProfileBId, amount: 250 }
    ],
    message: 'Dinner'
  }, tokenA);
  assert(sharedExp2.status === 202, 'Second transaction returns 202 Accepted (Pending Approval)');

  const pendingB2 = await request('GET', '/transactions/pending', null, tokenB);
  const pendingTxId2 = pendingB2.data.pendingTransactions[0].id;

  const rejectRes = await request('POST', `/transactions/pending/${pendingTxId2}/respond`, {
    action: 'REJECT'
  }, tokenB);
  assert(rejectRes.status === 200, 'User B rejected the transaction request');

  const pendingB3 = await request('GET', '/transactions/pending', null, tokenB);
  assert(pendingB3.data.pendingTransactions.length === 0, 'No more pending transactions for User B');

  // ══════════════════════════════════════════════════════════════════
  //  FINAL RESULTS
  // ══════════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  🏁 RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'═'.repeat(60)}\n`);

  if (failed > 0) {
    console.log('⚠️  Some tests failed! Review the ❌ markers above.\n');
    process.exit(1);
  } else {
    console.log('🎉 All tests passed! Phase 4 engine is battle-tested.\n');
  }
}

run().catch(console.error);
