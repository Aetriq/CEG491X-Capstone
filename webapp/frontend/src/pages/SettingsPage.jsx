// CEG491X-Capstone/webapp/Frontend/src/pages/SettingsPage.jsx

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next'; // NEW
import './SettingsPage.css';
import axios from 'axios';
import { useDialog } from '../contexts/DialogContext';

const API_URL = '/api';

const SettingsPage = ({ onBack }) => {
  const { t, i18n } = useTranslation(); // NEW
  const codeToName = {
  'en': 'English',
  'fr': 'French',
  'es': 'Spanish',
  'zh': 'Chinese'
  };

const nameToCode = {
  'English': 'en',
  'French': 'fr',
  'Spanish': 'es',
  'Chinese': 'zh'
  };
  const [settings, setSettings] = useState({
    deviceName: 'EchoLog-01',
    recordingLength: 60,
    autoUpload: true,
    gpsEnabled: true,
    notifications: true,
    theme: 'Light',
    language: 'en', // Use language codes (en, fr, es)
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
          const apiSettings = res.data.settings;
          const mappedLanguage = nameToCode[apiSettings.language] || 'en';
          setSettings(prev => ({
            ...prev,
            ...apiSettings,
            language: mappedLanguage
          }));
          // ONLY change language if it differs from current AND wasn't manually set
          if (i18n.language !== mappedLanguage && !localStorage.getItem('i18nextLng')) {
            i18n.changeLanguage(mappedLanguage);
          }
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [i18n]);

  // Apply dark mode when theme changes
  useEffect(() => {
    if (settings.theme === 'Dark') {
      document.body.classList.add('dark-mode');
      localStorage.setItem('theme', 'Dark');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('theme', 'Light');
    }
  }, [settings.theme]);



  const handleSave = async () => {
    try {
      const settingsToSend = {
        ...settings,
        language: codeToName[settings.language] || 'English'
      };
      await axios.put(`${API_URL}/settings/me`, settingsToSend);
      
      // Show confirmation with current language
      alert(i18n.t('settingsSaved')); // This will now use the NEW language
      
      // Force re-render to apply translations immediately
      window.location.reload(); // Optional: ensures all components re-render with new language
    } catch (err) {
      console.error('Error saving settings:', err);
      alert(i18n.t('errorSaving') + ': ' + (err.response?.data?.error || err.message));
    }
  };

  useEffect(() => {
    console.log('=== i18n Debug ===');
    console.log('i18n initialized:', i18n.isInitialized);
    console.log('Current language:', i18n.language);
    console.log('Available languages:', Object.keys(i18n.services?.resourceStore?.data || {}));
    console.log('Sample translation:', i18n.t('appName'));
  }, [i18n]);

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    // Save first
    localStorage.setItem('i18nextLng', newLang);
    setSettings({ ...settings, language: newLang });
    // Then change
    i18n.changeLanguage(newLang);
  };

  if (loading) {
    return (
      <div className="settings-container">
        <div className="settings-header">
          <button className="back-btn" onClick={onBack}>
            ← {t('back')}
          </button>
          <h1>{t('settings')}</h1>
          <p className="subtitle">{t('configurePreferences')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <button className="back-btn" onClick={onBack}>
          ← {t('back')}
        </button>
        <h1>{t('settings')}</h1>
        <p className="subtitle">{t('configurePreferences')}</p>
      </div>

      <div className="settings-grid">
        <div className="settings-card">
          <h3>{t('deviceSettings')}</h3>

          <div className="form-group">
            <label>{t('deviceName')}</label>
            <input
              type="text"
              value={settings.deviceName}
              onChange={(e) => setSettings({ ...settings, deviceName: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>{t('recordingLength')}: {settings.recordingLength}s</label>
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
            <label>{t('activityThreshold')}</label>
            <input
              type="number"
              value={settings.activityThreshold}
              onChange={(e) =>
                setSettings({ ...settings, activityThreshold: parseInt(e.target.value || '0', 10) })
              }
            />
          </div>

          <div className="form-group">
            <label>{t('activityTime')} (ms)</label>
            <input
              type="number"
              value={settings.activityTime}
              onChange={(e) =>
                setSettings({ ...settings, activityTime: parseInt(e.target.value || '0', 10) })
              }
            />
          </div>

          <div className="form-group">
            <label>{t('inactivityThreshold')}</label>
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
            <label>{t('inactivityTime')} (ms)</label>
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
          <h3>{t('appSettings')}</h3>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={settings.notifications}
                onChange={(e) =>
                  setSettings({ ...settings, notifications: e.target.checked })
                }
              />
              {t('notifications')}
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
              {t('dark')} (Dark mode)
            </label>
          </div>

          <div className="form-group">
            <label>{t('language')}</label>
            <select
              value={settings.language}
              onChange={handleLanguageChange}
            >
              <option value="en">{t('english')}</option>
              <option value="fr">{t('french')}</option>
              <option value="es">{t('spanish')}</option>
              <option value="zh">中文</option>
            </select>
          </div>
        </div>

        <div className="settings-card">
          <h3>{t('advanced')}</h3>

          <div className="warning-section">
            <p className="warning-text">{t('advancedWarning')}</p>

            <button
              className="btn btn-warning"
              type="button"
              onClick={() => alert(t('factoryReset') + ' not implemented yet.')}
            >
              {t('factoryReset')}
            </button>

            <button
              className="btn btn-danger"
              type="button"
              onClick={() => alert(t('clearAllData') + ' not implemented yet.')}
            >
              {t('clearAllData')}
            </button>

            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => alert(t('exportConfig') + ' not implemented yet.')}
            >
              {t('exportConfig')}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn btn-secondary" onClick={onBack}>
          {t('cancel')}
        </button>
        <button className="btn btn-primary" onClick={handleSave}>
          {t('save')}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;