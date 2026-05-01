/**
 * Phase 4 Verification Script — Dual-Entry Engine API Core
 *
 * Prerequisites:
 *   1. Backend running: npm run dev (port 5000)
 *   2. Database accessible with Phase 1-3 schema applied
 *
 * Run: node test-phase4.js
 */

const BASE = 'http://localhost:5000/api';

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
    console.log(`  ✅ ${label}`);
  } else {
    console.log(`  ❌ ${label}`);
  }
}

async function run() {
  console.log('\n🧪 Phase 4 Verification: Dual-Entry Engine API Core\n');

  // ── Step 1: Register + Login ─────────────────────────────────────
  const email = `phase4test_${Date.now()}@test.com`;
  const password = 'TestPass123!';

  console.log('1. Setting up test user...');
  const regRes = await request('POST', '/auth/register', { email, password });
  assert(regRes.status === 201, `Register: ${regRes.status}`);
  const token = regRes.data.token;
  const userId = regRes.data.user?.id;
  console.log(`   User ID: ${userId}\n`);

  // ── Step 2: Create a Category ────────────────────────────────────
  console.log('2. Creating test category...');
  const catRes = await request('POST', '/categories', { name: 'Food', monthlyLimit: 5000 }, token);
  assert(catRes.status === 201, `Category created: ${catRes.status}`);
  const categoryId = catRes.data.category?.id;
  console.log(`   Category ID: ${categoryId}\n`);

  // ── Step 3: Create a Ghost Friend ────────────────────────────────
  console.log('3. Creating ghost friend...');
  const friendRes = await request('POST', '/friends', { name: 'Juan', isGhost: true }, token);
  assert(friendRes.status === 201, `Friend created: ${friendRes.status}`);
  const friendId = friendRes.data.friend?.id;
  console.log(`   Friend ID: ${friendId}\n`);

  // ── Step 4: Create Expense (User paid, 50/50 split) ──────────────
  console.log('4. Creating expense: ₱1000, 50/50 split (user paid)...');
  const expRes = await request('POST', '/transactions', {
    amount: 1000,
    categoryId,
    payerId: userId,
    taggieId: friendId,
    splitRatio: 0.5,
  }, token);
  assert(expRes.status === 201, `Expense created: ${expRes.status}`);
  assert(expRes.data.transaction?.type === 'EXPENSE', `Type is EXPENSE`);
  assert(expRes.data.ledgerEntries?.length >= 2, `At least 2 ledger entries created (got ${expRes.data.ledgerEntries?.length})`);
  console.log('   Transaction:', JSON.stringify(expRes.data.transaction, null, 2));
  console.log('   Ledger Entries:', JSON.stringify(expRes.data.ledgerEntries, null, 2));
  console.log('');

  // ── Step 5: Create Solo Expense ──────────────────────────────────
  console.log('5. Creating solo expense: ₱200, no split...');
  const soloRes = await request('POST', '/transactions', {
    amount: 200,
    categoryId,
    payerId: userId,
    taggieId: userId,
    splitRatio: 1.0,
  }, token);
  assert(soloRes.status === 201, `Solo expense created: ${soloRes.status}`);
  assert(soloRes.data.ledgerEntries?.length === 1, `1 ledger entry (BUDGET_DEDUCTION only)`);
  console.log('');

  // ── Step 6: Test 403 on wrong category ───────────────────────────
  console.log('6. Testing 403 with fake category ID...');
  const fakeRes = await request('POST', '/transactions', {
    amount: 100,
    categoryId: '00000000-0000-0000-0000-000000000000',
    payerId: userId,
    taggieId: friendId,
    splitRatio: 0.5,
  }, token);
  assert(fakeRes.status === 404 || fakeRes.status === 403, `Rejected: ${fakeRes.status}`);
  console.log('');

  // ── Step 7: Test 401 without token ───────────────────────────────
  console.log('7. Testing 401 without auth token...');
  const noAuthRes = await request('POST', '/transactions', {
    amount: 100,
    categoryId,
    payerId: userId,
    taggieId: friendId,
    splitRatio: 0.5,
  });
  assert(noAuthRes.status === 401, `Unauthorized: ${noAuthRes.status}`);
  console.log('');

  // ── Step 8: Get Balances ─────────────────────────────────────────
  console.log('8. Checking balances...');
  const balRes = await request('GET', '/transactions/balances', null, token);
  assert(balRes.status === 200, `Balances: ${balRes.status}`);
  const juanBalance = balRes.data.balances?.find(b => b.friendProfileId === friendId);
  assert(juanBalance?.netBalance === 500, `Juan owes ₱500 (got ₱${juanBalance?.netBalance})`);
  console.log('   Balances:', JSON.stringify(balRes.data.balances, null, 2));
  console.log('');

  // ── Step 9: Get Budget Status ────────────────────────────────────
  console.log('9. Checking budget status...');
  const budgetRes = await request('GET', '/transactions/budget', null, token);
  assert(budgetRes.status === 200, `Budget: ${budgetRes.status}`);
  const foodBudget = budgetRes.data.budgetStatuses?.find(b => b.categoryId === categoryId);
  assert(foodBudget?.spent === 1200, `Food spent ₱1200 (got ₱${foodBudget?.spent})`);
  assert(foodBudget?.remaining === 3800, `Food remaining ₱3800 (got ₱${foodBudget?.remaining})`);
  console.log('   Budget:', JSON.stringify(budgetRes.data.budgetStatuses, null, 2));
  console.log('');

  // ── Step 10: Settlement ──────────────────────────────────────────
  console.log('10. Creating settlement: Juan pays back ₱300...');
  const settleRes = await request('POST', '/transactions/settle', {
    amount: 300,
    friendProfileId: friendId,
  }, token);
  assert(settleRes.status === 201, `Settlement created: ${settleRes.status}`);
  assert(settleRes.data.transaction?.type === 'SETTLEMENT', `Type is SETTLEMENT`);
  console.log('');

  // ── Step 11: Verify updated balance after settlement ─────────────
  console.log('11. Checking balances after settlement...');
  const balRes2 = await request('GET', '/transactions/balances', null, token);
  const juanAfter = balRes2.data.balances?.find(b => b.friendProfileId === friendId);
  assert(juanAfter?.netBalance === 200, `Juan now owes ₱200 (got ₱${juanAfter?.netBalance})`);
  console.log('   Updated balances:', JSON.stringify(balRes2.data.balances, null, 2));
  console.log('');

  console.log('🏁 Phase 4 verification complete!\n');
}

run().catch(console.error);
