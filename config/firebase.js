const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// Note: You need to set up a service account key file
// Download from Firebase Console > Project Settings > Service accounts
let serviceAccount;

try {
  serviceAccount = require('../firebase-service-account.json');
} catch (error) {
  console.warn('Firebase service account key file not found. Notifications will be disabled.');
  console.warn('To enable notifications, download your service account key from Firebase Console');
  console.warn('and save it as firebase-service-account.json in the backend root directory.');
}

// Initialize Firebase Admin SDK only if service account is available
let messaging, auth, firestore;

if (serviceAccount) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

    messaging = admin.messaging();
    auth = admin.auth();
    firestore = admin.firestore();

    console.log('✅ Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
  }
} else {
  console.log('⚠️ Firebase Admin SDK not initialized - missing service account key');
}

module.exports = {
  admin,
  messaging,
  auth,
  firestore,
  isInitialized: !!serviceAccount
};