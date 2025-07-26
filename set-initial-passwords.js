// Script to set initial password for all users
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

// Configuration
const INITIAL_PASSWORD = '123456';
const MONGODB_URI = 'mongodb+srv://admin:admin@cluster0.zist3g3.mongodb.net/';

async function setInitialPasswords() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Hash the initial password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(INITIAL_PASSWORD, salt);
    console.log('Password hashed successfully');

    // Update all users with the new password
    const result = await User.updateMany(
      {}, // Empty filter to match all users
      { 
        $set: { 
          password: hashedPassword 
        } 
      }
    );

    console.log(`Password updated for ${result.modifiedCount} users`);
    console.log(`Total users matched: ${result.matchedCount}`);
    
    if (result.modifiedCount > 0) {
      console.log(`All users now have the initial password: ${INITIAL_PASSWORD}`);
    } else {
      console.log('No users were updated');
    }

  } catch (error) {
    console.error('Error setting initial passwords:', error);
  } finally {
    // Close the database connection
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the script
setInitialPasswords();