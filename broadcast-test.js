require('dotenv').config({ path: '.env.development' });
const snsService = require('./services/snsService');

async function testBroadcast() {
    try {
        console.log('📢 Testing broadcast notification...');

        const result = await snsService.sendSystemNotification(
            '🚀 SNK Properties Update',
            'New features are now available in the app! Check out the latest property listings.',
            'all', // This sends to all subscribed users
            {
                type: 'SYSTEM_UPDATE',
                screen: 'Home',
                action: 'open_app'
            }
        );

        console.log('✅ Broadcast sent!');
        console.log('📧 Message ID:', result);

    } catch (error) {
        console.error('❌ Broadcast failed:', error.message);
    }
}

testBroadcast();