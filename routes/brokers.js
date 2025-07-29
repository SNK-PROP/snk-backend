const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Property = require('../models/Property');
const auth = require('../middleware/auth');
const { uploadToS3 } = require('../config/s3');

const router = express.Router();

// Register broker/sub-broker
router.post('/register', (req, res, next) => {
  const upload = uploadToS3.fields([
    { name: 'profilePic', maxCount: 1 },
    { name: 'kycDocument', maxCount: 1 }
  ]);
  
  upload(req, res, (err) => {
    if (err) {
      console.error('Upload middleware error:', err);
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File size too large. Maximum 5MB allowed.' });
      }
      
      if (err.message && err.message.includes('image files')) {
        return res.status(400).json({ message: 'Only image files are allowed (jpeg, jpg, png, gif, webp)' });
      }
      
      if (err.message && err.message.includes('PermanentRedirect')) {
        return res.status(500).json({ message: 'Storage configuration error. Please contact support.' });
      }
      
      return res.status(500).json({ 
        message: 'File upload failed', 
        error: process.env.NODE_ENV === 'development' ? err.message : undefined 
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { 
      email, 
      password, 
      fullName, 
      contactNumber, 
      location, 
      propertyType, 
      userType, 
      kycType,
      parentBrokerId 
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Validate user type
    if (!['broker', 'sub_broker'].includes(userType)) {
      return res.status(400).json({ message: 'Invalid user type' });
    }

    // If sub-broker, validate parent broker
    if (userType === 'sub_broker' && !parentBrokerId) {
      return res.status(400).json({ message: 'Parent broker ID is required for sub-brokers' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Upload profile picture
    let profileImageUrl = null;
    if (req.files && req.files.profilePic) {
      profileImageUrl = req.files.profilePic[0].location;
    }

    // Upload KYC document
    let kycDocuments = [];
    if (req.files && req.files.kycDocument) {
      kycDocuments.push({
        type: kycType,
        url: req.files.kycDocument[0].location,
        key: req.files.kycDocument[0].key,
        status: 'pending'
      });
    }

    // Create new broker/sub-broker
    const user = new User({
      email,
      password: hashedPassword,
      fullName,
      contactNumber,
      location,
      propertyType: propertyType ? JSON.parse(propertyType) : [],
      userType,
      profileImage: profileImageUrl,
      kycDocuments,
      parentBrokerId: parentBrokerId || null,
      verificationStatus: 'pending'
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, userType: user.userType },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      message: 'Broker registered successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        contactNumber: user.contactNumber,
        location: user.location,
        propertyType: user.propertyType,
        userType: user.userType,
        verificationStatus: user.verificationStatus,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Broker registration error:', error);
    
    // Check if it's a multer/upload error
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File size too large. Maximum 5MB allowed.' });
    }
    
    if (error.message && error.message.includes('image files')) {
      return res.status(400).json({ message: 'Only image files are allowed (jpeg, jpg, png, gif, webp)' });
    }
    
    if (error.message && error.message.includes('AWS')) {
      return res.status(500).json({ message: 'File upload failed. Please try again.' });
    }
    
    res.status(500).json({ 
      message: 'Server error during broker registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all brokers (admin only)
router.get('/', auth.auth, async (req, res) => {
  try {
    if (req.user.userType !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { userType: { $in: ['broker', 'sub_broker'] } };
    
    if (req.query.verificationStatus) {
      filter.verificationStatus = req.query.verificationStatus;
    }

    const brokers = await User.find(filter)
      .select('-password')
      .populate('parentBrokerId', 'fullName contactNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(filter);

    res.json({
      brokers,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching brokers:', error);
    res.status(500).json({ message: 'Server error fetching brokers' });
  }
});

// Get broker by ID
router.get('/:id', async (req, res) => {
  try {
    const broker = await User.findById(req.params.id)
      .select('-password')
      .populate('parentBrokerId', 'fullName contactNumber');

    if (!broker || !['broker', 'sub_broker'].includes(broker.userType)) {
      return res.status(404).json({ message: 'Broker not found' });
    }

    // Get broker's properties
    const properties = await Property.find({ brokerId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(5);

    // Get sub-brokers if this is a broker
    let subBrokers = [];
    if (broker.userType === 'broker') {
      subBrokers = await User.find({ parentBrokerId: req.params.id })
        .select('-password')
        .sort({ createdAt: -1 });
    }

    res.json({
      broker,
      properties,
      subBrokers
    });
  } catch (error) {
    console.error('Error fetching broker:', error);
    res.status(500).json({ message: 'Server error fetching broker' });
  }
});

// Update broker verification status (admin only)
router.put('/:id/verify', auth.auth, async (req, res) => {
  try {
    if (req.user.userType !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { verificationStatus, kycDocumentId, kycStatus } = req.body;

    const broker = await User.findById(req.params.id);
    if (!broker || !['broker', 'sub_broker'].includes(broker.userType)) {
      return res.status(404).json({ message: 'Broker not found' });
    }

    // Update overall verification status
    if (verificationStatus) {
      broker.verificationStatus = verificationStatus;
      broker.isVerified = verificationStatus === 'verified';
    }

    // Update specific KYC document status
    if (kycDocumentId && kycStatus) {
      const kycDoc = broker.kycDocuments.id(kycDocumentId);
      if (kycDoc) {
        kycDoc.status = kycStatus;
      }
    }

    await broker.save();

    res.json({
      message: 'Broker verification status updated successfully',
      broker: {
        id: broker._id,
        fullName: broker.fullName,
        verificationStatus: broker.verificationStatus,
        isVerified: broker.isVerified,
        kycDocuments: broker.kycDocuments
      }
    });
  } catch (error) {
    console.error('Error updating broker verification:', error);
    res.status(500).json({ message: 'Server error updating broker verification' });
  }
});

// Update broker profile
router.put('/:id', auth.auth, uploadToS3.single('profilePic'), async (req, res) => {
  try {
    const broker = await User.findById(req.params.id);
    if (!broker || !['broker', 'sub_broker'].includes(broker.userType)) {
      return res.status(404).json({ message: 'Broker not found' });
    }

    // Check if user is updating their own profile or is admin
    if (req.params.id !== req.user.userId && req.user.userType !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this profile' });
    }

    const { fullName, contactNumber, location, propertyType } = req.body;

    // Upload new profile picture if provided
    let profileImageUrl = broker.profileImage;
    if (req.file) {
      const uploadResult = await s3Service.uploadFile(req.file, 'profiles');
      if (uploadResult.success) {
        // Delete old profile image if exists
        if (broker.profileImage) {
          const oldKey = broker.profileImage.split('/').pop();
          await s3Service.deleteFile(`profiles/${oldKey}`);
        }
        profileImageUrl = uploadResult.url;
      }
    }

    const updatedBroker = await User.findByIdAndUpdate(
      req.params.id,
      {
        fullName,
        contactNumber,
        location,
        propertyType: propertyType ? JSON.parse(propertyType) : broker.propertyType,
        profileImage: profileImageUrl
      },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Broker profile updated successfully',
      broker: updatedBroker
    });
  } catch (error) {
    console.error('Error updating broker profile:', error);
    res.status(500).json({ message: 'Server error updating broker profile' });
  }
});

// Delete broker (admin only)
router.delete('/:id', auth.auth, async (req, res) => {
  try {
    if (req.user.userType !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const broker = await User.findById(req.params.id);
    if (!broker || !['broker', 'sub_broker'].includes(broker.userType)) {
      return res.status(404).json({ message: 'Broker not found' });
    }

    // Delete profile image from S3
    if (broker.profileImage) {
      const key = broker.profileImage.split('/').pop();
      await s3Service.deleteFile(`profiles/${key}`);
    }

    // Delete KYC documents from S3
    for (const doc of broker.kycDocuments) {
      await s3Service.deleteFile(doc.key);
    }

    // Delete all properties associated with this broker
    const properties = await Property.find({ brokerId: req.params.id });
    for (const property of properties) {
      // Delete property images from S3
      for (const image of property.images) {
        await s3Service.deleteFile(image.key);
      }
      
      // Delete property documents from S3
      for (const doc of property.documents) {
        await s3Service.deleteFile(doc.key);
      }
    }

    await Property.deleteMany({ brokerId: req.params.id });

    // If this is a broker, update sub-brokers to remove parent reference
    if (broker.userType === 'broker') {
      await User.updateMany(
        { parentBrokerId: req.params.id },
        { $unset: { parentBrokerId: 1 } }
      );
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'Broker deleted successfully' });
  } catch (error) {
    console.error('Error deleting broker:', error);
    res.status(500).json({ message: 'Server error deleting broker' });
  }
});

// Get sub-brokers for a broker
router.get('/:id/sub-brokers', auth.auth, async (req, res) => {
  try {
    const broker = await User.findById(req.params.id);
    if (!broker || broker.userType !== 'broker') {
      return res.status(404).json({ message: 'Broker not found' });
    }

    // Check if user is the broker or admin
    if (req.params.id !== req.user.userId && req.user.userType !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view sub-brokers' });
    }

    const subBrokers = await User.find({ parentBrokerId: req.params.id })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({ subBrokers });
  } catch (error) {
    console.error('Error fetching sub-brokers:', error);
    res.status(500).json({ message: 'Server error fetching sub-brokers' });
  }
});

module.exports = router;