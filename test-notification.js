require('dotenv').config({ path: '.env.development' });
const { SNSClient, CreatePlatformEndpointCommand, PublishCommand } = require('@aws-sdk/client-sns');

// FCM Token provided by user
const FCM_TOKEN = 'dl7hGuwcQ0ufGB0XFLwN6u:APA91bHkmmKYY0oW69qXd--B0vK2he4uTwxedRMbIFnFPEyP2bFJHyQUqVeKf7f03USvQR1mMZ9Ctr7qPfK2ICmxpEtYGGgOT0EOyXu9Y2MxnzdqvVI69Xo';

class TestNotificationService {
    constructor() {
        this.snsClient = new SNSClient({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
        });

        this.platformApplicationArn = process.env.SNS_PLATFORM_APP_ARN_ANDROID;
    }

    async createPlatformEndpoint(deviceToken) {
        try {
            console.log('📱 Creating platform endpoint for device token...');

            const params = {
                PlatformApplicationArn: this.platformApplicationArn,
                Token: deviceToken,
                CustomUserData: JSON.stringify({
                    testUser: true,
                    timestamp: new Date().toISOString()
                })
            };

            const command = new CreatePlatformEndpointCommand(params);
            const response = await this.snsClient.send(command);

            console.log('✅ Created platform endpoint:', response.EndpointArn);
            return response.EndpointArn;
        } catch (error) {
            if (error.message.includes('already exists with the same Token')) {
                // Extract existing endpoint ARN from error message
                const arnMatch = error.message.match(/arn:aws:sns:[^:]+:[^:]+:endpoint\/[^\/]+\/[^\/]+\/[^\s]+/);
                if (arnMatch) {
                    const existingEndpointArn = arnMatch[0];
                    console.log('📱 Using existing endpoint:', existingEndpointArn);
                    return existingEndpointArn;
                }
            }
            console.error('❌ Failed to create platform endpoint:', error.message);
            throw error;
        }
    }

    async sendNotificationToEndpoint(endpointArn, title, message, data = {}) {
        try {
            console.log('📨 Sending notification to endpoint...');

            const params = {
                TargetArn: endpointArn,
                Message: JSON.stringify({
                    default: message,
                    GCM: JSON.stringify({
                        notification: {
                            title: title,
                            body: message,
                            sound: 'default',
                            badge: 1,
                            icon: 'ic_notification',
                            color: '#8BC83F'
                        },
                        data: {
                            ...data,
                            type: 'TEST_NOTIFICATION',
                            timestamp: new Date().toISOString()
                        }
                    })
                }),
                MessageStructure: 'json'
            };

            const command = new PublishCommand(params);
            const response = await this.snsClient.send(command);

            console.log('✅ Notification sent! Message ID:', response.MessageId);
            return response.MessageId;
        } catch (error) {
            console.error('❌ Failed to send notification:', error.message);
            throw error;
        }
    }

    async sendTestNotification() {
        try {
            console.log('🚀 Starting test notification process...');
            console.log('📱 FCM Token:', FCM_TOKEN);
            console.log('🌍 AWS Region:', process.env.AWS_REGION);
            console.log('📋 Platform App ARN:', this.platformApplicationArn);

            // Create platform endpoint for the FCM token
            const endpointArn = await this.createPlatformEndpoint(FCM_TOKEN);

            // Send test notification
            const messageId = await this.sendNotificationToEndpoint(
                endpointArn,
                '🎉 SNK App Test Notification',
                'Hello! This is a test notification from SNK Properties backend. If you see this, push notifications are working correctly!',
                {
                    action: 'test',
                    screen: 'Home',
                    testData: 'notification_test_successful'
                }
            );

            console.log('🎊 Test notification sent successfully!');
            console.log('📧 Message ID:', messageId);
            console.log('📱 Endpoint ARN:', endpointArn);

        } catch (error) {
            console.error('💥 Test notification failed:', error.message);
            console.error('Stack trace:', error.stack);
        }
    }
}

// Run the test
(async () => {
    const testService = new TestNotificationService();
    await testService.sendTestNotification();
})();