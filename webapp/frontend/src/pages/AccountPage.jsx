// CEG491X-Capstone/webapp/Frontend/src/pages/AccountPage.jsx

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next'; // NEW: i18n
import './AccountPage.css';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API_URL = '/api';

const AccountPage = ({ onBack }) => {
  const { user, logout } = useAuth();
  const { t } = useTranslation(); // NEW: i18n
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [saving, setSaving] = useState(false);

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

  const handleLogoutAll = async () => {
    await logout();
  };

  return (
    <div className="account-container">
      <div className="account-header">
        <button className="back-btn" onClick={onBack}>
          ← {t('back')}
        </button>
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
              <button
                className="btn-text"
                type="button"
                onClick={() => alert(t('avatarChangeNotImplemented'))}
              >
                {t('changeAvatar')}
              </button>
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
            <input
              type="password"
              value={formData.currentPassword}
              onChange={(e) =>
                setFormData({ ...formData, currentPassword: e.target.value })
              }
              placeholder={t('enterCurrentPassword')}
            />
          </div>

          <div className="form-group">
            <label>{t('newPassword')}</label>
            <input
              type="password"
              value={formData.newPassword}
              onChange={(e) =>
                setFormData({ ...formData, newPassword: e.target.value })
              }
              placeholder={t('enterNewPassword')}
            />
          </div>

          <div className="form-group">
            <label>{t('confirmNewPassword')}</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData({ ...formData, confirmPassword: e.target.value })
              }
              placeholder={t('confirmNewPassword')}
            />
          </div>

          <div className="password-strength">
            <div className="strength-label">{t('passwordStrength')}:</div>
            <div className="strength-bar">
              <div className="strength-fill weak"></div>
            </div>
            <div className="strength-text">{t('weak')}</div>
          </div>
        </div>

        <div className="account-card">
          <h3>{t('accountActions')}</h3>

          <div className="account-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => alert(t('exportNotImplemented'))}
            >
              {t('exportMyData')}
            </button>

            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => alert(t('reportNotImplemented'))}
            >
              {t('downloadUsageReport')}
            </button>

            <button
              className="btn btn-warning"
              type="button"
              onClick={() => alert(t('clearCacheNotImplemented'))}
            >
              {t('clearAppCache')}
            </button>

            <button
              className="btn btn-danger"
              type="button"
              onClick={handleLogoutAll}
            >
              {t('logoutAllDevices')}
            </button>

            <div className="danger-zone">
              <h4>{t('dangerZone')}</h4>
              <p className="danger-text">
                {t('deleteAccountWarning')}
              </p>
              <button
                className="btn btn-danger-outline"
                type="button"
                onClick={() => alert(t('deleteNotImplemented'))}
              >
                {t('deleteMyAccount')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="account-actions-footer">
        <button className="btn btn-secondary" onClick={onBack}>
          {t('cancel')}
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </button>
      </div>
    </div>
  );
};

export default AccountPage;