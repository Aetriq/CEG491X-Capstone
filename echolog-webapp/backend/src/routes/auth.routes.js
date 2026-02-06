// backend/src/routes/auth.routes.js
// UPDATED: Added JWT authentication with token verification
const express = require('express');
const router = express.Router();

// ADD JWT AUTHENTICATION
const jwt = require('jsonwebtoken');

// Update login route
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate credentials (in real app, check database)
    if (username === 'admin' && password === 'admin') {
      const user = {
        id: 1,
        username: 'admin',
        email: 'admin@echolog.com',
        name: 'System Administrator',
        role: 'admin'
      };
      
      // Create JWT token
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
      );
      
      res.json({
        success: true,
        token,
        user
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Add token verification middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Protected route example
router.get('/profile', verifyToken, (req, res) => {
  res.json({
    success: true,
    message: 'Protected data accessed successfully',
    userId: req.userId
  });
});

// Add logout route (optional - client-side token removal)
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Add register route (optional)
router.post('/register', (req, res) => {
  // In real app, save user to database
  res.json({
    success: true,
    message: 'User registered successfully'
  });
});

module.exports = router;