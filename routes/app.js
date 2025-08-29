const express = require('express');
const AppVersion = require('../models/AppVersion');
const auth = require('../middleware/auth');

const router = express.Router();

// App version check endpoint (public)
router.get('/version-check', async (req, res) => {
  try {
    const [androidVersion, iosVersion] = await Promise.all([
      AppVersion.getCurrentVersion('android'),
      AppVersion.getCurrentVersion('ios')
    ]);

    const versionInfo = {
      android: androidVersion ? {
        version: androidVersion.version,
        buildNumber: androidVersion.buildNumber,
        isForceUpdate: androidVersion.isForceUpdate,
        updateUrl: androidVersion.updateUrl,
        releaseNotes: androidVersion.releaseNotes,
        releaseDate: androidVersion.releaseDate,
        minimumSupportedVersion: androidVersion.minimumSupportedVersion,
        features: androidVersion.features,
        bugFixes: androidVersion.bugFixes,
        downloadSize: androidVersion.downloadSize,
        minimumOsVersion: androidVersion.minimumOsVersion
      } : {
        version: '1.0.0',
        buildNumber: 1,
        isForceUpdate: false,
        updateUrl: 'https://play.google.com/store/apps/details?id=com.snk.prop',
        releaseNotes: 'Initial release'
      },
      ios: iosVersion ? {
        version: iosVersion.version,
        buildNumber: iosVersion.buildNumber,
        isForceUpdate: iosVersion.isForceUpdate,
        updateUrl: iosVersion.updateUrl,
        releaseNotes: iosVersion.releaseNotes,
        releaseDate: iosVersion.releaseDate,
        minimumSupportedVersion: iosVersion.minimumSupportedVersion,
        features: iosVersion.features,
        bugFixes: iosVersion.bugFixes,
        downloadSize: iosVersion.downloadSize,
        minimumOsVersion: iosVersion.minimumOsVersion
      } : {
        version: '1.0.0',
        buildNumber: 1,
        isForceUpdate: false,
        updateUrl: 'https://apps.apple.com/app/snk-properties/id-your-actual-id',
        releaseNotes: 'Initial release'
      }
    };

    res.json(versionInfo);
  } catch (error) {
    console.error('Error in version check:', error);
    res.status(500).json({ 
      message: 'Server error during version check',
      android: {
        version: '1.0.0',
        buildNumber: 1,
        isForceUpdate: false,
        updateUrl: 'https://play.google.com/store/apps/details?id=com.snk.prop',
        releaseNotes: 'Error loading version info'
      },
      ios: {
        version: '1.0.0',
        buildNumber: 1,
        isForceUpdate: false,
        updateUrl: 'https://apps.apple.com/app/snk-properties/id-your-actual-id',
        releaseNotes: 'Error loading version info'
      }
    });
  }
});

// Check if specific version needs update
router.get('/check-update/:platform/:version', async (req, res) => {
  try {
    const { platform, version } = req.params;
    
    if (!['android', 'ios'].includes(platform.toLowerCase())) {
      return res.status(400).json({ message: 'Invalid platform. Use android or ios.' });
    }

    const result = await AppVersion.needsUpdate(platform, version);
    
    res.json(result);
  } catch (error) {
    console.error('Error checking update:', error);
    res.status(500).json({ message: 'Server error checking update' });
  }
});

// Admin: Get all versions (Admin only)
router.get('/versions', auth.auth, async (req, res) => {
  try {
    if (req.user.userType !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { platform, limit = 20 } = req.query;
    let versions;

    if (platform) {
      if (!['android', 'ios'].includes(platform.toLowerCase())) {
        return res.status(400).json({ message: 'Invalid platform. Use android or ios.' });
      }
      versions = await AppVersion.getAllVersions(platform, parseInt(limit));
    } else {
      versions = await AppVersion.find({})
        .sort({ createdAt: -1 })
        .limit(parseInt(limit));
    }

    res.json({ versions });
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ message: 'Server error fetching versions' });
  }
});

// Admin: Create new version (Admin only)
router.post('/versions', auth.auth, async (req, res) => {
  try {
    if (req.user.userType !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const {
      platform,
      version,
      buildNumber,
      isForceUpdate,
      updateUrl,
      releaseNotes,
      minimumSupportedVersion,
      features,
      bugFixes,
      downloadSize,
      targetSdkVersion,
      minimumOsVersion
    } = req.body;

    // Validate required fields
    if (!platform || !version || !buildNumber || !updateUrl) {
      return res.status(400).json({ 
        message: 'Missing required fields: platform, version, buildNumber, updateUrl' 
      });
    }

    if (!['android', 'ios'].includes(platform.toLowerCase())) {
      return res.status(400).json({ message: 'Invalid platform. Use android or ios.' });
    }

    // Deactivate current active version if this is being set as active
    if (req.body.isActive !== false) { // Default to active
      await AppVersion.updateMany(
        { platform: platform.toLowerCase(), isActive: true },
        { isActive: false }
      );
    }

    const appVersion = new AppVersion({
      platform: platform.toLowerCase(),
      version,
      buildNumber,
      isForceUpdate: isForceUpdate || false,
      isActive: req.body.isActive !== false, // Default to true
      updateUrl,
      releaseNotes: releaseNotes || '',
      minimumSupportedVersion: minimumSupportedVersion || version,
      features: features || [],
      bugFixes: bugFixes || [],
      downloadSize: downloadSize || '',
      targetSdkVersion: targetSdkVersion || null,
      minimumOsVersion: minimumOsVersion || ''
    });

    await appVersion.save();

    res.status(201).json({
      message: 'Version created successfully',
      version: appVersion
    });
  } catch (error) {
    console.error('Error creating version:', error);
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'A version with this configuration already exists' 
      });
    }
    res.status(500).json({ message: 'Server error creating version' });
  }
});

// Admin: Update version (Admin only)
router.put('/versions/:id', auth.auth, async (req, res) => {
  try {
    if (req.user.userType !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const version = await AppVersion.findById(req.params.id);
    if (!version) {
      return res.status(404).json({ message: 'Version not found' });
    }

    // If setting this version as active, deactivate others for the same platform
    if (req.body.isActive === true) {
      await AppVersion.updateMany(
        { platform: version.platform, isActive: true, _id: { $ne: req.params.id } },
        { isActive: false }
      );
    }

    const updatedVersion = await AppVersion.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Version updated successfully',
      version: updatedVersion
    });
  } catch (error) {
    console.error('Error updating version:', error);
    res.status(500).json({ message: 'Server error updating version' });
  }
});

// Admin: Delete version (Admin only)
router.delete('/versions/:id', auth.auth, async (req, res) => {
  try {
    if (req.user.userType !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const version = await AppVersion.findByIdAndDelete(req.params.id);
    if (!version) {
      return res.status(404).json({ message: 'Version not found' });
    }

    res.json({ message: 'Version deleted successfully' });
  } catch (error) {
    console.error('Error deleting version:', error);
    res.status(500).json({ message: 'Server error deleting version' });
  }
});

// Get app info
router.get('/info', async (req, res) => {
  try {
    const [androidVersion, iosVersion] = await Promise.all([
      AppVersion.getCurrentVersion('android'),
      AppVersion.getCurrentVersion('ios')
    ]);

    res.json({
      appName: 'SNK Properties',
      description: 'Your trusted real estate platform',
      currentVersions: {
        android: androidVersion?.version || '1.0.0',
        ios: iosVersion?.version || '1.0.0'
      },
      features: [
        'Property listings and search',
        'Broker management system',
        'Employee referral tracking',
        'Real-time notifications',
        'Advanced filtering and maps',
        'Secure document uploads'
      ],
      supportContact: 'support@snkproperties.com',
      website: 'https://snkproperties.com'
    });
  } catch (error) {
    console.error('Error getting app info:', error);
    res.status(500).json({ message: 'Server error getting app info' });
  }
});

module.exports = router;