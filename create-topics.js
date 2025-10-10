require('dotenv').config({ path: '.env.development' });
const { SNSClient, CreateTopicCommand } = require('@aws-sdk/client-sns');

async function createSNSTopics() {
    const snsClient = new SNSClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
    });

    const topics = [
        'snk-general-notifications',
        'snk-property-notifications',
        'snk-referral-notifications'
    ];

    for (const topicName of topics) {
        try {
            console.log(`📋 Creating topic: ${topicName}`);

            const command = new CreateTopicCommand({ Name: topicName });
            const response = await snsClient.send(command);

            console.log(`✅ Created: ${response.TopicArn}`);
        } catch (error) {
            if (error.code === 'TopicAlreadyExists') {
                console.log(`📋 Topic ${topicName} already exists`);
            } else {
                console.error(`❌ Failed to create ${topicName}:`, error.message);
            }
        }
    }
}

createSNSTopics();