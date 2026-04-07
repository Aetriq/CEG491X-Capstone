// CEG491X-Capstone/webapp/Frontend/src/pages/AccountPage.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next'; // NEW: i18n
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import './AccountPage.css';
import './Home.css';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useBle } from '../contexts/BleConnectionContext';

const API_URL = '/api';

function getPasswordStrength(password) {
  if (!password) {
    return { score: 0, label: 'None', className: 'none', width: 0 };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { score, label: 'Weak', className: 'weak', width: 35 };
  if (score <= 4) return { score, label: 'Medium', className: 'medium', width: 70 };
  return { score, label: 'Strong', className: 'strong', width: 100 };
}

const AccountPage = () => {
  const { user, logout } = useAuth();
  const ble = useBle();
  const navigate = useNavigate();
  const { t } = useTranslation(); // NEW: i18n
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [saving, setSaving] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const passwordStrength = getPasswordStrength(formData.newPassword);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/user/me`);
        if (res.data && res.data.user) {
          setFormData(prev => ({
            ...prev,
            username: res.data.user.username,
            email: res.data.user.email
          }));
        }
      } catch (err) {
        console.error('Error loading account:', err);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      alert(t('passwordsDoNotMatch'));
      return;
    }
    setSaving(true);
    try {
      await axios.put(`${API_URL}/user/me`, {
        username: formData.username,
        email: formData.email,
        currentPassword: formData.currentPassword || undefined,
        newPassword: formData.newPassword || undefined
      });
      alert(t('accountUpdated'));
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));
    } catch (err) {
      console.error('Error updating account:', err);
      alert(t('updateFailed') + ': ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
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
        <div className="menu-item" onClick={() => navigate('/settings')}>{t('settings')}</div>
        <div className="menu-item active" onClick={() => navigate('/account')}>{t('account')}</div>
        <div className="user-panel">
          <div className="avatar-circle">{user?.username?.charAt(0).toUpperCase() || 'U'}</div>
          <div className="username">{user?.username || t('user')}</div>
          <div className="logout-link" onClick={handleLogout}>{t('logout')}</div>
        </div>
      </div>

      <div className="main-content account-container">
      <div className="account-header">
        <h1>{t('accountManagement')}</h1>
        <p className="subtitle">{t('manageProfile')}</p>
      </div>

      <div className="account-grid">
        <div className="account-card">
          <h3>{t('profileInfo')}</h3>

          <div className="profile-header">
            <div className="avatar-large">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="profile-info">
              <h4>{user?.name || user?.username || t('user')}</h4>
              <p>{user?.role || t('user')}</p>
            </div>
          </div>

          <div className="form-group">
            <label>{t('username')}</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>{t('email')}</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
        </div>

        <div className="account-card">
          <h3>{t('security')}</h3>

          <div className="form-group">
            <label>{t('currentPassword')}</label>
            <div className="password-input-wrapper">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={formData.currentPassword}
                onChange={(e) =>
                  setFormData({ ...formData, currentPassword: e.target.value })
                }
                placeholder={t('enterCurrentPassword')}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowCurrentPassword((v) => !v)}
                aria-label={showCurrentPassword ? t('hidePassword') : t('showPassword')}
              >
                {showCurrentPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>{t('newPassword')}</label>
            <div className="password-input-wrapper">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={formData.newPassword}
                onChange={(e) =>
                  setFormData({ ...formData, newPassword: e.target.value })
                }
                placeholder={t('enterNewPassword')}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowNewPassword((v) => !v)}
                aria-label={showNewPassword ? t('hidePassword') : t('showPassword')}
              >
                {showNewPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>{t('confirmNewPassword')}</label>
            <div className="password-input-wrapper">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData({ ...formData, confirmPassword: e.target.value })
                }
                placeholder={t('confirmNewPassword')}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? t('hidePassword') : t('showPassword')}
              >
                {showConfirmPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
              </button>
            </div>
          </div>

          <div className="password-strength">
            <div className="strength-label">{t('passwordStrength')}:</div>
            <div className="strength-bar">
              <div
                className={`strength-fill ${passwordStrength.className}`}
                style={{ width: `${passwordStrength.width}%` }}
              ></div>
            </div>
            <div className={`strength-text ${passwordStrength.className}`}>
              {passwordStrength.className === 'none'
                ? ' '
                : passwordStrength.className === 'weak'
                  ? t('weak')
                  : passwordStrength.className === 'medium'
                    ? 'Medium'
                    : 'Strong'}
            </div>
          </div>
        </div>

      </div>

      <div className="account-actions-footer">
        <button className="btn btn-secondary" onClick={() => navigate('/home')}>
          {t('cancel')}
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </button>
      </div>
      </div>
    </div>
  );
};

export default AccountPage;