const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Configure AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// S3 bucket configuration
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'snk-property-images';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// File filter function
const fileFilter = (req, file, cb) => {
  // Check file type
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

// Configure multer with S3
const uploadToS3 = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: BUCKET_NAME,
    metadata: function (req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
        uploadedBy: req.user?.id || 'anonymous',
        uploadedAt: new Date().toISOString(),
      });
    },
    key: function (req, file, cb) {
      // Generate unique filename
      const uniqueId = uuidv4();
      const fileExtension = path.extname(file.originalname);
      const fileName = `${Date.now()}-${uniqueId}${fileExtension}`;
      
      // Organize files by type and date
      const folder = req.body.type || 'properties';
      const dateFolder = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const key = `${folder}/${dateFolder}/${fileName}`;
      
      cb(null, key);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
    cacheControl: 'max-age=31536000', // Cache for 1 year
  }),
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10, // Maximum 10 files per upload
  },
});

// Helper function to generate S3 URL
const getS3Url = (key) => {
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
};

// Helper function to extract S3 key from URL
const getS3KeyFromUrl = (url) => {
  const baseUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/`;
  return url.replace(baseUrl, '');
};

module.exports = {
  s3Client,
  uploadToS3,
  getS3Url,
  getS3KeyFromUrl,
  BUCKET_NAME,
};