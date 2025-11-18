const { messaging } = require('../config/firebase');
const Notification = require('../models/Notification');
const DeviceToken = require('../models/DeviceToken');
const User = require('../models/User');
const schedule = require('node-schedule');

class NotificationService {
  constructor() {
    this.isInitialized = !!messaging;
    this.scheduledJobs = new Map(); // Store scheduled jobs
  }

  // Register device token
  async registerDeviceToken(userId, token, platform, appVersion, deviceInfo = {}) {
    try {
      const deviceToken = await DeviceToken.registerToken(
        userId,
        token,
        platform,
        appVersion,
        deviceInfo
      );

      console.log(`Device token registered for user ${userId}: ${token.substring(0, 20)}...`);
      return deviceToken;
    } catch (error) {
      console.error('Error registering device token:', error);
      throw error;
    }
  }

  // Send notification to specific user
  async sendToUser(userId, title, body, data = {}, options = {}) {
    try {
      const tokens = await DeviceToken.getActiveTokensForUser(userId);

      if (tokens.length === 0) {
        throw new Error('No active device tokens found for user');
      }

      const results = [];
      for (const tokenDoc of tokens) {
        const result = await this.sendToDeviceToken(
          tokenDoc.token,
          title,
          body,
          data,
          options,
          userId
        );
        results.push(result);
      }

      return results;
    } catch (error) {
      console.error('Error sending notification to user:', error);
      throw error;
    }
  }

  // Send notification to multiple users
  async sendToMultipleUsers(userIds, title, body, data = {}, options = {}) {
    try {
      const tokens = await DeviceToken.find({
        user: { $in: userIds },
        isActive: true
      }).select('token user').populate('user');

      if (tokens.length === 0) {
        throw new Error('No active device tokens found for users');
      }

      return await this.sendToDeviceTokens(
        tokens,
        title,
        body,
        data,
        options
      );
    } catch (error) {
      console.error('Error sending notification to multiple users:', error);
      throw error;
    }
  }

  // Send notification to topic
  async sendToTopic(topic, title, body, data = {}, options = {}) {
    try {
      if (!this.isInitialized) {
        throw new Error('Firebase Admin SDK not initialized');
      }

      const message = {
        notification: {
          title,
          body,
        },
        data: this.sanitizeData(data),
        topic,
        android: {
          priority: options.priority === 'high' ? 'high' : 'normal',
          sound: options.sound || 'default',
          channelId: options.channelId || 'general',
          ttl: options.ttl ? options.ttl * 1000 : 3600 * 1000, // Convert to milliseconds
        },
        apns: {
          payload: {
            aps: {
              sound: options.sound || 'default',
              badge: options.badge || 1,
              contentAvailable: true,
            },
          },
          headers: {
            'apns-priority': options.priority === 'high' ? '10' : '5',
            'apns-expiration': options.ttl ? String(Math.floor(Date.now() / 1000) + options.ttl) : undefined,
          },
        },
      };

      const response = await messaging.send(message);
      console.log(`Successfully sent message to topic "${topic}":`, response);
      return response;
    } catch (error) {
      console.error('Error sending notification to topic:', error);
      throw error;
    }
  }

  // Send to all users
  async sendToAll(title, body, data = {}, options = {}) {
    try {
      // Get all active tokens
      const tokens = await DeviceToken.getAllActiveTokens();

      if (tokens.length === 0) {
        throw new Error('No active device tokens found');
      }

      // Send in batches (FCM supports up to 500 tokens per request)
      const batchSize = 500;
      const batches = [];

      for (let i = 0; i < tokens.length; i += batchSize) {
        batches.push(tokens.slice(i, i + batchSize));
      }

      const results = [];
      for (const batch of batches) {
        const result = await this.sendToDeviceTokens(
          batch,
          title,
          body,
          data,
          options
        );
        results.push(result);
      }

      return {
        successCount: results.reduce((sum, r) => sum + r.successCount, 0),
        failureCount: results.reduce((sum, r) => sum + r.failureCount, 0),
        results
      };
    } catch (error) {
      console.error('Error sending notification to all users:', error);
      throw error;
    }
  }

  // Send to device tokens
  async sendToDeviceTokens(tokens, title, body, data = {}, options = {}) {
    try {
      if (!this.isInitialized) {
        throw new Error('Firebase Admin SDK not initialized');
      }

      const message = {
        notification: {
          title,
          body,
        },
        data: this.sanitizeData(data),
        tokens: tokens.map(t => t.token),
        android: {
          priority: options.priority === 'high' ? 'high' : 'normal',
          sound: options.sound || 'default',
          channelId: options.channelId || 'general',
          ttl: options.ttl ? options.ttl * 1000 : 3600 * 1000,
        },
        apns: {
          payload: {
            aps: {
              sound: options.sound || 'default',
              badge: options.badge || 1,
              contentAvailable: true,
            },
          },
          headers: {
            'apns-priority': options.priority === 'high' ? '10' : '5',
            'apns-expiration': options.ttl ? String(Math.floor(Date.now() / 1000) + options.ttl) : undefined,
          },
        },
      };

      const response = await messaging.sendMulticast(message);

      // Handle failed tokens
      if (response.failureCount > 0) {
        await this.handleFailedTokens(response.responses, tokens.map(t => t.token));
      }

      // Track results
      const results = response.responses.map((resp, index) => ({
        userId: tokens[index].user,
        token: tokens[index].token,
        success: resp.success,
        messageId: resp.messageId,
        error: resp.error ? resp.error.message : null,
        sentAt: new Date()
      }));

      console.log(`Multicast: ${response.successCount} successful, ${response.failureCount} failed`);

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        results
      };
    } catch (error) {
      console.error('Error sending to device tokens:', error);
      throw error;
    }
  }

  // Send to single device token
  async sendToDeviceToken(token, title, body, data = {}, options = {}, userId = null) {
    try {
      if (!this.isInitialized) {
        throw new Error('Firebase Admin SDK not initialized');
      }

      const message = {
        notification: {
          title,
          body,
        },
        data: this.sanitizeData(data),
        token,
        android: {
          priority: options.priority === 'high' ? 'high' : 'normal',
          sound: options.sound || 'default',
          channelId: options.channelId || 'general',
          ttl: options.ttl ? options.ttl * 1000 : 3600 * 1000,
        },
        apns: {
          payload: {
            aps: {
              sound: options.sound || 'default',
              badge: options.badge || 1,
              contentAvailable: true,
            },
          },
          headers: {
            'apns-priority': options.priority === 'high' ? '10' : '5',
            'apns-expiration': options.ttl ? String(Math.floor(Date.now() / 1000) + options.ttl) : undefined,
          },
        },
      };

      const response = await messaging.send(message);
      console.log(`Successfully sent message to token:`, response);

      return {
        userId,
        token,
        success: true,
        messageId: response,
        error: null,
        sentAt: new Date()
      };
    } catch (error) {
      if (error.code === 'messaging/registration-token-not-registered' ||
          error.code === 'messaging/invalid-registration-token') {
        // Deactivate invalid token
        await DeviceToken.deactivateToken(token);
        console.log(`Deactivated invalid token: ${token.substring(0, 20)}...`);
      }

      console.error('Error sending to device token:', error);

      return {
        userId,
        token,
        success: false,
        messageId: null,
        error: error.message,
        sentAt: new Date()
      };
    }
  }

  // Handle failed tokens and deactivate them
  async handleFailedTokens(responses, tokens) {
    const failedTokens = [];

    responses.forEach((response, index) => {
      if (!response.success) {
        const error = response.error;
        if (
          error.code === 'messaging/registration-token-not-registered' ||
          error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/unregistered'
        ) {
          failedTokens.push(tokens[index]);
        }
      }
    });

    // Deactivate failed tokens
    if (failedTokens.length > 0) {
      await DeviceToken.updateMany(
        { token: { $in: failedTokens } },
        { isActive: false, lastUsedAt: new Date() }
      );
      console.log(`Deactivated ${failedTokens.length} invalid tokens`);
    }
  }

  // Sanitize data object (convert all values to strings)
  sanitizeData(data) {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        sanitized[key] = String(value);
      }
    }
    return sanitized;
  }

  // Create and schedule notification
  async createScheduledNotification(notificationData) {
    try {
      const notification = await Notification.createNotification(notificationData);

      if (notification.scheduledFor && notification.scheduledFor > new Date()) {
        // Schedule for later
        await this.scheduleNotification(notification);
      } else {
        // Send immediately
        await this.sendNotification(notification);
      }

      return notification;
    } catch (error) {
      console.error('Error creating scheduled notification:', error);
      throw error;
    }
  }

  // Send notification from database record
  async sendNotification(notification) {
    try {
      let results = [];

      switch (notification.targetAudience) {
        case 'all':
          results = await this.sendToAll(
            notification.title,
            notification.body,
            notification.data,
            {
              channelId: notification.type,
              imageUrl: notification.imageUrl,
              priority: notification.priority,
              ttl: notification.ttl
            }
          );
          break;

        case 'users':
          const users = await User.find({ role: 'user' }).select('_id');
          results = await this.sendToMultipleUsers(
            users.map(u => u._id),
            notification.title,
            notification.body,
            notification.data,
            {
              channelId: notification.type,
              imageUrl: notification.imageUrl,
              priority: notification.priority,
              ttl: notification.ttl
            }
          );
          break;

        case 'agents':
          const agents = await User.find({ role: 'agent' }).select('_id');
          results = await this.sendToMultipleUsers(
            agents.map(a => a._id),
            notification.title,
            notification.body,
            notification.data,
            {
              channelId: notification.type,
              imageUrl: notification.imageUrl,
              priority: notification.priority,
              ttl: notification.ttl
            }
          );
          break;

        case 'admins':
          const admins = await User.find({ role: 'admin' }).select('_id');
          results = await this.sendToMultipleUsers(
            admins.map(a => a._id),
            notification.title,
            notification.body,
            notification.data,
            {
              channelId: notification.type,
              imageUrl: notification.imageUrl,
              priority: notification.priority,
              ttl: notification.ttl
            }
          );
          break;

        case 'specific':
          if (notification.targetUsers.length > 0) {
            results = await this.sendToMultipleUsers(
              notification.targetUsers,
              notification.title,
              notification.body,
              notification.data,
              {
                channelId: notification.type,
                imageUrl: notification.imageUrl,
                priority: notification.priority,
                ttl: notification.ttl
              }
            );
          }
          break;

        default:
          throw new Error(`Invalid target audience: ${notification.targetAudience}`);
      }

      // Update notification status
      await notification.markAsSent(results.results || results);

      return results;
    } catch (error) {
      console.error('Error sending notification:', error);

      // Update notification status to failed
      await notification.markAsFailed(error.message);

      throw error;
    }
  }

  // Schedule notification for later
  async scheduleNotification(notification) {
    try {
      const jobName = `notification-${notification._id}`;

      // Cancel existing job if any
      if (this.scheduledJobs.has(jobName)) {
        this.scheduledJobs.get(jobName).cancel();
      }

      const job = schedule.scheduleJob(notification.scheduledFor, async () => {
        try {
          console.log(`Executing scheduled notification: ${notification._id}`);
          await this.sendNotification(notification);
          this.scheduledJobs.delete(jobName);
        } catch (error) {
          console.error(`Error executing scheduled notification ${notification._id}:`, error);
        }
      });

      this.scheduledJobs.set(jobName, job);
      console.log(`Scheduled notification ${notification._id} for ${notification.scheduledFor}`);

      return job;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      throw error;
    }
  }

  // Cancel scheduled notification
  async cancelScheduledNotification(notificationId) {
    try {
      const notification = await Notification.findById(notificationId);
      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.status === 'sent') {
        throw new Error('Cannot cancel a notification that has already been sent');
      }

      await notification.cancel();

      const jobName = `notification-${notificationId}`;
      if (this.scheduledJobs.has(jobName)) {
        this.scheduledJobs.get(jobName).cancel();
        this.scheduledJobs.delete(jobName);
      }

      return true;
    } catch (error) {
      console.error('Error canceling scheduled notification:', error);
      throw error;
    }
  }

  // Process all pending notifications
  async processPendingNotifications() {
    try {
      const notifications = await Notification.getReadyToSend();
      console.log(`Processing ${notifications.length} pending notifications`);

      for (const notification of notifications) {
        try {
          await this.sendNotification(notification);
        } catch (error) {
          console.error(`Failed to send notification ${notification._id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing pending notifications:', error);
    }
  }

  // Retry failed notifications
  async retryFailedNotifications() {
    try {
      const notifications = await Notification.getRetryableNotifications();
      console.log(`Retrying ${notifications.length} failed notifications`);

      for (const notification of notifications) {
        try {
          await this.sendNotification(notification);
        } catch (error) {
          console.error(`Failed to retry notification ${notification._id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error retrying failed notifications:', error);
    }
  }

  // Get notification statistics
  async getNotificationStats(dateRange = null) {
    try {
      const notificationStats = await Notification.getStats(dateRange);

      const deviceStats = await DeviceToken.aggregate([
        {
          $group: {
            _id: '$platform',
            total: { $sum: 1 },
            active: { $sum: { $cond: ['$isActive', 1, 0] } },
          },
        },
      ]);

      return {
        notifications: notificationStats,
        devices: deviceStats,
        scheduledJobs: this.scheduledJobs.size
      };
    } catch (error) {
      console.error('Error getting notification stats:', error);
      throw error;
    }
  }

  // Cleanup old data
  async cleanupOldData() {
    try {
      // Clean up old inactive device tokens
      const deletedTokens = await DeviceToken.cleanupOldTokens(30);
      console.log(`Cleaned up ${deletedTokens.deletedCount} old device tokens`);

      // Clean up old sent notifications (older than 90 days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const deletedNotifications = await Notification.deleteMany({
        status: 'sent',
        sentAt: { $lt: cutoffDate }
      });

      console.log(`Cleaned up ${deletedNotifications.deletedCount} old notifications`);

      return {
        deletedTokens: deletedTokens.deletedCount,
        deletedNotifications: deletedNotifications.deletedCount
      };
    } catch (error) {
      console.error('Error cleaning up old data:', error);
      throw error;
    }
  }

  // Send new property notification
  async sendNewPropertyNotification(propertyId, propertyTitle, propertyImage, targetAudience = 'users') {
    try {
      const notification = await this.createScheduledNotification({
        title: 'New Property Listed!',
        body: `${propertyTitle} is now available for viewing`,
        type: 'new_property',
        targetAudience,
        data: {
          type: 'new_property',
          propertyId,
          action: 'view_property',
        },
        imageUrl: propertyImage,
        createdBy: null, // System generated
      });

      return notification;
    } catch (error) {
      console.error('Error sending new property notification:', error);
      throw error;
    }
  }

  // Check if service is initialized
  isServiceInitialized() {
    return this.isInitialized;
  }
}

module.exports = new NotificationService();