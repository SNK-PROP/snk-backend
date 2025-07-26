const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();

class S3Service {
  constructor() {
    this.bucketName = process.env.S3_BUCKET_NAME;
  }

  async uploadFile(file, folder = '') {
    try {
      const fileExtension = file.originalname.split('.').pop();
      const fileName = `${folder}/${uuidv4()}.${fileExtension}`;
      
      const params = {
        Bucket: this.bucketName,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read'
      };

      const result = await s3.upload(params).promise();
      return {
        success: true,
        url: result.Location,
        key: result.Key
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteFile(key) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key
      };

      await s3.deleteObject(params).promise();
      return { success: true };
    } catch (error) {
      console.error('S3 delete error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getSignedUrl(key, expiresIn = 3600) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Expires: expiresIn
      };

      const url = await s3.getSignedUrlPromise('getObject', params);
      return {
        success: true,
        url: url
      };
    } catch (error) {
      console.error('S3 signed URL error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new S3Service();