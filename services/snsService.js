const { SNSClient, PublishCommand, CreatePlatformEndpointCommand, CreateTopicCommand, SubscribeCommand, UnsubscribeCommand, DeleteEndpointCommand } = require('@aws-sdk/client-sns');

class SNSService {
    constructor() {
        this.snsClient = new SNSClient({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
        });
        
        this.platformApplicationArns = {
            android: process.env.SNS_PLATFORM_APP_ARN_ANDROID,
            ios: process.env.SNS_PLATFORM_APP_ARN_IOS
        };
        
        this.topicArns = {
            general: process.env.SNS_TOPIC_GENERAL,
            properties: process.env.SNS_TOPIC_PROPERTIES,
            referrals: process.env.SNS_TOPIC_REFERRALS
        };
    }

    async createPlatformEndpoint(deviceToken, platform, customUserData = {}) {
        try {
            const platformArn = this.platformApplicationArns[platform.toLowerCase()];
            
            if (!platformArn) {
                throw new Error(`Platform ARN not configured for ${platform}`);
            }

            const params = {
                PlatformApplicationArn: platformArn,
                Token: deviceToken,
                CustomUserData: JSON.stringify(customUserData)
            };

            const command = new CreatePlatformEndpointCommand(params);
            const response = await this.snsClient.send(command);
            
            console.log(`✅ Created platform endpoint for ${platform}:`, response.EndpointArn);
            return response.EndpointArn;
        } catch (error) {
            console.error('❌ Failed to create platform endpoint:', error);
            throw error;
        }
    }

    async sendNotificationToEndpoint(endpointArn, title, message, data = {}) {
        try {
            const payload = this.buildNotificationPayload(title, message, data);
            
            const params = {
                TargetArn: endpointArn,
                Message: JSON.stringify({
                    default: message,
                    GCM: JSON.stringify({
                        notification: {
                            title: title,
                            body: message,
                            sound: 'default',
                            badge: 1
                        },
                        data: data
                    }),
                    APNS: JSON.stringify({
                        aps: {
                            alert: {
                                title: title,
                                body: message
                            },
                            sound: 'default',
                            badge: 1
                        },
                        data: data
                    })
                }),
                MessageStructure: 'json'
            };

            const command = new PublishCommand(params);
            const response = await this.snsClient.send(command);
            
            console.log('✅ Notification sent to endpoint:', response.MessageId);
            return response.MessageId;
        } catch (error) {
            console.error('❌ Failed to send notification to endpoint:', error);
            
            if (error.code === 'EndpointDisabled') {
                console.log('📱 Endpoint disabled, cleaning up...');
                await this.deleteEndpoint(endpointArn);
            }
            
            throw error;
        }
    }

    async sendNotificationToTopic(topicArn, title, message, data = {}) {
        try {
            const payload = this.buildNotificationPayload(title, message, data);
            
            const params = {
                TopicArn: topicArn,
                Message: JSON.stringify({
                    default: message,
                    GCM: JSON.stringify({
                        notification: {
                            title: title,
                            body: message,
                            sound: 'default'
                        },
                        data: data
                    }),
                    APNS: JSON.stringify({
                        aps: {
                            alert: {
                                title: title,
                                body: message
                            },
                            sound: 'default'
                        },
                        data: data
                    })
                }),
                MessageStructure: 'json',
                Subject: title
            };

            const command = new PublishCommand(params);
            const response = await this.snsClient.send(command);
            
            console.log('✅ Notification sent to topic:', response.MessageId);
            return response.MessageId;
        } catch (error) {
            console.error('❌ Failed to send notification to topic:', error);
            throw error;
        }
    }

    async sendPropertyNotification(users, type, propertyData) {
        try {
            let title, message, data;
            
            switch (type) {
                case 'NEW_PROPERTY':
                    title = '🏠 New Property Available!';
                    message = `${propertyData.title} in ${propertyData.location} is now available`;
                    data = {
                        type: 'PROPERTY_NEW',
                        propertyId: propertyData._id,
                        screen: 'PropertyDetails'
                    };
                    break;
                    
                case 'PRICE_DROP':
                    title = '💰 Price Drop Alert!';
                    message = `Price reduced on ${propertyData.title} - Now ₹${propertyData.price}`;
                    data = {
                        type: 'PROPERTY_PRICE_DROP',
                        propertyId: propertyData._id,
                        screen: 'PropertyDetails'
                    };
                    break;
                    
                case 'FAVORITE_UPDATE':
                    title = '❤️ Saved Property Updated';
                    message = `Your saved property "${propertyData.title}" has been updated`;
                    data = {
                        type: 'PROPERTY_FAVORITE_UPDATE',
                        propertyId: propertyData._id,
                        screen: 'PropertyDetails'
                    };
                    break;
                    
                case 'AREA_MATCH':
                    title = '📍 Property in Your Area';
                    message = `New property found in your preferred area: ${propertyData.location}`;
                    data = {
                        type: 'PROPERTY_AREA_MATCH',
                        propertyId: propertyData._id,
                        screen: 'PropertyDetails'
                    };
                    break;
                    
                default:
                    title = '🏠 Property Update';
                    message = `Update on ${propertyData.title}`;
                    data = {
                        type: 'PROPERTY_UPDATE',
                        propertyId: propertyData._id,
                        screen: 'PropertyDetails'
                    };
            }

            const results = [];
            for (const user of users) {
                if (user.pushTokens && user.pushTokens.length > 0) {
                    for (const tokenInfo of user.pushTokens) {
                        if (tokenInfo.active && tokenInfo.endpointArn) {
                            try {
                                const messageId = await this.sendNotificationToEndpoint(
                                    tokenInfo.endpointArn,
                                    title,
                                    message,
                                    data
                                );
                                results.push({ userId: user._id, messageId, status: 'success' });
                            } catch (error) {
                                results.push({ userId: user._id, error: error.message, status: 'failed' });
                            }
                        }
                    }
                }
            }
            
            return results;
        } catch (error) {
            console.error('❌ Failed to send property notifications:', error);
            throw error;
        }
    }

    async sendReferralNotification(userId, type, referralData) {
        try {
            let title, message, data;
            
            switch (type) {
                case 'REFERRAL_APPROVED':
                    title = '✅ Referral Approved!';
                    message = `Your referral has been approved. Commission: ₹${referralData.commission}`;
                    data = {
                        type: 'REFERRAL_APPROVED',
                        referralId: referralData._id,
                        screen: 'ReferralScreen'
                    };
                    break;
                    
                case 'REFERRAL_COMMISSION':
                    title = '💰 Commission Credited!';
                    message = `₹${referralData.amount} commission credited to your account`;
                    data = {
                        type: 'REFERRAL_COMMISSION',
                        referralId: referralData._id,
                        screen: 'ReferralScreen'
                    };
                    break;
                    
                case 'NEW_REFERRAL':
                    title = '🎯 New Referral Opportunity';
                    message = `New referral opportunity available in ${referralData.location}`;
                    data = {
                        type: 'NEW_REFERRAL',
                        referralId: referralData._id,
                        screen: 'ReferralScreen'
                    };
                    break;
                    
                default:
                    title = '🎯 Referral Update';
                    message = 'Your referral status has been updated';
                    data = {
                        type: 'REFERRAL_UPDATE',
                        referralId: referralData._id,
                        screen: 'ReferralScreen'
                    };
            }

            // Implementation would fetch user and send notification
            // This is a placeholder for user notification logic
            console.log(`Sending referral notification to user ${userId}:`, title);
            
            return { success: true, title, message };
        } catch (error) {
            console.error('❌ Failed to send referral notification:', error);
            throw error;
        }
    }

    async sendSystemNotification(title, message, targetUsers = 'all', data = {}) {
        try {
            data.type = 'SYSTEM_NOTIFICATION';
            data.screen = 'Home';
            
            if (targetUsers === 'all') {
                // Send to general topic
                if (this.topicArns.general) {
                    return await this.sendNotificationToTopic(
                        this.topicArns.general,
                        title,
                        message,
                        data
                    );
                }
            } else {
                // Send to specific users
                const results = [];
                for (const user of targetUsers) {
                    if (user.pushTokens && user.pushTokens.length > 0) {
                        for (const tokenInfo of user.pushTokens) {
                            if (tokenInfo.active && tokenInfo.endpointArn) {
                                try {
                                    const messageId = await this.sendNotificationToEndpoint(
                                        tokenInfo.endpointArn,
                                        title,
                                        message,
                                        data
                                    );
                                    results.push({ userId: user._id, messageId, status: 'success' });
                                } catch (error) {
                                    results.push({ userId: user._id, error: error.message, status: 'failed' });
                                }
                            }
                        }
                    }
                }
                return results;
            }
        } catch (error) {
            console.error('❌ Failed to send system notification:', error);
            throw error;
        }
    }

    async deleteEndpoint(endpointArn) {
        try {
            const params = {
                EndpointArn: endpointArn
            };
            
            const command = new DeleteEndpointCommand(params);
            await this.snsClient.send(command);
            
            console.log('✅ Deleted endpoint:', endpointArn);
            return true;
        } catch (error) {
            console.error('❌ Failed to delete endpoint:', error);
            return false;
        }
    }

    buildNotificationPayload(title, message, data = {}) {
        return {
            title,
            message,
            data: {
                ...data,
                timestamp: new Date().toISOString(),
                notificationId: `notif_${Date.now()}`
            }
        };
    }

    validateNotificationPreferences(user, notificationType) {
        if (!user.notificationPreferences) {
            return true; // Default to enabled if no preferences set
        }
        
        const typeMapping = {
            'PROPERTY_NEW': 'propertyUpdates',
            'PROPERTY_PRICE_DROP': 'propertyUpdates',
            'PROPERTY_FAVORITE_UPDATE': 'propertyUpdates',
            'PROPERTY_AREA_MATCH': 'propertyUpdates',
            'REFERRAL_APPROVED': 'referralUpdates',
            'REFERRAL_COMMISSION': 'referralUpdates',
            'NEW_REFERRAL': 'referralUpdates',
            'SYSTEM_NOTIFICATION': 'system'
        };
        
        const prefKey = typeMapping[notificationType];
        return prefKey ? user.notificationPreferences[prefKey] !== false : true;
    }
}

module.exports = new SNSService();