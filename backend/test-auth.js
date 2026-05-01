// This script tests the Authentication API endpoints
// Run it using: node test-auth.js

const API_URL = 'http://localhost:5000/api';

const testUser = {
  email: `test_${Date.now()}@example.com`,
  password: 'securePassword123!',
};

let authToken = '';

async function runTests() {
  console.log('--- Hybrid Ledger Auth API Test ---');

  // 1. Test Registration
  console.log('\n[1] Testing User Registration...');
  try {
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });
    const regData = await regRes.json();

    if (regRes.status === 201) {
      console.log('✅ Registration successful!');
      console.log('User ID:', regData.user.id);
      console.log('Token received:', regData.token ? 'Yes' : 'No');
    } else {
      console.log('❌ Registration failed:', regData.error);
    }
  } catch (err) {
    console.error('❌ Failed to reach the server. Is `npm run dev` running?', err.message);
    return;
  }

  // 2. Test Login
  console.log('\n[2] Testing User Login...');
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testUser),
  });
  const loginData = await loginRes.json();

  if (loginRes.status === 200) {
    console.log('✅ Login successful!');
    console.log('Token received:', loginData.token ? 'Yes' : 'No');
    authToken = loginData.token;
  } else {
    console.log('❌ Login failed:', loginData.error);
  }

  // 3. Test Protected Route (with token)
  console.log('\n[3] Testing Protected Route (With Token)...');
  const protectedRes = await fetch(`${API_URL}/auth/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  });
  const protectedData = await protectedRes.json();

  if (protectedRes.status === 200) {
    console.log('✅ Protected route accessed successfully!');
    console.log('Response:', protectedData.message);
  } else {
    console.log('❌ Protected route access failed:', protectedData.error);
  }

  // 4. Test Protected Route (without token)
  console.log('\n[4] Testing Protected Route (Without Token)...');
  const failRes = await fetch(`${API_URL}/auth/me`, {
    method: 'GET',
  });
  const failData = await failRes.json();

  if (failRes.status === 401) {
    console.log('✅ Protected route correctly rejected unauthorized access!');
    console.log('Expected Error:', failData.error);
  } else {
    console.log('❌ Protected route failed to reject the request.');
  }

  console.log('\n--- Tests Complete ---');
}

runTests();
