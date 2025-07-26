const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  firebaseId: {
    type: String,
    unique: true,
    sparse: true, // Allow null values and only enforce uniqueness on non-null values
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  propertyType: {
    type: String,
    required: true,
    enum: ['Apartment', 'House', 'Villa', 'Cottage', 'Commercial', 'Land']
  },
  transactionType: {
    type: String,
    required: true,
    enum: ['Sale', 'Rent', 'Lease']
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  area: {
    type: Number,
    required: true,
    min: 0
  },
  areaUnit: {
    type: String,
    required: true,
    enum: ['sq ft', 'sq m', 'acres', 'hectares']
  },
  bedrooms: {
    type: Number,
    min: 0
  },
  bathrooms: {
    type: Number,
    min: 0
  },
  location: {
    address: {
      type: String,
      required: true,
      trim: true
    },
    city: {
      type: String,
      required: true,
      trim: true
    },
    state: {
      type: String,
      required: true,
      trim: true
    },
    pincode: {
      type: String,
      required: true,
      trim: true
    },
    coordinates: {
      latitude: {
        type: Number
      },
      longitude: {
        type: Number
      }
    }
  },
  images: [{
    type: String,
    required: true
  }],
  amenities: [{
    type: String,
    trim: true
  }],
  features: [{
    type: String,
    trim: true
  }],
  brokerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  brokerName: {
    type: String,
    required: true
  },
  brokerContact: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Sold', 'Rented'],
    default: 'Active'
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  documents: [{
    name: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    key: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
propertySchema.index({ brokerId: 1 });
propertySchema.index({ propertyType: 1 });
propertySchema.index({ transactionType: 1 });
propertySchema.index({ status: 1 });
propertySchema.index({ isFeatured: 1 });
propertySchema.index({ 'location.city': 1 });
propertySchema.index({ 'location.state': 1 });
propertySchema.index({ price: 1 });
propertySchema.index({ area: 1 });
propertySchema.index({ createdAt: -1 });
propertySchema.index({ firebaseId: 1 });

module.exports = mongoose.model('Property', propertySchema);