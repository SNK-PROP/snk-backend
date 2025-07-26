const express = require('express');
const Property = require('../models/Property');
const User = require('../models/User');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const s3Service = require('../services/s3Service');

const router = express.Router();

// Get all properties (with pagination and filters)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = { status: 'Active' };
    
    if (req.query.propertyType) {
      filter.propertyType = req.query.propertyType;
    }
    
    if (req.query.transactionType) {
      filter.transactionType = req.query.transactionType;
    }
    
    if (req.query.city) {
      filter['location.city'] = new RegExp(req.query.city, 'i');
    }
    
    if (req.query.minPrice && req.query.maxPrice) {
      filter.price = {
        $gte: parseFloat(req.query.minPrice),
        $lte: parseFloat(req.query.maxPrice)
      };
    }
    
    if (req.query.minArea && req.query.maxArea) {
      filter.area = {
        $gte: parseFloat(req.query.minArea),
        $lte: parseFloat(req.query.maxArea)
      };
    }

    // Sort options
    let sortOptions = { createdAt: -1 };
    if (req.query.sortBy === 'price') {
      sortOptions = { price: req.query.sortOrder === 'desc' ? -1 : 1 };
    } else if (req.query.sortBy === 'area') {
      sortOptions = { area: req.query.sortOrder === 'desc' ? -1 : 1 };
    }

    const properties = await Property.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .populate('brokerId', 'fullName contactNumber email');

    const total = await Property.countDocuments(filter);
    const totalUsers = await User.countDocuments({ isActive: true });

    res.json({
      properties,
      totalUsers,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ message: 'Server error fetching properties' });
  }
});

// Get featured properties
router.get('/featured', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    
    const properties = await Property.find({ 
      status: 'Active', 
      isFeatured: true 
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('brokerId', 'fullName contactNumber email');

    res.json({ properties });
  } catch (error) {
    console.error('Error fetching featured properties:', error);
    res.status(500).json({ message: 'Server error fetching featured properties' });
  }
});

// Get property by ID
router.get('/:id', async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('brokerId', 'fullName contactNumber email')
      .populate('favorites', 'fullName');
 
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Increment view count
    await Property.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });

    res.json({ property });
  } catch (error) {
    console.error('Error fetching property:', error);
    res.status(500).json({ message: 'Server error fetching property' });
  }
});

// Create new property (broker/sub-broker only)
router.post('/', auth.auth, upload.array('images', 10), async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || !['broker', 'sub_broker'].includes(user.userType)) {
      return res.status(403).json({ message: 'Only brokers can create properties' });
    }

    const {
      title,
      description,
      propertyType,
      transactionType,
      price,
      area,
      areaUnit,
      bedrooms,
      bathrooms,
      location,
      amenities,
      features
    } = req.body;

    // Upload images to S3
    const imageUploads = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadResult = await s3Service.uploadFile(file, 'properties');
        if (uploadResult.success) {
          imageUploads.push(uploadResult.url);
        }
      }
    }

    const property = new Property({
      title,
      description,
      propertyType,
      transactionType,
      price: parseFloat(price),
      area: parseFloat(area),
      areaUnit,
      bedrooms: bedrooms ? parseInt(bedrooms) : undefined,
      bathrooms: bathrooms ? parseInt(bathrooms) : undefined,
      location: JSON.parse(location),
      amenities: amenities ? JSON.parse(amenities) : [],
      features: features ? JSON.parse(features) : [],
      images: imageUploads,
      brokerId: user._id,
      brokerName: user.fullName,
      brokerContact: user.contactNumber
    });

    await property.save();

    res.status(201).json({
      message: 'Property created successfully',
      property
    });
  } catch (error) {
    console.error('Error creating property:', error);
    res.status(500).json({ message: 'Server error creating property' });
  }
});

// Update property (broker/sub-broker only)
router.put('/:id', auth.auth, upload.array('images', 10), async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Check if user is the owner or admin
    if (property.brokerId.toString() !== req.user.userId && req.user.userType !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this property' });
    }

    const {
      title,
      description,
      propertyType,
      transactionType,
      price,
      area,
      areaUnit,
      bedrooms,
      bathrooms,
      location,
      amenities,
      features,
      status
    } = req.body;

    // Handle new image uploads
    const newImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadResult = await s3Service.uploadFile(file, 'properties');
        if (uploadResult.success) {
          newImages.push(uploadResult.url);
        }
      }
    }

    // Update property fields
    const updateData = {
      title,
      description,
      propertyType,
      transactionType,
      price: parseFloat(price),
      area: parseFloat(area),
      areaUnit,
      bedrooms: bedrooms ? parseInt(bedrooms) : undefined,
      bathrooms: bathrooms ? parseInt(bathrooms) : undefined,
      location: JSON.parse(location),
      amenities: amenities ? JSON.parse(amenities) : [],
      features: features ? JSON.parse(features) : []
    };

    if (status) {
      updateData.status = status;
    }

    // Add new images to existing ones
    if (newImages.length > 0) {
      updateData.images = [...property.images, ...newImages];
    }

    const updatedProperty = await Property.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Property updated successfully',
      property: updatedProperty
    });
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({ message: 'Server error updating property' });
  }
});

// Delete property (broker/sub-broker only)
router.delete('/:id', auth.auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Check if user is the owner or admin
    if (property.brokerId.toString() !== req.user.userId && req.user.userType !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this property' });
    }

    // Note: Images are now stored as Firebase URLs, no S3 cleanup needed

    // Delete documents from S3
    for (const doc of property.documents) {
      await s3Service.deleteFile(doc.key);
    }

    await Property.findByIdAndDelete(req.params.id);

    res.json({ message: 'Property deleted successfully' });
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({ message: 'Server error deleting property' });
  }
});

// Add to favorites
router.post('/:id/favorite', auth.auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const userId = req.user.userId;
    const isFavorite = property.favorites.includes(userId);

    if (isFavorite) {
      property.favorites.pull(userId);
    } else {
      property.favorites.push(userId);
    }

    await property.save();

    res.json({
      message: isFavorite ? 'Removed from favorites' : 'Added to favorites',
      isFavorite: !isFavorite
    });
  } catch (error) {
    console.error('Error updating favorite:', error);
    res.status(500).json({ message: 'Server error updating favorite' });
  }
});

// Get broker's properties
router.get('/broker/:brokerId', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const properties = await Property.find({ brokerId: req.params.brokerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Property.countDocuments({ brokerId: req.params.brokerId });

    res.json({
      properties,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching broker properties:', error);
    res.status(500).json({ message: 'Server error fetching broker properties' });
  }
});

module.exports = router;