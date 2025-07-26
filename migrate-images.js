const mongoose = require('mongoose');

async function migrateImageData() {
  try {
    await mongoose.connect('mongodb+srv://admin:admin@cluster0.zist3g3.mongodb.net/test');
    console.log('Connected to test database');
    
    const db = mongoose.connection.db;
    const propertiesCollection = db.collection('properties');
    
    // Get all properties
    const properties = await propertiesCollection.find({}).toArray();
    console.log('Total properties found:', properties.length);
    
    let migratedCount = 0;
    
    for (const property of properties) {
      let needsUpdate = false;
      const migratedImages = [];
      
      if (property.images && Array.isArray(property.images)) {
        for (const image of property.images) {
          if (typeof image === 'string') {
            // Already in correct format
            migratedImages.push(image);
          } else if (typeof image === 'object' && image !== null) {
            // Check if it has a url property
            if (image.url && typeof image.url === 'string') {
              migratedImages.push(image.url);
              needsUpdate = true;
            } else {
              // Reconstruct from character array
              const numericKeys = Object.keys(image).filter(key => !isNaN(key));
              if (numericKeys.length > 0) {
                const reconstructedUrl = numericKeys
                  .sort((a, b) => Number(a) - Number(b))
                  .map(key => image[key])
                  .join('');
                
                migratedImages.push(reconstructedUrl);
                needsUpdate = true;
                console.log(`Reconstructed URL for ${property.title}:`, reconstructedUrl);
              }
            }
          }
        }
      }
      
      if (needsUpdate && migratedImages.length > 0) {
        await propertiesCollection.updateOne(
          { _id: property._id },
          { $set: { images: migratedImages } }
        );
        migratedCount++;
        console.log(`Migrated property: ${property.title} - ${migratedImages.length} images`);
      }
    }
    
    console.log(`Successfully migrated ${migratedCount} properties to new image format`);
    
    // Verify the migration
    const sampleProperty = await propertiesCollection.findOne({ images: { $exists: true, $ne: [] } });
    if (sampleProperty) {
      console.log('\nSample migrated property images:');
      sampleProperty.images.forEach((img, index) => {
        console.log(`Image ${index + 1}:`, img.substring(0, 100) + '...');
      });
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

migrateImageData();