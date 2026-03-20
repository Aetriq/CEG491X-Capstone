// CEG491X-Capstone/webapp/Backend/routes/user.js

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { db } = require('../database/db');

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

    const fields = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(req.user.id);

    db.run(
      `UPDATE users SET ${fields}, created_at = created_at WHERE id = ?`,
      values,
      (err) => {
        if (err) {
          console.error('Update /user/me error', err);
          return res.status(500).json({ error: 'Failed to update account' });
        }
        User.findById(req.user.id)
          .then((refreshed) => res.json({ message: 'Account updated', user: refreshed }))
          .catch((e) => {
            console.error('Refetch user error', e);
            res.json({ message: 'Account updated' });
          });
      }
    );
  } catch (err) {
    console.error('Update /user/me error', err);
    res.status(500).json({ error: err.message || 'Failed to update account' });
  }
});

module.exports = router;

