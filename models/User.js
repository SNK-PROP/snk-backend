// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firebaseId: {
    type: String,
    unique: true,
    sparse: true, // Allow null values and only enforce uniqueness on non-null values
    trim: true
  },
  contactNumber: {
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
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  propertyType: [{
    type: String,
    enum: ['Apartment', 'House', 'Villa', 'Cottage', 'Commercial', 'Land']
  }],
  userType: {
    type: String,
    enum: ['user', 'admin', 'broker', 'sub_broker'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  profileImage: {
    type: String,
    default: null
  },
  kycDocuments: [{
    type: {
      type: String,
      enum: ['aadhar', 'pan', 'license', 'other']
    },
    url: {
      type: String,
      required: true
    },
    key: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  parentBrokerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
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
  timestamps: true // This automatically adds createdAt and updatedAt
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ userType: 1 });
userSchema.index({ contactNumber: 1 });
userSchema.index({ firebaseId: 1 });

module.exports = mongoose.model('User', userSchema);