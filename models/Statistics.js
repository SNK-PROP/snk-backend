// models/Statistics.js
const mongoose = require('mongoose');

const statisticsSchema = new mongoose.Schema({
  data: {
    downloads: {
      type: Number,
      default: 0
    },
    totalProperties: {
      type: Number,
      default: 0
    },
    users: {
      type: Number,
      default: 0
    },
    views: {
      type: Number,
      default: 0
    }
  },
  // You can have multiple statistics records for different time periods
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly', 'all-time'],
    default: 'all-time'
  },
  date: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better query performance
statisticsSchema.index({ period: 1, date: -1 });

module.exports = mongoose.model('Statistics', statisticsSchema);