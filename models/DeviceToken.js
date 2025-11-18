const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  platform: {
    type: String,
    enum: ['ios', 'android'],
    required: true,
  },
  appVersion: {
    type: String,
    trim: true,
  },
  deviceInfo: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastUsedAt: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Indexes for better performance
deviceTokenSchema.index({ user: 1, isActive: 1 });
deviceTokenSchema.index({ token: 1 });
deviceTokenSchema.index({ platform: 1, isActive: 1 });
deviceTokenSchema.index({ lastUsedAt: 1 });

// Update lastUsedAt on save
deviceTokenSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastUsedAt = new Date();
  }
  next();
});

// Static method to register or update device token
deviceTokenSchema.statics.registerToken = async function(userId, token, platform, appVersion, deviceInfo = {}) {
  try {
    // Update existing token or create new one
    const deviceToken = await this.findOneAndUpdate(
      { token },
      {
        user: userId,
        platform,
        appVersion,
        deviceInfo,
        isActive: true,
        lastUsedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    );

    // Optionally deactivate other tokens for the same user (uncomment if you want one token per user)
    // await this.updateMany(
    //   { user: userId, token: { $ne: token } },
    //   { isActive: false }
    // );

    return deviceToken;
  } catch (error) {
    console.error('Error registering device token:', error);
    throw error;
  }
};

// Static method to get active tokens for user
deviceTokenSchema.statics.getActiveTokensForUser = async function(userId) {
  return await this.find({
    user: userId,
    isActive: true
  }).select('token platform').sort({ lastUsedAt: -1 });
};

// Static method to get all active tokens
deviceTokenSchema.statics.getAllActiveTokens = async function(platform = null) {
  const query = { isActive: true };
  if (platform) {
    query.platform = platform;
  }

  return await this.find(query)
    .select('token platform user')
    .populate('user', 'name email role')
    .sort({ lastUsedAt: -1 });
};

// Static method to deactivate token
deviceTokenSchema.statics.deactivateToken = async function(token) {
  return await this.updateOne(
    { token },
    { isActive: false, lastUsedAt: new Date() }
  );
};

// Static method to cleanup old inactive tokens
deviceTokenSchema.statics.cleanupOldTokens = async function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return await this.deleteMany({
    isActive: false,
    lastUsedAt: { $lt: cutoffDate }
  });
};

// Instance method to refresh token usage
deviceTokenSchema.methods.refreshUsage = async function() {
  this.lastUsedAt = new Date();
  this.isActive = true;
  return await this.save();
};

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);