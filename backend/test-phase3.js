// Phase 3 Verification: Tests Category and Friend API endpoints
// Run: node test-phase3.js

const API_URL = 'http://localhost:5000/api';

const testUser = {
  email: `phase3_${Date.now()}@example.com`,
  password: 'securePassword123!',
};

let authToken = '';

async function runTests() {
  console.log('=== Phase 3: Relational Ledger API Verification ===\n');

  // Step 0: Register + Login to get a JWT
  console.log('[0] Registering a test user...');
  const regRes = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testUser),
  });
  const regData = await regRes.json();
  if (regRes.status !== 201) {
    console.error('❌ Registration failed:', regData.error);
    return;
  }
  authToken = regData.token;
  console.log('✅ Registered & got JWT token.\n');

  // --- CATEGORY TESTS ---

  // Test 1: POST /api/categories (201)
  console.log('[1] Creating a category...');
  const createCatRes = await fetch(`${API_URL}/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ name: 'Food', monthlyLimit: 500 }),
  });
  const createCatData = await createCatRes.json();
  if (createCatRes.status === 201) {
    console.log('✅ POST /api/categories → 201');
    console.log('   Category ID:', createCatData.category.id);
    console.log('   Name:', createCatData.category.name);
  } else {
    console.log('❌ POST /api/categories failed:', createCatData);
  }

  const categoryId = createCatData.category?.id;

  // Test 2: GET /api/categories (200)
  console.log('\n[2] Listing categories...');
  const getCatRes = await fetch(`${API_URL}/categories`, {
    headers: { 'Authorization': `Bearer ${authToken}` },
  });
  const getCatData = await getCatRes.json();
  if (getCatRes.status === 200 && getCatData.categories.length > 0) {
    console.log('✅ GET /api/categories → 200');
    console.log('   Count:', getCatData.categories.length);
  } else {
    console.log('❌ GET /api/categories failed:', getCatData);
  }

  // Test 3: PATCH /api/categories/:id (200)
  if (categoryId) {
    console.log('\n[3] Updating category limit...');
    const patchRes = await fetch(`${API_URL}/categories/${categoryId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ monthlyLimit: 750 }),
    });
    const patchData = await patchRes.json();
    if (patchRes.status === 200) {
      console.log('✅ PATCH /api/categories/:id → 200');
      console.log('   Updated limit:', patchData.category.monthlyLimit);
    } else {
      console.log('❌ PATCH failed:', patchData);
    }
  }

  // Test 4: Category endpoint without token (401)
  console.log('\n[4] Accessing categories without JWT...');
  const noAuthRes = await fetch(`${API_URL}/categories`);
  const noAuthData = await noAuthRes.json();
  if (noAuthRes.status === 401) {
    console.log('✅ GET /api/categories (no token) → 401');
    console.log('   Error:', noAuthData.error);
  } else {
    console.log('❌ Should have been 401, got:', noAuthRes.status);
  }

  // --- FRIEND TESTS ---

  // Test 5: POST /api/friends (ghost) (201)
  console.log('\n[5] Creating a ghost friend...');
  const createFriendRes = await fetch(`${API_URL}/friends`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ name: 'John Doe', isGhost: true }),
  });
  const createFriendData = await createFriendRes.json();
  if (createFriendRes.status === 201) {
    console.log('✅ POST /api/friends → 201');
    console.log('   Friend ID:', createFriendData.friend.id);
    console.log('   Name:', createFriendData.friend.name);
    console.log('   Is Ghost:', createFriendData.friend.isGhost);
  } else {
    console.log('❌ POST /api/friends failed:', createFriendData);
  }

  // Test 6: GET /api/friends (200)
  console.log('\n[6] Listing friends...');
  const getFriendsRes = await fetch(`${API_URL}/friends`, {
    headers: { 'Authorization': `Bearer ${authToken}` },
  });
  const getFriendsData = await getFriendsRes.json();
  if (getFriendsRes.status === 200 && getFriendsData.friends.length > 0) {
    console.log('✅ GET /api/friends → 200');
    console.log('   Count:', getFriendsData.friends.length);
  } else {
    console.log('❌ GET /api/friends failed:', getFriendsData);
  }

  console.log('\n=== Phase 3 Verification Complete ===');
}

runTests().catch(err => {
  console.error('❌ Test script crashed:', err.message);
});
