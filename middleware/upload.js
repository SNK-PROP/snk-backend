const multer = require('multer');

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter for images and documents
const fileFilter = (req, file, cb) => {
  // Allow images
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  }
  // Allow documents (PDF, DOC, DOCX)
  else if (file.mimetype === 'application/pdf' || 
           file.mimetype === 'application/msword' || 
           file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    cb(null, true);
  }
  else {
    cb(new Error('Invalid file type. Only images and documents are allowed.'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

module.exports = upload;