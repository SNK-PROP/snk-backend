const express = require('express');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');

const router = express.Router();

// Configure S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'snk-property-images';

// Generate presigned URL for file upload
router.post('/presigned-url', auth.auth, async (req, res) => {
  try {
    const { fileName, fileType, folder = 'properties' } = req.body;

    if (!fileName || !fileType) {
      return res.status(400).json({ 
        message: 'fileName and fileType are required' 
      });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(fileType)) {
      return res.status(400).json({ 
        message: 'Only image files are allowed (jpeg, jpg, png, gif, webp)' 
      });
    }

    // Generate unique filename
    const uniqueId = uuidv4();
    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `${Date.now()}-${uniqueId}.${fileExtension}`;
    
    // Organize files by folder and date
    const dateFolder = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `${folder}/${dateFolder}/${uniqueFileName}`;

    // Create the command for putting an object in S3
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      Metadata: {
        uploadedBy: req.user.userId,
        uploadedAt: new Date().toISOString(),
      },
    });

    // Generate presigned URL (valid for 10 minutes)
    const presignedUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: 600 
    });

    // Generate the final URL where the file will be accessible
    const fileUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

    res.json({
      presignedUrl,
      fileUrl,
      key,
      fileName: uniqueFileName,
    });

  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ 
      message: 'Error generating presigned URL',
      error: error.message 
    });
  }
});

// Generate multiple presigned URLs for multiple files
router.post('/presigned-urls', auth.auth, async (req, res) => {
  try {
    const { files, folder = 'properties' } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ 
        message: 'files array is required' 
      });
    }

    if (files.length > 10) {
      return res.status(400).json({ 
        message: 'Maximum 10 files allowed per request' 
      });
    }

    const presignedUrls = [];

    for (const file of files) {
      const { fileName, fileType } = file;

      if (!fileName || !fileType) {
        return res.status(400).json({ 
          message: 'Each file must have fileName and fileType' 
        });
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(fileType)) {
        return res.status(400).json({ 
          message: `Invalid file type: ${fileType}. Only image files are allowed.` 
        });
      }

      // Generate unique filename
      const uniqueId = uuidv4();
      const fileExtension = fileName.split('.').pop();
      const uniqueFileName = `${Date.now()}-${uniqueId}.${fileExtension}`;
      
      // Organize files by folder and date
      const dateFolder = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const key = `${folder}/${dateFolder}/${uniqueFileName}`;

      // Create the command for putting an object in S3
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: fileType,
        Metadata: {
          uploadedBy: req.user.userId,
          uploadedAt: new Date().toISOString(),
        },
      });

      // Generate presigned URL (valid for 10 minutes)
      const presignedUrl = await getSignedUrl(s3Client, command, { 
        expiresIn: 600 
      });

      // Generate the final URL where the file will be accessible
      const fileUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

      presignedUrls.push({
        originalFileName: fileName,
        presignedUrl,
        fileUrl,
        key,
        fileName: uniqueFileName,
      });
    }

    res.json({
      presignedUrls,
      expiresIn: 600, // 10 minutes
    });

  } catch (error) {
    console.error('Error generating presigned URLs:', error);
    res.status(500).json({ 
      message: 'Error generating presigned URLs',
      error: error.message 
    });
  }
});

module.exports = router;