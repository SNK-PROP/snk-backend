// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Statistics = require('../models/Statistics');
const Employee = require('../models/Employee');
const ReferralStats = require('../models/ReferralStats');
const auth = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, contactNumber, location, propertyType, referralCode, userType } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Validate referral code if provided
    let referringEmployee = null;
    if (referralCode) {
      referringEmployee = await Employee.findOne({ 
        referralCode: referralCode.toUpperCase(), 
        isActive: true 
      });
      
      if (!referringEmployee) {
        return res.status(400).json({ message: 'Invalid referral code' });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Determine user type (default to 'user' if not specified)
    const finalUserType = userType || 'user';

    // Create new user
    const user = new User({
      email,
      password: hashedPassword,
      fullName,
      contactNumber,
      location,
      propertyType: propertyType || [],
      userType: finalUserType,
      referredBy: referringEmployee?._id || null,
      referralCode: referralCode?.toUpperCase() || null,
      referralDate: referringEmployee ? new Date() : null
    });

    await user.save();

    // Update referral statistics if user was referred
    if (referringEmployee) {
      try {
        const commission = finalUserType === 'broker' ? 
          referringEmployee.commissionRates.brokerRegistration : 
          referringEmployee.commissionRates.userRegistration;

        await ReferralStats.updateStats(
          referringEmployee._id, 
          finalUserType, 
          commission, 
          false
        );

        console.log(`Referral tracked: ${referringEmployee.employeeName} referred ${finalUserType} ${fullName}`);
      } catch (referralError) {
        console.error('Error tracking referral:', referralError);
        // Don't fail registration if referral tracking fails
      }
    }

    // Update user statistics
    await updateUserStats(1);

    // Send welcome email (don't wait for it to complete)
    emailService.sendWelcomeEmail(email, fullName).catch(error => {
      console.error('Failed to send welcome email:', error);
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, userType: user.userType },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        contactNumber: user.contactNumber,
        location: user.location,
        propertyType: user.propertyType,
        userType: user.userType,
        referredBy: referringEmployee ? {
          employeeName: referringEmployee.employeeName,
          referralCode: referringEmployee.referralCode
        } : null,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, userType: user.userType },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        contactNumber: user.contactNumber,
        location: user.location,
        propertyType: user.propertyType,
        userType: user.userType,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get current user profile
router.get('/profile', auth.auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
});

// Update user profile
router.put('/profile', auth.auth, async (req, res) => {
  try {
    const { fullName, contactNumber, location, propertyType } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      {
        fullName,
        contactNumber,
        location,
        propertyType
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

// Change password
router.put('/change-password', auth.auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Server error changing password' });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email address' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date();
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // Token expires in 1 hour

    // Save reset token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    await user.save();

    // Send password reset email
    try {
      await emailService.sendPasswordResetEmail(email, resetToken);
      res.json({
        message: 'If an account with this email exists, password reset instructions have been sent to your email address.'
      });
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      // Still return success for security reasons (don't reveal if email exists)
      res.json({
        message: 'If an account with this email exists, password reset instructions have been sent to your email address.'
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error during password reset request' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
      isActive: true
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error during password reset' });
  }
});

// Helper function to update user statistics
async function updateUserStats(increment = 0) {
  try {
    await Statistics.findOneAndUpdate(
      { period: 'all-time' },
      { 
        $inc: { 'data.users': increment },
        $set: { date: new Date() }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error updating user stats:', error);
  }
}

module.exports = router;