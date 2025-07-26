const mongoose = require('mongoose');

async function checkCurrentFormat() {
  try {
    await mongoose.connect('mongodb+srv://admin:admin@cluster0.zist3g3.mongodb.net/test');
    
    const db = mongoose.connection.db;
    const propertiesCollection = db.collection('properties');
    
    const property = await propertiesCollection.findOne({});
    if (property && property.images) {
      console.log('Current images format:');
      console.log('Type:', typeof property.images[0]);
      console.log('Is Array:', Array.isArray(property.images));
      console.log('First image type:', typeof property.images[0]);
      
      if (typeof property.images[0] === 'object') {
        console.log('Keys in first image:', Object.keys(property.images[0]));
        console.log('Has url property:', 'url' in property.images[0]);
        console.log('Has numeric keys:', Object.keys(property.images[0]).filter(k => !isNaN(k)).length > 0);
      }
      
      console.log('Sample:', JSON.stringify(property.images[0]).substring(0, 200));
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkCurrentFormat();