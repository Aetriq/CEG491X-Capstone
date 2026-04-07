// backend/src/routes/file.routes.js
// NEW: File upload routes with multer for handling file uploads
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /wav|mp3|txt|json/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only audio and text files are allowed'));
    }
  }
});

// File upload endpoint
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    success: true,
    message: 'File uploaded successfully',
    file: {
      originalName: req.file.originalname,
      storedName: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: `/uploads/${req.file.filename}`
    }
  });
});

// List uploaded files
router.get('/files', (req, res) => {
  const uploadDir = path.join(__dirname, '../../uploads');
  
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Error reading files' });
    }
    
    const fileList = files.map(file => {
      const stat = fs.statSync(path.join(uploadDir, file));
      return {
        name: file,
        size: stat.size,
        modified: stat.mtime,
        url: `/uploads/${file}`
      };
    });
    
    res.json({ files: fileList });
  });
});

// Download file
router.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, '../../uploads', req.params.filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Delete file
router.delete('/files/:filename', (req, res) => {
  const filePath = path.join(__dirname, '../../uploads', req.params.filename);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'File deleted successfully' });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

module.exports = router;