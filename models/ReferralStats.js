const mongoose = require('mongoose');

const referralStatsSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  period: {
    type: String,
    required: true // Format: "2024-01"
  },
  usersReferred: {
    type: Number,
    default: 0
  },
  brokersReferred: {
    type: Number,
    default: 0
  },
  brokerFirstProperties: {
    type: Number,
    default: 0 // Count of brokers who listed their first property this month
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  bonusEarnings: {
    type: Number,
    default: 0 // Monthly bonuses for hitting targets
  },
  isPaid: {
    type: Boolean,
    default: false
  },
  paidDate: {
    type: Date,
    default: null
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  paymentReference: {
    type: String,
    default: ''
  },
  dailyStats: [{
    date: {
      type: Date,
      required: true
    },
    usersReferred: {
      type: Number,
      default: 0
    },
    brokersReferred: {
      type: Number,
      default: 0
    }
  }],
  referredUsers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    userType: {
      type: String,
      enum: ['user', 'broker']
    },
    registrationDate: {
      type: Date,
      default: Date.now
    },
    commission: {
      type: Number,
      default: 0
    },
    isFirstProperty: {
      type: Boolean,
      default: false // True if this is a broker's first property listing
    }
  }],
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Compound index for unique employee-period combination
referralStatsSchema.index({ employeeId: 1, period: 1 }, { unique: true });

// Additional indexes for better query performance
referralStatsSchema.index({ employeeId: 1, year: 1, month: 1 });
referralStatsSchema.index({ year: 1, month: 1 });
referralStatsSchema.index({ isPaid: 1 });
referralStatsSchema.index({ 'dailyStats.date': 1 });

// Method to add a new referral
referralStatsSchema.methods.addReferral = async function(userId, userType, commission, isFirstProperty = false) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // Add to referred users
  this.referredUsers.push({
    userId: userId,
    userType: userType,
    registrationDate: today,
    commission: commission,
    isFirstProperty: isFirstProperty
  });
  
  // Update counters
  if (userType === 'user') {
    this.usersReferred += 1;
  } else if (userType === 'broker') {
    this.brokersReferred += 1;
    if (isFirstProperty) {
      this.brokerFirstProperties += 1;
    }
  }
  
  // Update daily stats
  let dailyStat = this.dailyStats.find(stat => 
    stat.date.toISOString().split('T')[0] === todayStr
  );
  
  if (!dailyStat) {
    dailyStat = {
      date: today,
      usersReferred: 0,
      brokersReferred: 0
    };
    this.dailyStats.push(dailyStat);
  }
  
  if (userType === 'user') {
    dailyStat.usersReferred += 1;
  } else if (userType === 'broker') {
    dailyStat.brokersReferred += 1;
  }
  
  // Update total earnings
  this.totalEarnings += commission;
  
  await this.save();
  return this;
};

// Method to calculate and update earnings
referralStatsSchema.methods.calculateEarnings = async function() {
  const Employee = require('./Employee');
  const employee = await Employee.findById(this.employeeId);
  
  if (!employee) return 0;
  
  let totalEarnings = 0;
  let bonusEarnings = 0;
  
  // Calculate base commissions
  totalEarnings += this.usersReferred * employee.commissionRates.userRegistration;
  totalEarnings += this.brokersReferred * employee.commissionRates.brokerRegistration;
  totalEarnings += this.brokerFirstProperties * employee.commissionRates.brokerFirstProperty;
  
  // Calculate monthly bonuses
  if (this.usersReferred >= employee.commissionRates.monthlyBonus.userTarget.achievement) {
    bonusEarnings += employee.commissionRates.monthlyBonus.userTarget.bonus;
  }
  
  if (this.brokersReferred >= employee.commissionRates.monthlyBonus.brokerTarget.achievement) {
    bonusEarnings += employee.commissionRates.monthlyBonus.brokerTarget.bonus;
  }
  
  this.totalEarnings = totalEarnings;
  this.bonusEarnings = bonusEarnings;
  
  await this.save();
  return totalEarnings + bonusEarnings;
};

// Static method to create or update stats for an employee
referralStatsSchema.statics.updateStats = async function(employeeId, userType, commission, isFirstProperty = false) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // getMonth() returns 0-11
  const period = `${year}-${month.toString().padStart(2, '0')}`;
  
  try {
    let stats = await this.findOne({ employeeId, period });
    
    if (!stats) {
      stats = new this({
        employeeId,
        year,
        month,
        period,
        usersReferred: 0,
        brokersReferred: 0,
        brokerFirstProperties: 0,
        totalEarnings: 0,
        bonusEarnings: 0,
        dailyStats: [],
        referredUsers: []
      });
    }
    
    // Create a mock userId for the addReferral method
    const mockUserId = new mongoose.Types.ObjectId();
    await stats.addReferral(mockUserId, userType, commission, isFirstProperty);
    
    return stats;
  } catch (error) {
    console.error('Error updating referral stats:', error);
    throw error;
  }
};

// Static method to get employee performance for a period
referralStatsSchema.statics.getEmployeePerformance = async function(employeeId, year, month) {
  const period = `${year}-${month.toString().padStart(2, '0')}`;
  
  const stats = await this.findOne({ employeeId, period })
    .populate('employeeId', 'employeeName referralCode')
    .populate('referredUsers.userId', 'fullName email userType');
    
  return stats;
};

// Static method to get top performers
referralStatsSchema.statics.getTopPerformers = async function(year, month, limit = 10) {
  const period = `${year}-${month.toString().padStart(2, '0')}`;
  
  const topPerformers = await this.aggregate([
    { $match: { period } },
    {
      $lookup: {
        from: 'employees',
        localField: 'employeeId',
        foreignField: '_id',
        as: 'employee'
      }
    },
    { $unwind: '$employee' },
    {
      $addFields: {
        totalReferred: { $add: ['$usersReferred', '$brokersReferred'] },
        totalCommission: { $add: ['$totalEarnings', '$bonusEarnings'] }
      }
    },
    { $sort: { totalCommission: -1, totalReferred: -1 } },
    { $limit: limit },
    {
      $project: {
        employeeName: '$employee.employeeName',
        referralCode: '$employee.referralCode',
        usersReferred: 1,
        brokersReferred: 1,
        totalReferred: 1,
        totalCommission: 1,
        isPaid: 1
      }
    }
  ]);
  
  return topPerformers;
};

module.exports = mongoose.model('ReferralStats', referralStatsSchema);