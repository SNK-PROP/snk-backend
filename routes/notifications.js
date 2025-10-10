const express = require('express');
const router = express.Router();
const User = require('../models/User');
const snsService = require('../services/snsService');
const { auth } = require('../middleware/auth');

// Register device for push notifications
router.post('/register-device', auth, async (req, res) => {
    try {
        const { token, platform, deviceInfo } = req.body;
        const userId = req.user.userId;

        if (!token || !platform) {
            return res.status(400).json({
                success: false,
                message: 'Token and platform are required'
            });
        }

        // Validate platform
        if (!['ios', 'android'].includes(platform.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: 'Platform must be either ios or android'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if token already exists
        const existingTokenIndex = user.pushTokens.findIndex(
            pt => pt.token === token && pt.platform === platform.toLowerCase()
        );

        let endpointArn = null;
        try {
            // Create SNS platform endpoint
            endpointArn = await snsService.createPlatformEndpoint(
                token,
                platform.toLowerCase(),
                {
                    userId: userId,
                    userType: user.userType,
                    email: user.email
                }
            );
        } catch (snsError) {
            console.error('SNS endpoint creation failed:', snsError);
            // Continue without SNS endpoint for now
        }

        if (existingTokenIndex !== -1) {
            // Update existing token
            user.pushTokens[existingTokenIndex] = {
                ...user.pushTokens[existingTokenIndex],
                token,
                platform: platform.toLowerCase(),
                endpointArn,
                active: true,
                deviceInfo: deviceInfo || user.pushTokens[existingTokenIndex].deviceInfo,
                createdAt: new Date()
            };
        } else {
            // Add new token
            user.pushTokens.push({
                token,
                platform: platform.toLowerCase(),
                endpointArn,
                active: true,
                deviceInfo: deviceInfo || {},
                createdAt: new Date()
            });
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Device registered successfully',
            data: {
                tokenRegistered: true,
                snsEndpoint: !!endpointArn
            }
        });

    } catch (error) {
        console.error('Error registering device:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to register device',
            error: error.message
        });
    }
});

// Unregister device
router.delete('/unregister-device', auth, async (req, res) => {
    try {
        const { token, platform } = req.body;
        const userId = req.user.userId;

        if (!token || !platform) {
            return res.status(400).json({
                success: false,
                message: 'Token and platform are required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Find and remove the token
        const tokenIndex = user.pushTokens.findIndex(
            pt => pt.token === token && pt.platform === platform.toLowerCase()
        );

        if (tokenIndex !== -1) {
            const tokenInfo = user.pushTokens[tokenIndex];
            
            // Delete SNS endpoint if exists
            if (tokenInfo.endpointArn) {
                try {
                    await snsService.deleteEndpoint(tokenInfo.endpointArn);
                } catch (snsError) {
                    console.error('SNS endpoint deletion failed:', snsError);
                }
            }

            user.pushTokens.splice(tokenIndex, 1);
            await user.save();

            res.status(200).json({
                success: true,
                message: 'Device unregistered successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Token not found'
            });
        }

    } catch (error) {
        console.error('Error unregistering device:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unregister device',
            error: error.message
        });
    }
});

// Update notification preferences
router.put('/preferences', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const preferences = req.body;

        // Validate preferences
        const validPreferences = [
            'propertyUpdates',
            'referralUpdates', 
            'marketing',
            'system',
            'priceAlerts',
            'newPropertiesInArea'
        ];

        const invalidPrefs = Object.keys(preferences).filter(
            pref => !validPreferences.includes(pref)
        );

        if (invalidPrefs.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Invalid preference keys: ${invalidPrefs.join(', ')}`
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update preferences
        user.notificationPreferences = {
            ...user.notificationPreferences,
            ...preferences
        };

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Notification preferences updated',
            data: user.notificationPreferences
        });

    } catch (error) {
        console.error('Error updating preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update preferences',
            error: error.message
        });
    }
});

// Get notification preferences
router.get('/preferences', auth, async (req, res) => {
    try {
        const userId = req.user.userId;

        const user = await User.findById(userId).select('notificationPreferences');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: user.notificationPreferences
        });

    } catch (error) {
        console.error('Error fetching preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch preferences',
            error: error.message
        });
    }
});

// Send test notification (for development/admin)
router.post('/test', auth, async (req, res) => {
    try {
        const { title, message, data } = req.body;
        const userId = req.user.userId;

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const results = [];
        for (const tokenInfo of user.pushTokens) {
            if (tokenInfo.active && tokenInfo.endpointArn) {
                try {
                    const messageId = await snsService.sendNotificationToEndpoint(
                        tokenInfo.endpointArn,
                        title,
                        message,
                        { ...data, type: 'TEST_NOTIFICATION' }
                    );
                    results.push({
                        platform: tokenInfo.platform,
                        messageId,
                        status: 'success'
                    });
                } catch (error) {
                    results.push({
                        platform: tokenInfo.platform,
                        error: error.message,
                        status: 'failed'
                    });
                }
            }
        }

        res.status(200).json({
            success: true,
            message: 'Test notifications sent',
            results
        });

    } catch (error) {
        console.error('Error sending test notification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send test notification',
            error: error.message
        });
    }
});

// Get user's notification status/info
router.get('/status', auth, async (req, res) => {
    try {
        const userId = req.user.userId;

        const user = await User.findById(userId).select('pushTokens notificationPreferences lastNotificationRead');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const activeTokens = user.pushTokens.filter(token => token.active);
        
        res.status(200).json({
            success: true,
            data: {
                registeredDevices: activeTokens.length,
                devices: activeTokens.map(token => ({
                    platform: token.platform,
                    hasEndpoint: !!token.endpointArn,
                    createdAt: token.createdAt,
                    deviceInfo: token.deviceInfo
                })),
                preferences: user.notificationPreferences,
                lastNotificationRead: user.lastNotificationRead
            }
        });

    } catch (error) {
        console.error('Error fetching notification status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notification status',
            error: error.message
        });
    }
});

// Admin route: Send notification to all users or specific users
router.post('/admin/broadcast', auth, async (req, res) => {
    try {
        const { title, message, data, targetUserIds } = req.body;

        // Check if user is admin
        if (req.user.userType !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin privileges required.'
            });
        }

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        let results;
        if (targetUserIds && targetUserIds.length > 0) {
            // Send to specific users
            const targetUsers = await User.find({
                _id: { $in: targetUserIds }
            }).select('pushTokens notificationPreferences');
            
            results = await snsService.sendSystemNotification(
                title,
                message,
                targetUsers,
                data
            );
        } else {
            // Broadcast to all users
            results = await snsService.sendSystemNotification(
                title,
                message,
                'all',
                data
            );
        }

        res.status(200).json({
            success: true,
            message: 'Broadcast notification sent',
            results
        });

    } catch (error) {
        console.error('Error sending broadcast notification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send broadcast notification',
            error: error.message
        });
    }
});

module.exports = router;