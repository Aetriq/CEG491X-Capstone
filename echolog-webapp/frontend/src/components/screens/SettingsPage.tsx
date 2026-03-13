// echolog-webapp/frontend/src/components/screens/SettingsPage.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next'; // NEW: i18n
import toast from 'react-hot-toast'; // NEW: toast notifications
import './SettingsPage.css';

// Password strength evaluation function
const getPasswordStrength = (password: string): { score: number; label: string } => {
  if (!password) return { score: 0, label: 'None' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[score] };
};

interface SettingsPageProps {
  onBack: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation(); // NEW: get i18n instance
  const [settings, setSettings] = useState({
    deviceName: 'EchoLog-01',
    recordingLength: 60,
    autoUpload: true,
    gpsEnabled: true,
    notifications: true,
    language: 'en',
    theme: 'light'
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: 'None' });

  useEffect(() => {
    setPasswordStrength(getPasswordStrength(passwordData.newPassword));
  }, [passwordData.newPassword]);

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('echolog_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings(parsed);
        // Apply theme
        if (parsed.theme && parsed.theme !== 'auto') {
          document.documentElement.setAttribute('data-theme', parsed.theme);
        } else if (parsed.theme === 'auto') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        }
        // Apply language
        i18n.changeLanguage(parsed.language);
      } catch (e) {
        console.error('Failed to parse saved settings');
      }
    }
  }, [i18n]);

  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    if (key === 'theme') {
      if (value !== 'auto') {
        document.documentElement.setAttribute('data-theme', value);
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      }
    }
    if (key === 'language') {
      i18n.changeLanguage(value); // UPDATED: change language immediately
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    setMessage('');
    try {
      localStorage.setItem('echolog_settings', JSON.stringify(settings));
      toast.success(t('settingsSaved')); // UPDATED: toast
    } catch (err) {
      toast.error(t('errorSaving'));
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    if (!passwordData.currentPassword) {
      toast.error(t('currentPasswordRequired') || 'Current password is required');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      toast.error(t('passwordMinLength'));
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error(t('passwordsDoNotMatch'));
      return;
    }
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success(t('passwordChanged'));
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(t('errorChangingPassword'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <button className="back-btn" onClick={onBack} aria-label={t('back')}>
          ← {t('back')}
        </button>
        <h1>{t('settings')}</h1>
        <p className="subtitle">{t('configurePreferences')}</p>
      </div>

      <div className="settings-grid">
        {/* Device Settings */}
        <div className="settings-card">
          <h3>{t('deviceSettings')}</h3>
          <div className="form-group">
            <label htmlFor="deviceName">{t('deviceName')}</label>
            <input
              id="deviceName"
              type="text"
              value={settings.deviceName}
              onChange={(e) => handleSettingChange('deviceName', e.target.value)}
              aria-label={t('deviceName')}
            />
          </div>
          <div className="form-group">
            <label htmlFor="recordingLength">{t('recordingLength')}: {settings.recordingLength}s</label>
            <input
              id="recordingLength"
              type="range"
              min="5"
              max="300"
              value={settings.recordingLength}
              onChange={(e) => handleSettingChange('recordingLength', parseInt(e.target.value))}
              aria-label={t('recordingLength')}
            />
          </div>
          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={settings.autoUpload}
                onChange={(e) => handleSettingChange('autoUpload', e.target.checked)}
                aria-label={t('autoUpload')}
              />
              {t('autoUpload')}
            </label>
          </div>
          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={settings.gpsEnabled}
                onChange={(e) => handleSettingChange('gpsEnabled', e.target.checked)}
                aria-label={t('gpsEnabled')}
              />
              {t('gpsEnabled')}
            </label>
          </div>
        </div>

        {/* Application Settings */}
        <div className="settings-card">
          <h3>{t('appSettings')}</h3>
          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={settings.notifications}
                onChange={(e) => handleSettingChange('notifications', e.target.checked)}
                aria-label={t('notifications')}
              />
              {t('notifications')}
            </label>
          </div>
          <div className="form-group">
            <label htmlFor="theme">{t('theme')}</label>
            <select
              id="theme"
              value={settings.theme}
              onChange={(e) => handleSettingChange('theme', e.target.value)}
              aria-label={t('theme')}
            >
              <option value="light">{t('light')}</option>
              <option value="dark">{t('dark')}</option>
              <option value="auto">{t('auto')}</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="language">{t('language')}</label>
            <select
              id="language"
              value={settings.language}
              onChange={(e) => handleSettingChange('language', e.target.value)}
              aria-label={t('language')}
            >
              <option value="en">{t('english')}</option>
              <option value="fr">{t('french')}</option>
              <option value="es">{t('spanish')}</option>
            </select>
          </div>
        </div>

        {/* Change Password */}
        <div className="settings-card">
          <h3>{t('changePassword')}</h3>
          <div className="form-group">
            <label htmlFor="currentPassword">{t('currentPassword')}</label>
            <input
              id="currentPassword"
              type="password"
              value={passwordData.currentPassword}
              onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
              aria-label={t('currentPassword')}
            />
          </div>
          <div className="form-group">
            <label htmlFor="newPassword">{t('newPassword')}</label>
            <input
              id="newPassword"
              type="password"
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
              aria-label={t('newPassword')}
            />
            <div className="password-strength">
              <div className="strength-bar">
                <div 
                  className="strength-fill" 
                  style={{ 
                    width: `${passwordStrength.score * 25}%`,
                    backgroundColor: 
                      passwordStrength.score <= 1 ? '#dc3545' :
                      passwordStrength.score === 2 ? '#ffc107' :
                      passwordStrength.score === 3 ? '#17a2b8' : '#28a745'
                  }}
                ></div>
              </div>
              <span className="strength-label">
                {passwordStrength.score === 0 ? '' : 
                 passwordStrength.score === 1 ? t('weak') :
                 passwordStrength.score === 2 ? t('fair') :
                 passwordStrength.score === 3 ? t('good') : t('strong')}
              </span>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">{t('confirmNewPassword')}</label>
            <input
              id="confirmPassword"
              type="password"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
              aria-label={t('confirmNewPassword')}
            />
          </div>
          <button className="btn btn-primary" onClick={changePassword} disabled={loading}>
            {t('changePassword')}
          </button>
        </div>

        {/* Advanced */}
        <div className="settings-card">
          <h3>{t('advanced')}</h3>
          <div className="warning-section">
            <p className="warning-text">{t('advancedWarning')}</p>
            <button className="btn btn-warning">{t('factoryReset')}</button>
            <button className="btn btn-danger">{t('clearAllData')}</button>
            <button className="btn btn-secondary">{t('exportConfig')}</button>
          </div>
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn btn-secondary" onClick={onBack} aria-label={t('cancel')}>
          {t('cancel')}
        </button>
        <button className="btn btn-primary" onClick={saveSettings} disabled={loading}>
          {loading ? t('processing') : t('save')}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;