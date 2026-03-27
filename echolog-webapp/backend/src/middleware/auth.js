// CEG491X-Capstone/echolog-webapp/backend/src/middleware/auth.js
// UPDATED: Replaced process.env with config
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config'); // NEW: import config

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    config.jwtSecret, // UPDATED: use config.jwtSecret
    { expiresIn: config.jwtExpire } // UPDATED: use config.jwtExpire
  );
}

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, config.jwtSecret, async (err, decoded) => { // UPDATED: use config.jwtSecret
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    try {
      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      req.user = user;
      next();
    } catch (error) {
      res.status(500).json({ error: 'Error verifying user' });
    }
  });
}

module.exports = { generateToken, verifyToken };