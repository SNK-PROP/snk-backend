const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Employee = require('../models/Employee');
const ReferralStats = require('../models/ReferralStats');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Admin middleware - only admin can manage employees
const adminOnly = (req, res, next) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }
  next();
};

// Employee login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const employee = await Employee.findOne({ 
      email: email.toLowerCase(), 
      isActive: true 
    });

    if (!employee) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, employee.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Update last login
    employee.lastLogin = new Date();
    await employee.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: employee._id, 
        email: employee.email, 
        userType: 'employee',
        employeeId: employee.employeeId,
        referralCode: employee.referralCode
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Login successful',
      token,
      employee: {
        id: employee._id,
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        email: employee.email,
        phone: employee.phone,
        referralCode: employee.referralCode,
        role: employee.role,
        targets: employee.targets,
        lastLogin: employee.lastLogin
      }
    });
  } catch (error) {
    console.error('Employee login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Create new employee (Admin only)
router.post('/', auth.auth, adminOnly, async (req, res) => {
  try {
    const { 
      employeeName, 
      email, 
      phone, 
      password,
      role,
      targets,
      commissionRates,
      bankDetails,
      address 
    } = req.body;

    // Check if employee already exists
    const existingEmployee = await Employee.findOne({ email: email.toLowerCase() });
    if (existingEmployee) {
      return res.status(400).json({ message: 'Employee already exists with this email' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new employee
    const employee = new Employee({
      employeeName,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      role: role || 'field_agent',
      targets: targets || undefined,
      commissionRates: commissionRates || undefined,
      bankDetails: bankDetails || undefined,
      address: address || undefined
    });

    await employee.save();

    // Remove password from response
    const employeeResponse = employee.toObject();
    delete employeeResponse.password;

    res.status(201).json({
      message: 'Employee created successfully',
      employee: employeeResponse
    });
  } catch (error) {
    console.error('Employee creation error:', error);
    res.status(500).json({ message: 'Server error creating employee' });
  }
});

// Get all employees (Admin only)
router.get('/', auth.auth, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, role, isActive } = req.query;
    
    // Build filter object
    const filter = {};
    if (search) {
      filter.$or = [
        { employeeName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
        { referralCode: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const employees = await Employee.find(filter)
      .select('-password -resetPasswordToken')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Employee.countDocuments(filter);

    // Get current month stats for each employee
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const period = `${currentYear}-${currentMonth.toString().padStart(2, '0')}`;

    const employeesWithStats = await Promise.all(
      employees.map(async (employee) => {
        const stats = await ReferralStats.findOne({
          employeeId: employee._id,
          period: period
        });
        
        return {
          ...employee.toObject(),
          currentMonthStats: stats || {
            usersReferred: 0,
            brokersReferred: 0,
            totalEarnings: 0,
            bonusEarnings: 0
          }
        };
      })
    );

    res.json({
      employees: employeesWithStats,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ message: 'Server error fetching employees' });
  }
});

// Get single employee (Admin only)
router.get('/:id', auth.auth, adminOnly, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id)
      .select('-password -resetPasswordToken');
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Get last 6 months stats
    const stats = await ReferralStats.find({ employeeId: employee._id })
      .sort({ year: -1, month: -1 })
      .limit(6);

    res.json({
      employee: employee.toObject(),
      recentStats: stats
    });
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ message: 'Server error fetching employee' });
  }
});

// Update employee (Admin only)
router.put('/:id', auth.auth, adminOnly, async (req, res) => {
  try {
    const { password, ...updateData } = req.body;

    // If password is being updated, hash it
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -resetPasswordToken');

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({
      message: 'Employee updated successfully',
      employee
    });
  } catch (error) {
    console.error('Employee update error:', error);
    res.status(500).json({ message: 'Server error updating employee' });
  }
});

// Delete employee (Admin only)
router.delete('/:id', auth.auth, adminOnly, async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Employee deletion error:', error);
    res.status(500).json({ message: 'Server error deleting employee' });
  }
});

// Get employee dashboard data (Employee only)
router.get('/dashboard/stats', auth.auth, async (req, res) => {
  try {
    // Check if user is employee
    if (req.user.userType !== 'employee') {
      return res.status(403).json({ message: 'Access denied. Employee access required.' });
    }

    const employee = await Employee.findById(req.user.userId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const currentPeriod = `${currentYear}-${currentMonth.toString().padStart(2, '0')}`;

    // Get current month stats
    const currentMonthStats = await ReferralStats.findOne({
      employeeId: employee._id,
      period: currentPeriod
    });

    // Get all-time stats
    const allTimeStats = await ReferralStats.aggregate([
      { $match: { employeeId: employee._id } },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: '$usersReferred' },
          totalBrokers: { $sum: '$brokersReferred' },
          totalEarnings: { $sum: { $add: ['$totalEarnings', '$bonusEarnings'] } },
          totalPaid: { $sum: { $cond: ['$isPaid', { $add: ['$totalEarnings', '$bonusEarnings'] }, 0] } }
        }
      }
    ]);

    // Get last 6 months for trend
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyTrend = await ReferralStats.find({
      employeeId: employee._id,
      year: { $gte: sixMonthsAgo.getFullYear() },
      $or: [
        { year: { $gt: sixMonthsAgo.getFullYear() } },
        { 
          year: sixMonthsAgo.getFullYear(), 
          month: { $gte: sixMonthsAgo.getMonth() + 1 } 
        }
      ]
    }).sort({ year: 1, month: 1 });

    // Get recent referrals
    const recentReferrals = await User.find({ 
      referredBy: employee._id 
    })
    .select('fullName email userType referralDate')
    .sort({ referralDate: -1 })
    .limit(10);

    res.json({
      employee: {
        employeeName: employee.employeeName,
        employeeId: employee.employeeId,
        referralCode: employee.referralCode,
        targets: employee.targets
      },
      currentMonth: currentMonthStats || {
        usersReferred: 0,
        brokersReferred: 0,
        totalEarnings: 0,
        bonusEarnings: 0
      },
      allTime: allTimeStats[0] || {
        totalUsers: 0,
        totalBrokers: 0,
        totalEarnings: 0,
        totalPaid: 0
      },
      monthlyTrend,
      recentReferrals
    });
  } catch (error) {
    console.error('Error fetching employee dashboard:', error);
    res.status(500).json({ message: 'Server error fetching dashboard data' });
  }
});

// Get referral statistics (Admin only)
router.get('/stats/overview', auth.auth, adminOnly, async (req, res) => {
  try {
    const { year, month } = req.query;
    const currentDate = new Date();
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();
    const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const period = `${targetYear}-${targetMonth.toString().padStart(2, '0')}`;

    // Get aggregated stats for the period
    const periodStats = await ReferralStats.aggregate([
      { $match: { period: period } },
      {
        $group: {
          _id: null,
          totalEmployees: { $addToSet: '$employeeId' },
          totalUsers: { $sum: '$usersReferred' },
          totalBrokers: { $sum: '$brokersReferred' },
          totalEarnings: { $sum: { $add: ['$totalEarnings', '$bonusEarnings'] } },
          totalPaid: { $sum: { $cond: ['$isPaid', { $add: ['$totalEarnings', '$bonusEarnings'] }, 0] } },
          pendingPayment: { $sum: { $cond: ['$isPaid', 0, { $add: ['$totalEarnings', '$bonusEarnings'] }] } }
        }
      },
      {
        $project: {
          activeEmployees: { $size: '$totalEmployees' },
          totalUsers: 1,
          totalBrokers: 1,
          totalEarnings: 1,
          totalPaid: 1,
          pendingPayment: 1
        }
      }
    ]);

    // Get top performers
    const topPerformers = await ReferralStats.getTopPerformers(targetYear, targetMonth, 5);

    res.json({
      period: `${targetYear}-${targetMonth.toString().padStart(2, '0')}`,
      overview: periodStats[0] || {
        activeEmployees: 0,
        totalUsers: 0,
        totalBrokers: 0,
        totalEarnings: 0,
        totalPaid: 0,
        pendingPayment: 0
      },
      topPerformers
    });
  } catch (error) {
    console.error('Error fetching referral overview:', error);
    res.status(500).json({ message: 'Server error fetching referral statistics' });
  }
});

// Validate referral code (Public endpoint)
router.get('/referral/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const employee = await Employee.findOne({ 
      referralCode: code.toUpperCase(), 
      isActive: true 
    }).select('employeeName referralCode');

    if (!employee) {
      return res.status(404).json({ 
        valid: false, 
        message: 'Invalid referral code' 
      });
    }

    res.json({
      valid: true,
      employee: {
        name: employee.employeeName,
        referralCode: employee.referralCode
      }
    });
  } catch (error) {
    console.error('Error validating referral code:', error);
    res.status(500).json({ message: 'Server error validating referral code' });
  }
});

module.exports = router;