// webapp/Backend/routes/user.js

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { supabase } = require('../database/supabase');

// GET /api/user/me - current authenticated user
router.get('/me', verifyToken, async (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/user/me - update username/email/password
router.put('/me', verifyToken, async (req, res) => {
  try {
    const { username, email, currentPassword, newPassword } = req.body || {};
    const updates = {};

    if (username) updates.username = username;
    if (email) updates.email = email;

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required to change password' });
      }
      const fullUser = await User.findByUsername(req.user.username);
      const ok = await User.verifyPassword(fullUser, currentPassword);
      if (!ok) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      const hash = await bcrypt.hash(newPassword, 10);
      updates.password_hash = hash;
    }

    if (Object.keys(updates).length === 0) {
      return res.json({ message: 'No changes' });
    }

    // Supabase update
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id);

    if (error) {
      console.error('Update /user/me error', error);
      return res.status(500).json({ error: 'Failed to update account' });
    }

    const refreshed = await User.findById(req.user.id);
    return res.json({ message: 'Account updated', user: refreshed });
  } catch (err) {
    console.error('Update /user/me error', err);
    res.status(500).json({ error: err.message || 'Failed to update account' });
  }
});

module.exports = router;

