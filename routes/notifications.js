// routes/notifications.js
const express = require('express');
const { auth, requireAdmin } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const Notification = require('../models/Notification');
const DeviceToken = require('../models/DeviceToken');
const User = require('../models/User');

const router = express.Router();

// Register device token
router.post('/register-token', auth, async (req, res) => {
  try {
    const { token, platform, appVersion, deviceInfo } = req.body;

    if (!token || !platform) {
      return res.status(400).json({
        success: false,
        message: 'Token and platform are required'
      });
    }

    if (!['ios', 'android'].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: 'Platform must be either ios or android'
      });
    }

    const deviceToken = await notificationService.registerDeviceToken(
      req.user.userId,
      token,
      platform,
      appVersion,
      deviceInfo
    );

    res.json({
      success: true,
      message: 'Device token registered successfully',
      data: deviceToken
    });
  } catch (error) {
    console.error('Error registering device token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register device token',
      error: error.message
    });
  }
});

// Delete device token
router.delete('/token/:token', auth, async (req, res) => {
  try {
    const { token } = req.params;

    await DeviceToken.updateOne(
      { token, user: req.user.userId },
      { isActive: false }
    );

    res.json({
      success: true,
      message: 'Device token deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting device token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete device token',
      error: error.message
    });
  }
});

// Send custom notification (admin only)
router.post('/send', auth, requireAdmin, async (req, res) => {
  try {
    const {
      title,
      body,
      targetAudience = 'all',
      targetUsers = [],
      type = 'general',
      data = {},
      imageUrl,
      scheduledFor,
      priority = 'normal',
      ttl = 3600
    } = req.body;

    // Validate required fields
    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: 'Title and body are required'
      });
    }

    // Validate targetAudience
    const validAudiences = ['all', 'users', 'agents', 'admins', 'specific'];
    if (!validAudiences.includes(targetAudience)) {
      return res.status(400).json({
        success: false,
        message: `Invalid targetAudience. Must be one of: ${validAudiences.join(', ')}`
      });
    }

    // Validate targetUsers if audience is specific
    if (targetAudience === 'specific' && targetUsers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'targetUsers is required when targetAudience is specific'
      });
    }

    // Validate users exist
    if (targetUsers.length > 0) {
      const users = await User.find({ _id: { $in: targetUsers } });
      if (users.length !== targetUsers.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more target users do not exist'
        });
      }
    }

    const notification = await notificationService.createScheduledNotification({
      title,
      body,
      targetAudience,
      targetUsers,
      type,
      data,
      imageUrl,
      scheduledFor,
      priority,
      ttl,
      createdBy: req.user.userId
    });

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      data: notification
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message
    });
  }
});

// Send new property notification
router.post('/new-property', auth, async (req, res) => {
  try {
    const { propertyId, propertyTitle, propertyImage, targetAudience = 'users' } = req.body;

    if (!propertyId || !propertyTitle) {
      return res.status(400).json({
        success: false,
        message: 'Property ID and title are required'
      });
    }

    // Only agents and admins can send property notifications
    // const user = await User.findById(req.user.userId);
    // if (!['agent', 'admin'].includes(user.userType)) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Only agents and admins can send property notifications'
    //   });
    // }

    const notification = await notificationService.sendNewPropertyNotification(
      propertyId,
      propertyTitle,
      propertyImage,
      targetAudience
    );

    res.status(201).json({
      success: true,
      message: 'New property notification sent successfully',
      data: notification
    });
  } catch (error) {
    console.error('Error sending new property notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send new property notification',
      error: error.message
    });
  }
});

// Send test notification
router.post('/test', auth, async (req, res) => {
  try {
    const { title = 'Test Notification', body = 'This is a test notification from SNK Real Estate' } = req.body;

    // Send notification to the requesting user only
    const results = await notificationService.sendToUser(
      req.user.userId,
      title,
      body,
      {
        type: 'test',
        action: 'test_notification',
        timestamp: new Date().toISOString()
      },
      {
        type: 'general',
        priority: 'high'
      }
    );

    res.json({
      success: true,
      message: 'Test notification sent successfully',
      data: results
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

// Get notification history (admin)
router.get('/history', auth, requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      targetAudience,
      startDate,
      endDate
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {};

    // Build filter query
    if (status) query.status = status;
    if (type) query.type = type;
    if (targetAudience) query.targetAudience = targetAudience;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const notifications = await Notification.find(query)
      .populate('createdBy', 'fullName email')
      .populate('targetUsers', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error getting notification history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification history',
      error: error.message
    });
  }
});

// Get specific notification details (admin)
router.get('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id)
      .populate('createdBy', 'fullName email')
      .populate('targetUsers', 'fullName email')
      .populate('sentTo.user', 'fullName email');

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Error getting notification details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification details',
      error: error.message
    });
  }
});

// Update notification (admin)
router.put('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Can only update pending notifications
    if (notification.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Can only update pending notifications'
      });
    }

    // Don't allow changing certain fields
    delete updates.status;
    delete updates.sentAt;
    delete updates.sentTo;
    delete updates.createdBy;
    delete updates.updatedBy;

    updates.updatedBy = req.user.userId;

    const updatedNotification = await Notification.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate('createdBy', 'fullName email');

    res.json({
      success: true,
      message: 'Notification updated successfully',
      data: updatedNotification
    });
  } catch (error) {
    console.error('Error updating notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification',
      error: error.message
    });
  }
});

// Cancel scheduled notification (admin)
router.post('/:id/cancel', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    await notificationService.cancelScheduledNotification(id);

    res.json({
      success: true,
      message: 'Notification cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel notification',
      error: error.message
    });
  }
});

// Delete notification (admin)
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Can only delete pending or failed notifications
    if (notification.status === 'sent') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete sent notifications'
      });
    }

    // Cancel scheduled job if exists
    if (notification.scheduledFor && notification.status === 'pending') {
      await notificationService.cancelScheduledNotification(id);
    }

    await Notification.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message
    });
  }
});

// Get notification statistics (admin)
router.get('/stats/overview', auth, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateRange = null;
    if (startDate || endDate) {
      dateRange = {};
      if (startDate) dateRange.start = new Date(startDate);
      if (endDate) dateRange.end = new Date(endDate);
    }

    const stats = await notificationService.getNotificationStats(dateRange);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification statistics',
      error: error.message
    });
  }
});

// Get user's device tokens (user)
router.get('/my-tokens', auth, async (req, res) => {
  try {
    const tokens = await DeviceToken.find({
      user: req.user.userId,
      isActive: true
    }).select('token platform appVersion lastUsedAt createdAt');

    res.json({
      success: true,
      data: tokens
    });
  } catch (error) {
    console.error('Error getting user tokens:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get device tokens',
      error: error.message
    });
  }
});

// Process pending notifications (admin - manual trigger)
router.post('/process-pending', auth, requireAdmin, async (req, res) => {
  try {
    await notificationService.processPendingNotifications();

    res.json({
      success: true,
      message: 'Pending notifications processed successfully'
    });
  } catch (error) {
    console.error('Error processing pending notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process pending notifications',
      error: error.message
    });
  }
});

// Retry failed notifications (admin - manual trigger)
router.post('/retry-failed', auth, requireAdmin, async (req, res) => {
  try {
    await notificationService.retryFailedNotifications();

    res.json({
      success: true,
      message: 'Failed notifications retried successfully'
    });
  } catch (error) {
    console.error('Error retrying failed notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry notifications',
      error: error.message
    });
  }
});

// Cleanup old data (admin)
router.post('/cleanup', auth, requireAdmin, async (req, res) => {
  try {
    const result = await notificationService.cleanupOldData();

    res.json({
      success: true,
      message: 'Data cleanup completed successfully',
      data: result
    });
  } catch (error) {
    console.error('Error cleaning up old data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup old data',
      error: error.message
    });
  }
});

module.exports = router;