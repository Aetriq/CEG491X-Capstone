const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken, verifyToken } = require('../middleware/auth');

// Create Account
router.post('/register',
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().withMessage('Invalid email address'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, email, password } = req.body;

      // Check if username or email already exists
      const existingUser = await User.findByUsername(username) || await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'Username or email already exists' });
      }

      const user = await User.create(username, email, password);
      const token = generateToken(user);

      // Log successful account creation (treated as sign-in)
      await User.logSignInAttempt(user.id, username, true, req);

      res.status(201).json({
        message: 'Account created successfully',
        user: { id: user.id, username: user.username, email: user.email },
        token
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: error.message || 'Error creating account' });
    }
  }
);

// Sign In
router.post('/login',
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password } = req.body;

      const user = await User.findByUsername(username);
      if (!user) {
        // Log failed attempt
        await User.logSignInAttempt(null, username, false, req);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPassword = await User.verifyPassword(user, password);
      if (!isValidPassword) {
        // Log failed attempt
        await User.logSignInAttempt(user.id, username, false, req);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Log successful sign-in
      await User.logSignInAttempt(user.id, username, true, req);

      const token = generateToken(user);

      res.json({
        message: 'Sign in successful',
        user: { id: user.id, username: user.username, email: user.email },
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Error signing in' });
    }
  }
);

// Sign Out (client-side token removal, but verify token is valid)
router.post('/logout', verifyToken, (req, res) => {
  // Token is valid, client should remove it
  res.json({ message: 'Signed out successfully' });
});

// Verify token (for checking if user is still signed in)
router.get('/verify', verifyToken, async (req, res) => {
  res.json({
    user: req.user,
    message: 'Token is valid'
  });
});

module.exports = router;
