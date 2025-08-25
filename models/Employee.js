const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    unique: true,
    trim: true
  },
  employeeName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  referralCode: {
    type: String,
    unique: true,
    trim: true,
    uppercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  joinDate: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  role: {
    type: String,
    enum: ['field_agent', 'team_lead', 'manager'],
    default: 'field_agent'
  },
  targets: {
    monthly: {
      users: {
        type: Number,
        default: 30
      },
      brokers: {
        type: Number,
        default: 10
      }
    },
    quarterly: {
      users: {
        type: Number,
        default: 90
      },
      brokers: {
        type: Number,
        default: 30
      }
    }
  },
  commissionRates: {
    userRegistration: {
      type: Number,
      default: 50 // ₹50 per user registration
    },
    brokerRegistration: {
      type: Number,
      default: 200 // ₹200 per broker registration
    },
    brokerFirstProperty: {
      type: Number,
      default: 500 // ₹500 bonus when broker lists first property
    },
    monthlyBonus: {
      userTarget: {
        achievement: { type: Number, default: 30 },
        bonus: { type: Number, default: 2000 }
      },
      brokerTarget: {
        achievement: { type: Number, default: 10 },
        bonus: { type: Number, default: 5000 }
      }
    }
  },
  bankDetails: {
    accountNumber: {
      type: String,
      default: ''
    },
    ifscCode: {
      type: String,
      default: ''
    },
    bankName: {
      type: String,
      default: ''
    },
    accountHolderName: {
      type: String,
      default: ''
    }
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String
  },
  documents: [{
    type: {
      type: String,
      enum: ['aadhar', 'pan', 'photo', 'other']
    },
    url: String,
    key: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastLogin: {
    type: Date,
    default: null
  },
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Generate unique referral code before saving
employeeSchema.pre('save', async function(next) {
  if (this.isNew && !this.referralCode) {
    let isUnique = false;
    let referralCode;
    
    while (!isUnique) {
      // Generate referral code: EMP + 4 random alphanumeric characters
      const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
      referralCode = `EMP${randomPart}`;
      
      // Check if this code already exists
      const existingEmployee = await this.constructor.findOne({ referralCode });
      if (!existingEmployee) {
        isUnique = true;
      }
    }
    
    this.referralCode = referralCode;
  }
  next();
});

// Generate unique employee ID before saving
employeeSchema.pre('save', async function(next) {
  if (this.isNew && !this.employeeId) {
    let isUnique = false;
    let employeeId;
    
    while (!isUnique) {
      // Generate employee ID: SNK + current year + 4 digit number
      const year = new Date().getFullYear();
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      employeeId = `SNK${year}${randomNum}`;
      
      // Check if this ID already exists
      const existingEmployee = await this.constructor.findOne({ employeeId });
      if (!existingEmployee) {
        isUnique = true;
      }
    }
    
    this.employeeId = employeeId;
  }
  next();
});

// Indexes for better query performance
employeeSchema.index({ employeeId: 1 });
employeeSchema.index({ email: 1 });
employeeSchema.index({ referralCode: 1 });
employeeSchema.index({ isActive: 1 });
employeeSchema.index({ role: 1 });

// Virtual for full name
employeeSchema.virtual('stats', {
  ref: 'ReferralStats',
  localField: '_id',
  foreignField: 'employeeId'
});

// Method to calculate total earnings
employeeSchema.methods.calculateMonthlyEarnings = async function(year, month) {
  const ReferralStats = require('./ReferralStats');
  const stats = await ReferralStats.findOne({
    employeeId: this._id,
    year: year,
    month: month
  });
  
  if (!stats) return 0;
  
  let totalEarnings = 0;
  totalEarnings += stats.usersReferred * this.commissionRates.userRegistration;
  totalEarnings += stats.brokersReferred * this.commissionRates.brokerRegistration;
  totalEarnings += stats.brokerFirstProperties * this.commissionRates.brokerFirstProperty;
  
  // Add monthly bonuses if targets are met
  if (stats.usersReferred >= this.commissionRates.monthlyBonus.userTarget.achievement) {
    totalEarnings += this.commissionRates.monthlyBonus.userTarget.bonus;
  }
  
  if (stats.brokersReferred >= this.commissionRates.monthlyBonus.brokerTarget.achievement) {
    totalEarnings += this.commissionRates.monthlyBonus.brokerTarget.bonus;
  }
  
  return totalEarnings;
};

module.exports = mongoose.model('Employee', employeeSchema);