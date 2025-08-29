const mongoose = require('mongoose');

const appVersionSchema = new mongoose.Schema({
  platform: {
    type: String,
    enum: ['android', 'ios'],
    required: true
  },
  version: {
    type: String,
    required: true,
    trim: true
  },
  buildNumber: {
    type: Number,
    required: true
  },
  isForceUpdate: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  updateUrl: {
    type: String,
    required: true,
    trim: true
  },
  releaseNotes: {
    type: String,
    trim: true,
    default: ''
  },
  releaseDate: {
    type: Date,
    default: Date.now
  },
  minimumSupportedVersion: {
    type: String,
    trim: true,
    default: '1.0.0'
  },
  features: [{
    type: String,
    trim: true
  }],
  bugFixes: [{
    type: String,
    trim: true
  }],
  downloadSize: {
    type: String, // e.g., "25.4 MB"
    default: ''
  },
  targetSdkVersion: {
    type: Number, // For Android
    default: null
  },
  minimumOsVersion: {
    type: String, // e.g., "iOS 13.0" or "Android 7.0"
    default: ''
  }
}, {
  timestamps: true
});

// Compound index to ensure one active version per platform
appVersionSchema.index({ platform: 1, isActive: 1 }, { 
  unique: true, 
  partialFilterExpression: { isActive: true } 
});

// Index for version lookups
appVersionSchema.index({ platform: 1, version: 1 });
appVersionSchema.index({ buildNumber: -1 });

// Static method to get current active version for platform
appVersionSchema.statics.getCurrentVersion = async function(platform) {
  return await this.findOne({ 
    platform: platform.toLowerCase(), 
    isActive: true 
  }).sort({ buildNumber: -1 });
};

// Static method to get all versions for platform (for admin)
appVersionSchema.statics.getAllVersions = async function(platform, limit = 10) {
  return await this.find({ 
    platform: platform.toLowerCase() 
  })
  .sort({ buildNumber: -1 })
  .limit(limit);
};

// Method to compare versions
appVersionSchema.statics.compareVersions = function(version1, version2) {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);
  const maxLength = Math.max(v1Parts.length, v2Parts.length);

  for (let i = 0; i < maxLength; i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;

    if (v1Part < v2Part) return -1;
    if (v1Part > v2Part) return 1;
  }
  return 0;
};

// Method to check if version needs update
appVersionSchema.statics.needsUpdate = async function(platform, currentVersion) {
  const latestVersion = await this.getCurrentVersion(platform);
  
  if (!latestVersion) {
    return { needsUpdate: false, message: 'No version information available' };
  }

  const comparison = this.compareVersions(currentVersion, latestVersion.version);
  
  if (comparison < 0) {
    return {
      needsUpdate: true,
      latestVersion: latestVersion.toObject(),
      isForceUpdate: latestVersion.isForceUpdate
    };
  }

  return { needsUpdate: false, message: 'App is up to date' };
};

module.exports = mongoose.model('AppVersion', appVersionSchema);