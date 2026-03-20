// CEG491X-Capstone/webapp/Backend/routes/settings.js

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { db } = require('../database/db');

const DEFAULTS = {
  device_name: 'EchoLog-01',
  recording_length: 60,
  auto_upload: 1,
  gps_enabled: 1,
  notifications: 1,
  theme: 'Light',
  language: 'en'   // ← change from 'English'
};

function rowToSettings(row) {
  if (!row) {
    return {
      deviceName: DEFAULTS.device_name,
      recordingLength: DEFAULTS.recording_length,
      autoUpload: !!DEFAULTS.auto_upload,
      gpsEnabled: !!DEFAULTS.gps_enabled,
      notifications: !!DEFAULTS.notifications,
      theme: DEFAULTS.theme,
      language: DEFAULTS.language
    };
  }
  return {
    deviceName: row.device_name || DEFAULTS.device_name,
    recordingLength: row.recording_length != null ? row.recording_length : DEFAULTS.recording_length,
    autoUpload: !!row.auto_upload,
    gpsEnabled: !!row.gps_enabled,
    notifications: !!row.notifications,
    theme: row.theme || DEFAULTS.theme,
    language: row.language || DEFAULTS.language
  };
}

// GET /api/settings/me
router.get('/me', verifyToken, (req, res) => {
  db.get(
    'SELECT * FROM user_settings WHERE user_id = ?',
    [req.user.id],
    (err, row) => {
      if (err) {
        console.error('settings GET error', err);
        return res.status(500).json({ error: 'Failed to load settings' });
      }
      res.json({ settings: rowToSettings(row) });
    }
  );
});

// PUT /api/settings/me
router.put('/me', verifyToken, (req, res) => {
  const s = req.body || {};
  const toStore = {
    device_name: s.deviceName || DEFAULTS.device_name,
    recording_length: Number.isFinite(+s.recordingLength) ? +s.recordingLength : DEFAULTS.recording_length,
    auto_upload: s.autoUpload ? 1 : 0,
    gps_enabled: s.gpsEnabled ? 1 : 0,
    notifications: s.notifications ? 1 : 0,
    theme: s.theme || DEFAULTS.theme,
    language: s.language || DEFAULTS.language
  };

  db.run(
    `INSERT INTO user_settings (user_id, device_name, recording_length, auto_upload, gps_enabled, notifications, theme, language)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       device_name = excluded.device_name,
       recording_length = excluded.recording_length,
       auto_upload = excluded.auto_upload,
       gps_enabled = excluded.gps_enabled,
       notifications = excluded.notifications,
       theme = excluded.theme,
       language = excluded.language,
       updated_at = datetime('now')`,
    [
      req.user.id,
      toStore.device_name,
      toStore.recording_length,
      toStore.auto_upload,
      toStore.gps_enabled,
      toStore.notifications,
      toStore.theme,
      toStore.language
    ],
    (err) => {
      if (err) {
        console.error('settings PUT error', err);
        return res.status(500).json({ error: 'Failed to save settings' });
      }
      res.json({ message: 'Settings saved', settings: rowToSettings(toStore) });
    }
  );
});

module.exports = router;