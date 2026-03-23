import React, { useState, useEffect } from 'react';
import './SettingsPage.css';
import axios from 'axios';
import { useDialog } from '../contexts/DialogContext';

const API_URL = '/api';

const SettingsPage = ({ onBack }) => {
  const { showAlert } = useDialog();
  const [settings, setSettings] = useState({
    deviceName: 'EchoLog-01',
    recordingLength: 60,
    autoUpload: true,
    gpsEnabled: true,
    notifications: true,
    theme: 'Light',
    language: 'English',
    activityThreshold: 1800,
    activityTime: 10,
    inactivityThreshold: 1500,
    inactivityTime: 10
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/settings/me`);
        if (!cancelled && res.data && res.data.settings) {
          setSettings(prev => ({ ...prev, ...res.data.settings }));
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply dark mode class when theme is Dark and persist in localStorage
  useEffect(() => {
    if (settings.theme === 'Dark') {
      document.body.classList.add('dark-mode');
      try {
        localStorage.setItem('theme', 'Dark');
      } catch {}
    } else {
      document.body.classList.remove('dark-mode');
      try {
        localStorage.setItem('theme', 'Light');
      } catch {}
    }
  }, [settings.theme]);

  const handleSave = async () => {
    try {
      await axios.put(`${API_URL}/settings/me`, settings);
      console.log('Saving settings:', settings);
      await showAlert('Settings saved successfully!', 'Settings');
    } catch (err) {
      console.error('Error saving settings:', err);
      await showAlert(
        'Failed to save settings: ' + (err.response?.data?.error || err.message),
        'Settings'
      );
    }
  };

  if (loading) {
    return (
      <div className="settings-container">
        <div className="settings-header">
          <button className="back-btn" onClick={onBack}>
            ← Back
          </button>
          <h1>Configuration Settings</h1>
          <p className="subtitle">Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h1>Configuration Settings</h1>
        <p className="subtitle">Manage device parameters and preferences</p>
      </div>

      <div className="settings-grid">
        <div className="settings-card">
          <h3>Device Settings</h3>

          <div className="form-group">
            <label>Device Name</label>
            <input
              type="text"
              value={settings.deviceName}
              onChange={(e) => setSettings({ ...settings, deviceName: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Audio Recording Length (s): {settings.recordingLength}s</label>
            <input
              type="range"
              min="10"
              max="300"
              value={settings.recordingLength}
              onChange={(e) =>
                setSettings({ ...settings, recordingLength: parseInt(e.target.value, 10) })
              }
            />
            <div className="range-labels">
              <span>10s</span>
              <span>300s</span>
            </div>
          </div>

          <div className="form-group">
            <label>Activity Threshold</label>
            <input
              type="number"
              value={settings.activityThreshold}
              onChange={(e) =>
                setSettings({ ...settings, activityThreshold: parseInt(e.target.value || '0', 10) })
              }
            />
          </div>

          <div className="form-group">
            <label>Activity Time (ms)</label>
            <input
              type="number"
              value={settings.activityTime}
              onChange={(e) =>
                setSettings({ ...settings, activityTime: parseInt(e.target.value || '0', 10) })
              }
            />
          </div>

          <div className="form-group">
            <label>Inactivity Threshold</label>
            <input
              type="number"
              value={settings.inactivityThreshold}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  inactivityThreshold: parseInt(e.target.value || '0', 10)
                })
              }
            />
          </div>

          <div className="form-group">
            <label>Inactivity Time (ms)</label>
            <input
              type="number"
              value={settings.inactivityTime}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  inactivityTime: parseInt(e.target.value || '0', 10)
                })
              }
            />
          </div>
        </div>

        <div className="settings-card">
          <h3>Application Settings</h3>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={settings.notifications}
                onChange={(e) =>
                  setSettings({ ...settings, notifications: e.target.checked })
                }
              />
              Enable notifications
            </label>
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={settings.theme === 'Dark'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    theme: e.target.checked ? 'Dark' : 'Light'
                  })
                }
              />
              Enable dark mode
            </label>
          </div>

          <div className="form-group">
            <label>Language</label>
            <select
              value={settings.language}
              onChange={(e) => setSettings({ ...settings, language: e.target.value })}
            >
              <option>English</option>
              <option>French</option>
              <option>Spanish</option>
            </select>
          </div>
        </div>

        <div className="settings-card">
          <h3>Advanced</h3>

          <div className="warning-section">
            <p className="warning-text">⚠️ Advanced settings - proceed with caution</p>

            <button
              className="btn btn-warning"
              type="button"
              onClick={() => showAlert('Factory reset not implemented yet.', 'Advanced')}
            >
              Factory Reset Device
            </button>

            <button
              className="btn btn-danger"
              type="button"
              onClick={() => showAlert('Clear all data not implemented yet.', 'Advanced')}
            >
              Clear All Data
            </button>

            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => showAlert('Export configuration not implemented yet.', 'Advanced')}
            >
              Export Configuration
            </button>
          </div>
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn btn-secondary" onClick={onBack}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSave}>
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;

