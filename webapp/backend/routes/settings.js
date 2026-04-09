// webapp/Backend/routes/settings.js

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { supabase } = require('../database/supabase');

const DEFAULTS = {
  device_name: 'EchoLog-01',
  recording_length: 60,
  auto_upload: 1,
  gps_enabled: 1,
  notifications: 1,
  theme: 'Light',
  language: 'English'
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
router.get('/me', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('settings GET error', error);
      return res.status(500).json({ error: 'Failed to load settings' });
    }

    res.json({ settings: rowToSettings(data) });
  } catch (err) {
    console.error('settings GET error', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PUT /api/settings/me
router.put('/me', verifyToken, async (req, res) => {
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

  try {
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: req.user.id,
        device_name: toStore.device_name,
        recording_length: toStore.recording_length,
        auto_upload: toStore.auto_upload,
        gps_enabled: toStore.gps_enabled,
        notifications: toStore.notifications,
        theme: toStore.theme,
        language: toStore.language
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('settings PUT error', error);
      return res.status(500).json({ error: 'Failed to save settings' });
    }

    res.json({ message: 'Settings saved', settings: rowToSettings(toStore) });
  } catch (err) {
    console.error('settings PUT error', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

module.exports = router;

