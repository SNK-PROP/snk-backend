const fetch = require('node-fetch');

const API_BASE_URL = 'http://192.168.0.106:5000/api';

async function loginAndSendTestNotification() {
    try {
        console.log('🔐 Logging in...');

        // Step 1: Login to get JWT token
        const loginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: 'sargamsanjaykumar@gmail.com',
                password: 'sanjay'
            })
        });

        if (!loginResponse.ok) {
            const errorData = await loginResponse.json();
            throw new Error(`Login failed: ${errorData.message}`);
        }

        const loginData = await loginResponse.json();
        const token = loginData.token;

        console.log('✅ Login successful!');
        console.log('👤 User:', loginData.user?.fullName || loginData.user?.email);

        // Step 2: Call test notification endpoint
        console.log('📨 Sending test notification...');

        const testResponse = await fetch(`${API_BASE_URL}/notifications/test`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title: '🎉 Test Notification from SNK Backend',
                message: 'This is a test notification sent directly from the backend API. Your push notification system is working!',
                data: {
                    action: 'test',
                    screen: 'Home',
                    timestamp: new Date().toISOString()
                }
            })
        });

        if (!testResponse.ok) {
            const errorData = await testResponse.json();
            throw new Error(`Test notification failed: ${errorData.message}`);
        }

        const testData = await testResponse.json();

        console.log('🎊 Test notification response:');
        console.log('Success:', testData.success);
        console.log('Message:', testData.message);

        if (testData.results && testData.results.length > 0) {
            console.log('📱 Notification results:');
            testData.results.forEach((result, index) => {
                console.log(`  ${index + 1}. Platform: ${result.platform}`);
                console.log(`     Status: ${result.status}`);
                if (result.messageId) {
                    console.log(`     Message ID: ${result.messageId}`);
                }
                if (result.error) {
                    console.log(`     Error: ${result.error}`);
                }
            });
        } else {
            console.log('⚠️ No push tokens found for this user or no active endpoints');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run the script
loginAndSendTestNotification();