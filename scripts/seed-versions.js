const mongoose = require('mongoose');
const AppVersion = require('../models/AppVersion');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:admin@cluster0.zist3g3.mongodb.net/';

async function seedVersions() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Clear existing versions (optional)
    await AppVersion.deleteMany({});
    console.log('Cleared existing versions');

    // Seed Android version
    const androidVersion = new AppVersion({
      platform: 'android',
      version: '1.0.0',
      buildNumber: 1,
      isForceUpdate: false,
      isActive: true,
      updateUrl: 'https://play.google.com/store/apps/details?id=com.snk.prop',
      releaseNotes: `🎉 Welcome to SNK Properties v1.0.0!

🏠 Features:
• Browse and search property listings
• Advanced filters (price, location, type)
• Interactive maps integration
• Secure user authentication
• Property favorites and wishlist

🤝 For Brokers:
• Easy property listing management
• Document upload system
• Profile and KYC verification
• Real-time listing updates

👥 Employee Referral System:
• Unique referral codes for employees
• Automatic commission tracking
• Performance analytics dashboard
• QR code sharing for easy referrals

🔧 Technical:
• Enhanced security features
• Improved performance
• Bug fixes and optimizations

Thank you for choosing SNK Properties!`,
      minimumSupportedVersion: '1.0.0',
      features: [
        'Property search and listings',
        'Interactive maps',
        'User authentication',
        'Broker management',
        'Employee referral system',
        'Document uploads',
        'Real-time updates'
      ],
      bugFixes: [
        'Initial release - no bug fixes yet'
      ],
      downloadSize: '25.4 MB',
      targetSdkVersion: 34,
      minimumOsVersion: 'Android 7.0 (API level 24)'
    });

    await androidVersion.save();
    console.log('✅ Android version 1.0.0 created');

    // Seed iOS version
    const iosVersion = new AppVersion({
      platform: 'ios',
      version: '1.0.0',
      buildNumber: 1,
      isForceUpdate: false,
      isActive: true,
      updateUrl: 'https://apps.apple.com/app/snk-properties/id-your-actual-id',
      releaseNotes: `🎉 Welcome to SNK Properties v1.0.0!

🏠 Features:
• Browse and search property listings
• Advanced filters (price, location, type)
• Interactive maps integration
• Secure user authentication
• Property favorites and wishlist

🤝 For Brokers:
• Easy property listing management
• Document upload system
• Profile and KYC verification
• Real-time listing updates

👥 Employee Referral System:
• Unique referral codes for employees
• Automatic commission tracking
• Performance analytics dashboard
• QR code sharing for easy referrals

🔧 Technical:
• Enhanced security features
• Improved performance
• iOS-specific optimizations

Thank you for choosing SNK Properties!`,
      minimumSupportedVersion: '1.0.0',
      features: [
        'Property search and listings',
        'Interactive maps',
        'User authentication',
        'Broker management',
        'Employee referral system',
        'Document uploads',
        'Real-time updates'
      ],
      bugFixes: [
        'Initial release - no bug fixes yet'
      ],
      downloadSize: '28.1 MB',
      minimumOsVersion: 'iOS 13.0'
    });

    await iosVersion.save();
    console.log('✅ iOS version 1.0.0 created');

    console.log('\n🎉 Version seeding completed successfully!');
    console.log(`
📱 Next Steps:
1. Update iOS App Store URL with actual App ID
2. Test version checking in mobile app
3. Use admin dashboard to manage future versions

🔧 Admin API Endpoints:
• GET  /api/app/versions - List all versions
• POST /api/app/versions - Create new version
• PUT  /api/app/versions/:id - Update version
• DELETE /api/app/versions/:id - Delete version

🌐 Public Endpoints:
• GET /api/app/version-check - Check for updates
• GET /api/app/info - App information
`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding versions:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedVersions();
}

module.exports = seedVersions;