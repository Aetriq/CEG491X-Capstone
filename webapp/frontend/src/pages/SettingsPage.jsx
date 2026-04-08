// CEG491X-Capstone/webapp/Frontend/src/pages/SettingsPage.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next'; // NEW
import './SettingsPage.css';
import './Home.css';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useBle } from '../contexts/BleConnectionContext';
import { useDialog } from '../contexts/DialogContext';

const API_URL = '/api';

const SettingsPage = () => {
  const { t, i18n } = useTranslation(); // NEW
  const { user, logout } = useAuth();
  const ble = useBle();
  const navigate = useNavigate();
  const { showAlert } = useDialog();
  const languageTouchedRef = useRef(false);
  const languageSaveTimerRef = useRef(null);
  const latestSettingsRef = useRef(null);
  const [settings, setSettings] = useState({
    deviceName: 'EchoLog-01',
    recordingLength: 60,
    autoUpload: true,
    gpsEnabled: true,
    theme: 'Light',
    language: 'en', // Use language codes (en, fr, es)
    activityThreshold: 1800,
    activityTime: 10,
    inactivityThreshold: 1500,
    inactivityTime: 10
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/settings/me`);
        if (!cancelled && res.data && res.data.settings) {
          const apiSettings = res.data.settings;
          // Backend now stores language codes. Keep backward compatibility with older stored names.
          const nameToCode = {
            English: 'en',
            French: 'fr',
            Spanish: 'es',
            Chinese: 'zh'
          };
          const mappedLanguage =
            nameToCode[apiSettings.language] ||
            (typeof apiSettings.language === 'string' ? apiSettings.language : 'en') ||
            'en';

          // Prefer localStorage language to avoid snap-back if DB is stale.
          let persistedLang = null;
          try {
            persistedLang = localStorage.getItem('i18nextLng');
          } catch {
            persistedLang = null;
          }
          const desiredLanguage = persistedLang || mappedLanguage || 'en';

          // Never overwrite a language the user just picked (prevents snap-back to English).
          setSettings(prev => {
            const next = { ...prev, ...apiSettings };
            if (!languageTouchedRef.current) {
              next.language = desiredLanguage;
            }
            return next;
          });

          if (!languageTouchedRef.current && i18n.language !== desiredLanguage) {
            try {
              localStorage.setItem('i18nextLng', desiredLanguage);
            } catch {}
            i18n.changeLanguage(desiredLanguage);
          }

          // If localStorage differs from backend, sync it back (best-effort).
          if (
            desiredLanguage &&
            mappedLanguage &&
            desiredLanguage !== mappedLanguage
          ) {
            try {
              await axios.put(`${API_URL}/settings/me`, {
                ...apiSettings,
                language: desiredLanguage
              });
            } catch (syncErr) {
              // Ignore; localStorage will still keep language stable.
              console.warn('Language sync to backend failed:', syncErr);
            }
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

  // One-time sync so SettingsPage never snaps back to English.
  useEffect(() => {
    try {
      const persisted = localStorage.getItem('i18nextLng');
      const desired = persisted || settings.language;
      if (desired && i18n.language !== desired) {
        i18n.changeLanguage(desired);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Persist language code consistently with backend storage.
      await axios.put(`${API_URL}/settings/me`, settings);
      await showAlert(i18n.t('settingsSaved'), t('settings'));
    } catch (err) {
      console.error('Error saving settings:', err);
      await showAlert(i18n.t('errorSaving') + ': ' + (err.response?.data?.error || err.message), t('settings'));
    }
  };

  useEffect(() => {
    console.log('=== i18n Debug ===');
    console.log('i18n initialized:', i18n.isInitialized);
    console.log('Current language:', i18n.language);
    console.log('Available languages:', Object.keys(i18n.services?.resourceStore?.data || {}));
    console.log('Sample translation:', i18n.t('appName'));
  }, []);

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    languageTouchedRef.current = true;
    // Save first
    try {
      localStorage.setItem('i18nextLng', newLang);
    } catch {}

    // Update state and also persist language immediately (debounced)
    setSettings(prev => ({ ...prev, language: newLang }));
    // Then change
    i18n.changeLanguage(newLang);

    // Debounced autosave so user doesn't lose the change before clicking Save.
    if (languageSaveTimerRef.current) {
      clearTimeout(languageSaveTimerRef.current);
    }
    languageSaveTimerRef.current = setTimeout(async () => {
      try {
        const base = latestSettingsRef.current || settings;
        const payload = { ...base, language: newLang };
        await axios.put(`${API_URL}/settings/me`, payload);
      } catch (err) {
        console.error('Error auto-saving language:', err);
        // Don't block the UI; just notify.
        await showAlert(
          i18n.t('errorSaving') + ': ' + (err.response?.data?.error || err.message),
          t('settings')
        );
      }
    }, 400);
  };

  return (
    <div className="home-shell">
      <div className="floating-bg">
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
      </div>
      <div className="sidebar">
        <div className="logo">{t('appName')}</div>
        <div className="status-panel">
          Device: <span>{ble.connectionStatus}</span>
          <br />
          Bluetooth: <span>{ble.deviceName}</span>
        </div>
        <div className="menu-item" onClick={() => navigate('/home')}>{t('home')}</div>
        <div className="menu-item" onClick={() => navigate('/menu')}>Timelines</div>
        <div className="menu-item active" onClick={() => navigate('/settings')}>{t('settings')}</div>
        <div className="menu-item" onClick={() => navigate('/account')}>{t('account')}</div>
        <div className="user-panel">
          <div className="avatar-circle">{user?.username?.charAt(0).toUpperCase() || 'U'}</div>
          <div className="username">{user?.username || t('user')}</div>
          <div className="logout-link" onClick={async () => { await logout(); navigate('/login'); }}>{t('logout')}</div>
        </div>
      </div>
    <div className="settings-container main-content">
      <div className="settings-header">
        <h1>{t('settings')}</h1>
        <p className="subtitle">{t('configurePreferences')}</p>
      </div>

      {loading ? (
        <div className="settings-grid">
          <div className="settings-card">
            <h3>{t('loading')}</h3>
            <p className="subtext">{t('configurePreferences')}</p>
          </div>
        </div>
      ) : (
      <div className="settings-grid">
        <div className="settings-card">
          <h3>{t('deviceSettings')}</h3>

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

      </div>
      )}

      <div className="settings-actions">
        <button className="btn btn-secondary" onClick={() => navigate('/home')}>
          {t('cancel')}
        </button>
        <button className="btn btn-primary" onClick={handleSave}>
          {t('save')}
        </button>
      </div>
    </div>
    </div>
  );
};

export default SettingsPage;