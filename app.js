// app.js or server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const env = process.env.NODE_ENV || 'development';
require('dotenv').config({ path: `.env.${env}` });

const authRoutes = require('./routes/auth');
const statisticsRoutes = require('./routes/statistics');
const propertiesRoutes = require('./routes/properties');
const brokersRoutes = require('./routes/brokers');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
if (process.env.HELMET_ENABLED === 'true') {
  app.use(helmet());
}

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// CORS configuration
const corsOptions = {
  origin: '*',
  credentials: true,
  optionsSuccessStatus: 200
}; 
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:admin@cluster0.zist3g3.mongodb.net/';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log(`MongoDB connected successfully to ${process.env.NODE_ENV || 'development'} environment`);
  if (process.env.DEBUG === 'true') {
    console.log(`Connected to: ${MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`);
  }
})
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/properties', propertiesRoutes);
app.use('/api/brokers', brokersRoutes);
app.use('/api/upload', require('./routes/upload'));

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    message: 'Server is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    version: '1.0.0'
  });
});

// Environment info route (development only)
if (process.env.NODE_ENV === 'development') {
  app.get('/api/env-info', (req, res) => {
    res.json({
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      corsOrigin: process.env.CORS_ORIGIN,
      s3Bucket: process.env.S3_BUCKET_NAME,
      awsRegion: process.env.AWS_REGION
    });
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
// app.use('*', (req, res) => {
//   res.status(404).json({ message: 'Route not found' });
// });

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  if (process.env.DEBUG === 'true') {
    console.log(`📝 Debug mode enabled`);
    console.log(`🔒 CORS origin: ${process.env.CORS_ORIGIN || '*'}`);
    console.log(`☁️  S3 Bucket: ${process.env.S3_BUCKET_NAME}`);
  }
});

module.exports = app;