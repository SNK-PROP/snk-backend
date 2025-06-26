// routes/statistics.js
const express = require('express');
const Statistics = require('../models/Statistics');
const User = require('../models/User');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Get statistics (admin only)
router.get('/', adminAuth, async (req, res) => {
  try {
    let stats = await Statistics.findOne({ period: 'all-time' });
    
    if (!stats) {
      // Create initial statistics if not exists
      const userCount = await User.countDocuments({ isActive: true });
      
      stats = new Statistics({
        data: {
          downloads: 0,
          totalProperties: 0,
          users: userCount,
          views: 0
        },
        period: 'all-time'
      });
      await stats.save();
    }

    res.json({ statistics: stats.data });
  } catch (error) {
    console.error('Statistics fetch error:', error);
    res.status(500).json({ message: 'Server error fetching statistics' });
  }
});

// Update specific statistic (admin only)
router.put('/update', adminAuth, async (req, res) => {
  try {
    const { type, value, operation = 'set' } = req.body;
    
    // Validate type
    const validTypes = ['downloads', 'totalProperties', 'users', 'views'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: 'Invalid statistic type' });
    }

    const updateQuery = {};
    if (operation === 'increment') {
      updateQuery[`data.${type}`] = { $inc: value };
    } else {
      updateQuery[`data.${type}`] = value;
    }

    const stats = await Statistics.findOneAndUpdate(
      { period: 'all-time' },
      operation === 'increment' ? { $inc: { [`data.${type}`]: value } } : { $set: { [`data.${type}`]: value } },
      { new: true, upsert: true }
    );

    res.json({
      message: 'Statistics updated successfully',
      statistics: stats.data
    });
  } catch (error) {
    console.error('Statistics update error:', error);
    res.status(500).json({ message: 'Server error updating statistics' });
  }
});

// Increment view count (can be called by any authenticated user)
router.post('/increment-views', auth, async (req, res) => {
  try {
    const stats = await Statistics.findOneAndUpdate(
      { period: 'all-time' },
      { $inc: { 'data.views': 1 } },
      { new: true, upsert: true }
    );

    res.json({ 
      message: 'View count incremented',
      views: stats.data.views 
    });
  } catch (error) {
    console.error('View increment error:', error);
    res.status(500).json({ message: 'Server error incrementing views' });
  }
});

// Increment download count
router.post('/increment-downloads', auth, async (req, res) => {
  try {
    const stats = await Statistics.findOneAndUpdate(
      { period: 'all-time' },
      { $inc: { 'data.downloads': 1 } },
      { new: true, upsert: true }
    );

    res.json({ 
      message: 'Download count incremented',
      downloads: stats.data.downloads 
    });
  } catch (error) {
    console.error('Download increment error:', error);
    res.status(500).json({ message: 'Server error incrementing downloads' });
  }
});

module.exports = router;