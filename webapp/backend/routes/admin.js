const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const User = require('../models/User');

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No token provided' });
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

// Who am I (any logged-in user)
router.get('/me', verifyToken, (req, res) => {
  res.json({ user: req.user });
});

// List all users (admin only)
router.get('/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.allBasic();
    console.log('[ADMIN-DEBUG] GET /api/admin/users', { by: req.user.id, count: users.length });
    res.json({ users });
  } catch (e) {
    console.error('[ADMIN-DEBUG] GET /api/admin/users error', e);
    res.status(500).json({ error: e.message || 'Failed to list users' });
  }
});

// List timelines for a user (admin only)
router.get('/users/:userId/timelines', verifyToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId' });

    const timelines = await User.timelinesBasicByUserId(userId);
    console.log('[ADMIN-DEBUG] GET /api/admin/users/:userId/timelines', { by: req.user.id, userId, count: timelines.length });
    res.json({ timelines });
  } catch (e) {
    console.error('[ADMIN-DEBUG] GET /api/admin/users/:userId/timelines error', e);
    res.status(500).json({ error: e.message || 'Failed to list timelines' });
  }
});

module.exports = router;
