const mongoose = require('mongoose');

async function inspectImageStructure() {
  try {
    await mongoose.connect('mongodb+srv://admin:admin@cluster0.zist3g3.mongodb.net/test');
    
    const db = mongoose.connection.db;
    const propertiesCollection = db.collection('properties');
    
    const property = await propertiesCollection.findOne({});
    if (property && property.images && property.images[0]) {
      console.log('First image structure:');
      const image = property.images[0];
      console.log('Keys:', Object.keys(image));
      console.log('Has numeric keys:', Object.keys(image).filter(key => !isNaN(key)).length);
      console.log('First 10 numeric keys:', Object.keys(image).filter(key => !isNaN(key)).slice(0, 10));
      console.log('Sample values:', Object.keys(image).filter(key => !isNaN(key)).slice(0, 10).map(key => image[key]).join(''));
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

inspectImageStructure();