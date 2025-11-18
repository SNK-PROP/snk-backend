# Backend Notification System Setup Guide

This document provides instructions for completing the backend notification system setup.

## ✅ Completed Implementation

### 1. Dependencies Installed
- ✅ `firebase-admin` - Firebase Admin SDK for sending notifications
- ✅ `node-schedule` - For scheduling delayed notifications
- ✅ All existing dependencies maintained

### 2. Core Components Created

#### Firebase Configuration (`config/firebase.js`)
- Firebase Admin SDK initialization
- Service account key handling
- Graceful fallback when service account is missing

#### Database Models
- **Notification Model** (`models/Notification.js`): Complete notification tracking with delivery stats, retry logic, and scheduling
- **DeviceToken Model** (`models/DeviceToken.js`): Device token management with user associations

#### Service Layer (`services/notificationService.js`)
- Firebase Cloud Messaging integration
- Multi-target sending (users, topics, all devices)
- Batch processing for large audiences
- Automatic retry logic for failed notifications
- Scheduled notification support
- Device token cleanup

#### API Routes (`routes/notifications.js`)
- **POST** `/api/notifications/register-token` - Register device token
- **POST** `/api/notifications/send` - Send custom notification (admin)
- **POST** `/api/notifications/test` - Send test notification
- **POST** `/api/notifications/new-property` - Send property notification
- **GET** `/api/notifications/history` - Notification history (admin)
- **GET** `/api/notifications/stats/overview` - Statistics (admin)
- And more management endpoints...

### 3. App Integration
- ✅ Routes registered in `app.js`
- ✅ Notification service initialized with database connection
- ✅ Scheduled tasks for processing pending/failed notifications
- ✅ Automatic cleanup tasks configured

## 🔧 Required Setup Steps

### 1. Firebase Service Account Key

**This is the most important step to enable notifications:**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one)
3. Go to **Project Settings** > **Service accounts**
4. Click **"Generate new private key"**
5. Download the JSON file
6. Save it as `firebase-service-account.json` in this backend directory

### 2. Update Environment Variables

Add these to your `.env.development` file:

```bash
# Notification Settings
NOTIFICATION_ENABLED=true
NOTIFICATION_BATCH_SIZE=500
NOTIFICATION_RETRY_ATTEMPTS=3
NOTIFICATION_TTL=3600
```

### 3. Test the Setup

Start the server and check the console:

```bash
npm run dev
```

You should see:
- ✅ "Firebase Admin SDK initialized successfully" (if service account key is present)
- ✅ "MongoDB connected successfully"
- ✅ "Notification scheduler started"

## 📱 API Usage Examples

### Register Device Token (Frontend)

```javascript
// POST /api/notifications/register-token
{
  "token": "fcm_device_token_here",
  "platform": "android", // or "ios"
  "appVersion": "1.0.0",
  "deviceInfo": {
    "model": "Pixel 6",
    "osVersion": "13"
  }
}
```

### Send Test Notification

```javascript
// POST /api/notifications/test (requires auth token)
{
  "title": "Test Notification",
  "body": "This is a test notification"
}
```

### Send Custom Notification (Admin)

```javascript
// POST /api/notifications/send (requires admin auth)
{
  "title": "Weekend Open House",
  "body": "Join us this Saturday for exclusive property viewings",
  "targetAudience": "users", // "all", "users", "agents", "admins", "specific"
  "targetUsers": ["user_id_1", "user_id_2"], // only if targetAudience is "specific"
  "type": "marketing",
  "data": {
    "action": "view_properties",
    "categoryId": "open_houses"
  },
  "imageUrl": "https://example.com/image.jpg",
  "priority": "high",
  "scheduledFor": "2024-01-20T10:00:00Z" // optional, for scheduled sending
}
```

### Send New Property Notification

```javascript
// POST /api/notifications/new-property
{
  "propertyId": "property_123",
  "propertyTitle": "Beautiful 3BR Apartment",
  "propertyImage": "https://example.com/property.jpg",
  "targetAudience": "users"
}
```

## 🔗 Integration with Frontend

The backend is already integrated with the frontend notification system:

1. **Token Registration**: Frontend automatically registers FCM tokens on app startup
2. **Permission Handling**: Backend validates requests and manages device tokens
3. **Topic Subscription**: Frontend can subscribe to property updates, news, etc.
4. **Delivery Tracking**: Backend tracks delivery success/failure and maintains statistics

## 📊 Monitoring & Management

### Health Check
- `GET /api/health` - Shows notification system status

### Statistics (Admin)
- `GET /api/notifications/stats/overview` - Complete notification analytics
- `GET /api/notifications/history` - Notification history with delivery details

### Management Tasks (Admin)
- `POST /api/notifications/process-pending` - Manually process pending notifications
- `POST /api/notifications/retry-failed` - Retry failed notifications
- `POST /api/notifications/cleanup` - Clean up old data

## 🚨 Important Notes

1. **Firebase Service Account Key**: Required for sending notifications. Keep this file secure!
2. **Rate Limiting**: The API includes rate limiting to prevent abuse
3. **Error Handling**: Failed notifications are automatically retried up to 3 times
4. **Token Cleanup**: Old inactive device tokens are automatically cleaned up
5. **Scheduled Notifications**: Supports sending notifications at specific times
6. **Analytics**: Complete delivery tracking and statistics are maintained

## 🔒 Security Features

- All notification endpoints require authentication
- Admin-only endpoints are protected with role-based access
- Input validation and sanitization
- Rate limiting to prevent spam
- Secure service account key handling

## 🎯 Next Steps

1. **Add Firebase Service Account Key** - This enables the notification functionality
2. **Test with Frontend** - Use the frontend app's notification test feature
3. **Monitor Delivery** - Check the statistics API for delivery rates
4. **Set Up Admin Dashboard** - Integrate with the Next.js admin dashboard

Once the Firebase service account key is added, the complete notification system will be fully functional!