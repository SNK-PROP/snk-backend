const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  body: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  type: {
    type: String,
    enum: ['general', 'new_property', 'system', 'marketing', 'alert', 'price_drop', 'new_message'],
    default: 'general',
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  targetAudience: {
    type: String,
    enum: ['all', 'users', 'agents', 'admins', 'specific'],
    default: 'all',
  },
  targetUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  imageUrl: {
    type: String,
    trim: true,
  },
  scheduledFor: {
    type: Date,
  },
  sentAt: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['pending', 'sending', 'sent', 'failed', 'cancelled'],
    default: 'pending',
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high'],
    default: 'normal',
  },
  ttl: {
    type: Number, // Time to live in seconds
    default: 3600, // 1 hour
  },
  sentTo: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    token: String,
    sentAt: Date,
    status: {
      type: String,
      enum: ['sent', 'failed'],
    },
    error: String,
    messageId: String,
  }],
  deliveryStats: {
    totalRecipients: { type: Number, default: 0 },
    successfulDeliveries: { type: Number, default: 0 },
    failedDeliveries: { type: Number, default: 0 },
    opens: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
  retryCount: {
    type: Number,
    default: 0,
    max: 3,
  },
  lastRetryAt: Date,
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Indexes for better performance
notificationSchema.index({ status: 1, scheduledFor: 1 });
notificationSchema.index({ targetAudience: 1, type: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ createdBy: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for checking if notification is ready to send
notificationSchema.virtual('isReadyToSend').get(function() {
  return this.status === 'pending' &&
         (!this.scheduledFor || this.scheduledFor <= new Date());
});

// Virtual for checking if notification can be retried
notificationSchema.virtual('canRetry').get(function() {
  return this.status === 'failed' &&
         this.retryCount < 3 &&
         (!this.lastRetryAt || this.lastRetryAt < new Date(Date.now() - 5 * 60 * 1000)); // 5 minutes ago
});

// Pre-save middleware
notificationSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'sent' && !this.sentAt) {
    this.sentAt = new Date();
  }

  if (this.isModified('scheduledFor') && this.scheduledFor && this.scheduledFor <= new Date()) {
    this.scheduledFor = undefined; // Clear scheduled time if it's in the past
  }

  next();
});

// Static method to create notification
notificationSchema.statics.createNotification = async function(notificationData) {
  try {
    const notification = new this(notificationData);
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// Static method to get scheduled notifications ready to send
notificationSchema.statics.getReadyToSend = async function() {
  return await this.find({
    status: 'pending',
    $or: [
      { scheduledFor: { $lte: new Date() } },
      { scheduledFor: { $exists: false } }
    ]
  }).populate('createdBy targetUsers');
};

// Static method to get failed notifications that can be retried
notificationSchema.statics.getRetryableNotifications = async function() {
  return await this.find({
    status: 'failed',
    retryCount: { $lt: 3 },
    $or: [
      { lastRetryAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }, // 5 minutes ago
      { lastRetryAt: { $exists: false } }
    ]
  }).populate('createdBy targetUsers');
};

// Static method to get notification statistics
notificationSchema.statics.getStats = async function(dateRange = null) {
  const matchQuery = {};
  if (dateRange) {
    matchQuery.createdAt = {
      $gte: dateRange.start,
      $lte: dateRange.end
    };
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        successfulDeliveries: { $sum: '$deliveryStats.successfulDeliveries' },
        failedDeliveries: { $sum: '$deliveryStats.failedDeliveries' },
        totalRecipients: { $sum: '$deliveryStats.totalRecipients' },
      }
    }
  ]);

  const typeStats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        successfulDeliveries: { $sum: '$deliveryStats.successfulDeliveries' }
      }
    }
  ]);

  return {
    overview: stats[0] || { total: 0, sent: 0, pending: 0, failed: 0 },
    byType: typeStats
  };
};

// Instance method to mark as sent
notificationSchema.methods.markAsSent = async function(deliveryResults = []) {
  this.status = 'sent';
  this.sentAt = new Date();

  // Update delivery statistics
  if (deliveryResults.length > 0) {
    this.deliveryStats.totalRecipients = deliveryResults.length;
    this.deliveryStats.successfulDeliveries = deliveryResults.filter(r => r.success).length;
    this.deliveryStats.failedDeliveries = deliveryResults.filter(r => !r.success).length;

    this.sentTo = deliveryResults.map(r => ({
      user: r.userId,
      token: r.token,
      sentAt: r.sentAt,
      status: r.success ? 'sent' : 'failed',
      error: r.error,
      messageId: r.messageId
    }));
  }

  return await this.save();
};

// Instance method to mark as failed
notificationSchema.methods.markAsFailed = async function(error) {
  this.status = 'failed';
  this.retryCount += 1;
  this.lastRetryAt = new Date();

  // Log error for debugging
  console.error(`Notification ${this._id} failed:`, error);

  return await this.save();
};

// Instance method to update delivery stats
notificationSchema.methods.updateDeliveryStats = async function(userId, success, messageId = null, error = null) {
  const existingEntry = this.sentTo.find(entry =>
    entry.user && entry.user.toString() === userId.toString()
  );

  if (existingEntry) {
    existingEntry.status = success ? 'sent' : 'failed';
    existingEntry.error = error;
    if (messageId) existingEntry.messageId = messageId;
  } else {
    this.sentTo.push({
      user: userId,
      status: success ? 'sent' : 'failed',
      error: error,
      messageId: messageId,
      sentAt: new Date()
    });
  }

  // Recalculate stats
  this.deliveryStats.successfulDeliveries = this.sentTo.filter(entry => entry.status === 'sent').length;
  this.deliveryStats.failedDeliveries = this.sentTo.filter(entry => entry.status === 'failed').length;
  this.deliveryStats.totalRecipients = this.sentTo.length;

  return await this.save();
};

// Instance method to cancel notification
notificationSchema.methods.cancel = async function() {
  if (this.status === 'sent') {
    throw new Error('Cannot cancel a notification that has already been sent');
  }

  this.status = 'cancelled';
  return await this.save();
};

module.exports = mongoose.model('Notification', notificationSchema);