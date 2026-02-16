#!/usr/bin/env node

/**
 * Complete Backend API Testing Script
 * Tests: Signup → Login → Save API Key → Chat with AI
 * 
 * Usage: node test-complete-flow.js YOUR_GEMINI_API_KEY
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

// Test user credentials
const TEST_USER = {
    email: `test${Date.now()}@example.com`,
    password: 'TestPassword123!',
    username: 'TestUser'
};

let SESSION = {
    access_token: null,
    user_id: null
};

// Helper function for API calls
async function apiCall(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    console.log(`\n📡 ${options.method || 'GET'} ${endpoint}`);
    
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    const data = await response.json();
    
    if (!response.ok) {
        console.error(`❌ Error ${response.status}:`, data);
        throw new Error(data.error || 'Request failed');
    }

    console.log(`✅ Success:`, JSON.stringify(data, null, 2));
    return data;
}

// Test 1: Signup
async function testSignup() {
    console.log('\n' + '='.repeat(50));
    console.log('TEST 1: SIGNUP');
    console.log('='.repeat(50));

    const data = await apiCall('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(TEST_USER)
    });

    SESSION.access_token = data.session.access_token;
    SESSION.user_id = data.user.id;

    console.log(`\n✅ User created: ${data.user.email}`);
    console.log(`✅ User ID: ${SESSION.user_id}`);
    console.log(`✅ Token received (first 20 chars): ${SESSION.access_token.substring(0, 20)}...`);
}

// Test 2: Verify Token
async function testVerify() {
    console.log('\n' + '='.repeat(50));
    console.log('TEST 2: VERIFY TOKEN');
    console.log('='.repeat(50));

    const data = await apiCall('/api/auth/verify', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SESSION.access_token}`
        }
    });

    console.log(`\n✅ Token is valid`);
    console.log(`✅ Logged in as: ${data.user.email}`);
}

// Test 3: Save Gemini API Key
async function testSaveApiKey(geminiApiKey) {
    console.log('\n' + '='.repeat(50));
    console.log('TEST 3: SAVE GEMINI API KEY');
    console.log('='.repeat(50));

    const data = await apiCall('/api/keys', {
        method: 'POST',
        body: JSON.stringify({
            userId: SESSION.user_id,
            apiKey: geminiApiKey
        })
    });

    console.log(`\n✅ API Key saved and encrypted`);
}

// Test 4: Check if API Key exists
async function testCheckApiKey() {
    console.log('\n' + '='.repeat(50));
    console.log('TEST 4: CHECK API KEY STATUS');
    console.log('='.repeat(50));

    const data = await apiCall(`/api/keys/${SESSION.user_id}`);

    console.log(`\n✅ Has API Key: ${data.hasKey}`);
    if (data.hasKey) {
        console.log(`✅ Key Name: ${data.keyName}`);
        console.log(`✅ Created At: ${data.createdAt}`);
    }
}

// Test 5: Create Conversation
async function testCreateConversation() {
    console.log('\n' + '='.repeat(50));
    console.log('TEST 5: CREATE CONVERSATION');
    console.log('='.repeat(50));

    const data = await apiCall('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({
            userId: SESSION.user_id,
            title: 'Test Chat with AI'
        })
    });

    SESSION.conversation_id = data.id;
    console.log(`\n✅ Conversation created: ${data.title}`);
    console.log(`✅ Conversation ID: ${SESSION.conversation_id}`);
}

// Test 6: Chat with AI
async function testChat() {
    console.log('\n' + '='.repeat(50));
    console.log('TEST 6: CHAT WITH AI');
    console.log('='.repeat(50));

    const messages = [
        { role: 'user', content: 'Hello! Can you write a simple Python function to add two numbers?' }
    ];

    console.log(`\n📤 Sending message: "${messages[0].content}"`);
    console.log(`⏳ Waiting for AI response (streaming)...\n`);

    const response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messages,
            userId: SESSION.user_id
        })
    });

    if (!response.ok) {
        const error = await response.json();
        console.error(`❌ Chat Error:`, error);
        throw new Error(error.error || 'Chat failed');
    }

    // Read streaming response (node-fetch v2 compatible)
    let aiResponse = '';

    console.log('🤖 AI Response:\n');
    console.log('-'.repeat(50));

    // node-fetch v2 returns a Node.js stream
    response.body.on('data', (chunk) => {
        const text = chunk.toString();
        process.stdout.write(text);
        aiResponse += text;
    });

    // Wait for stream to finish
    await new Promise((resolve, reject) => {
        response.body.on('end', resolve);
        response.body.on('error', reject);
    });

    console.log('\n' + '-'.repeat(50));
    console.log(`\n✅ Chat completed successfully`);
    console.log(`✅ Response length: ${aiResponse.length} characters`);
}

// Test 7: Save Message to Database
async function testSaveMessage() {
    console.log('\n' + '='.repeat(50));
    console.log('TEST 7: SAVE MESSAGE TO DATABASE');
    console.log('='.repeat(50));

    // Save user message
    await apiCall('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
            conversationId: SESSION.conversation_id,
            role: 'user',
            content: 'Hello! Can you write a simple Python function to add two numbers?'
        })
    });

    console.log(`\n✅ User message saved`);

    // Save AI response
    await apiCall('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
            conversationId: SESSION.conversation_id,
            role: 'assistant',
            content: 'def add(a, b):\n    return a + b'
        })
    });

    console.log(`✅ AI response saved`);
}

// Test 8: Get Conversation Messages
async function testGetMessages() {
    console.log('\n' + '='.repeat(50));
    console.log('TEST 8: GET CONVERSATION MESSAGES');
    console.log('='.repeat(50));

    const data = await apiCall(`/api/messages/${SESSION.conversation_id}`);

    console.log(`\n✅ Retrieved ${data.length} messages`);
    data.forEach((msg, i) => {
        console.log(`\n${i + 1}. [${msg.role}]: ${msg.content.substring(0, 50)}...`);
    });
}

// Test 9: Logout
async function testLogout() {
    console.log('\n' + '='.repeat(50));
    console.log('TEST 9: LOGOUT');
    console.log('='.repeat(50));

    const data = await apiCall('/api/auth/logout', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SESSION.access_token}`
        }
    });

    console.log(`\n✅ Logged out successfully`);
}

// Main test runner
async function runAllTests() {
    const geminiApiKey = process.argv[2];

    if (!geminiApiKey) {
        console.error('\n❌ Error: Gemini API Key required!');
        console.log('\nUsage: node test-complete-flow.js YOUR_GEMINI_API_KEY');
        console.log('\nExample:');
        console.log('  node test-complete-flow.js AIzaSyABC123...\n');
        process.exit(1);
    }

    console.log('\n' + '='.repeat(50));
    console.log('🚀 STARTING COMPLETE BACKEND API TEST');
    console.log('='.repeat(50));
    console.log(`\nTest User: ${TEST_USER.email}`);
    console.log(`Backend URL: ${BASE_URL}`);
    console.log(`Gemini API Key: ${geminiApiKey.substring(0, 10)}...`);

    try {
        await testSignup();
        await testVerify();
        await testSaveApiKey(geminiApiKey);
        await testCheckApiKey();
        await testCreateConversation();
        await testChat();
        await testSaveMessage();
        await testGetMessages();
        await testLogout();

        console.log('\n' + '='.repeat(50));
        console.log('✅ ALL TESTS PASSED!');
        console.log('='.repeat(50));
        console.log('\n🎉 Backend is working perfectly!\n');

    } catch (error) {
        console.error('\n' + '='.repeat(50));
        console.error('❌ TEST FAILED');
        console.error('='.repeat(50));
        console.error(`\nError: ${error.message}\n`);
        process.exit(1);
    }
}

// Run tests
runAllTests();
