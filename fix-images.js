const mongoose = require('mongoose');

async function fixImageUrls() {
  try {
    await mongoose.connect('mongodb+srv://admin:admin@cluster0.zist3g3.mongodb.net/test');
    console.log('Connected to test database');
    
    const db = mongoose.connection.db;
    const propertiesCollection = db.collection('properties');
    
    // Get all properties
    const properties = await propertiesCollection.find({}).toArray();
    console.log('Total properties found:', properties.length);
    
    let fixedCount = 0;
    
    for (const property of properties) {
      let needsUpdate = false;
      const fixedImages = [];
      
      if (property.images && Array.isArray(property.images)) {
        for (const image of property.images) {
          if (typeof image === 'object' && image !== null) {
            // Check if the image URL is stored as character array
            const numericKeys = Object.keys(image).filter(key => !isNaN(key));
            if (numericKeys.length > 0) {
              // Reconstruct URL from character array
              const reconstructedUrl = numericKeys
                .sort((a, b) => Number(a) - Number(b))
                .map(key => image[key])
                .join('');
              
              fixedImages.push({
                url: reconstructedUrl,
                key: image.key || '',
                caption: image.caption || '',
                _id: image._id
              });
              needsUpdate = true;
              console.log(`Reconstructed URL: ${reconstructedUrl}`);
            } else if (image.url) {
              // Image is already in correct format
              fixedImages.push(image);
            }
          }
        }
      }
      
      if (needsUpdate) {
        await propertiesCollection.updateOne(
          { _id: property._id },
          { $set: { images: fixedImages } }
        );
        fixedCount++;
        console.log(`Fixed property: ${property.title} - Images: ${fixedImages.length}`);
      }
    }
    
    console.log(`Fixed ${fixedCount} properties with corrupted image URLs`);
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

fixImageUrls();