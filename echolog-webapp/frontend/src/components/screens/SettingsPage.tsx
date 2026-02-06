// frontend/src/components/screens/SettingsPage.tsx
import React, { useState } from 'react';
import './SettingsPage.css';

interface SettingsPageProps {
  onBack: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const [settings, setSettings] = useState({
    deviceName: 'EchoLog-01',
    recordingLength: 60,
    autoUpload: true,
    gpsEnabled: true,
    notifications: true,
  });

  const handleSave = () => {
    console.log('Saving settings:', settings);
    alert('Settings saved successfully!');
  };

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
              onChange={(e) => setSettings({...settings, deviceName: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Recording Length: {settings.recordingLength}s</label>
            <input
              type="range"
              min="5"
              max="300"
              value={settings.recordingLength}
              onChange={(e) => setSettings({...settings, recordingLength: parseInt(e.target.value)})}
            />
            <div className="range-labels">
              <span>5s</span>
              <span>300s</span>
            </div>
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={settings.autoUpload}
                onChange={(e) => setSettings({...settings, autoUpload: e.target.checked})}
              />
              Auto-upload files when connected
            </label>
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={settings.gpsEnabled}
                onChange={(e) => setSettings({...settings, gpsEnabled: e.target.checked})}
              />
              Enable GPS tracking
            </label>
          </div>
        </div>

        <div className="settings-card">
          <h3>Application Settings</h3>
          
          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={settings.notifications}
                onChange={(e) => setSettings({...settings, notifications: e.target.checked})}
              />
              Enable notifications
            </label>
          </div>

          <div className="form-group">
            <label>Theme</label>
            <select>
              <option>Light</option>
              <option>Dark</option>
              <option>Auto</option>
            </select>
          </div>

          <div className="form-group">
            <label>Language</label>
            <select>
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
            
            <button className="btn btn-warning">
              Factory Reset Device
            </button>
            
            <button className="btn btn-danger">
              Clear All Data
            </button>
            
            <button className="btn btn-secondary">
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