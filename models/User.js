// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
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
    required: true,
    trim: true
  },
  propertyType: [{
    type: String,
    enum: ['Apartment', 'House', 'Villa', 'Cottage', 'Commercial', 'Land']
  }],
  userType: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  profileImage: {
    type: String,
    default: null
  }
}, {
  timestamps: true // This automatically adds createdAt and updatedAt
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ userType: 1 });
userSchema.index({ contactNumber: 1 });

module.exports = mongoose.model('User', userSchema);