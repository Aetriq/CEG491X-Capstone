import React, { useState, useEffect } from 'react';
import './AccountPage.css';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';

const API_URL = '/api';

const AccountPage = ({ onBack }) => {
  const { user, logout } = useAuth();
  const { showAlert } = useDialog();
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
      await showAlert('New passwords do not match!', 'Account');
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
      await showAlert('Account updated successfully!', 'Account');
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));
    } catch (err) {
      console.error('Error updating account:', err);
      await showAlert(
        'Failed to update account: ' + (err.response?.data?.error || err.message),
        'Account'
      );
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
          ← Back
        </button>
        <h1>Account Management</h1>
        <p className="subtitle">Manage your profile and security settings</p>
      </div>

      <div className="account-grid">
        <div className="account-card">
          <h3>Profile Information</h3>

          <div className="profile-header">
            <div className="avatar-large">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="profile-info">
              <h4>{user?.name || user?.username || 'User'}</h4>
              <p>{user?.role || 'User'}</p>
              <button
                className="btn-text"
                type="button"
                onClick={() => showAlert('Avatar change not implemented yet.', 'Account')}
              >
                Change Avatar
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
        </div>

        <div className="account-card">
          <h3>Security</h3>

          <div className="form-group">
            <label>Current Password</label>
            <input
              type="password"
              value={formData.currentPassword}
              onChange={(e) =>
                setFormData({ ...formData, currentPassword: e.target.value })
              }
              placeholder="Enter current password"
            />
          </div>

          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={formData.newPassword}
              onChange={(e) =>
                setFormData({ ...formData, newPassword: e.target.value })
              }
              placeholder="Enter new password"
            />
          </div>

          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData({ ...formData, confirmPassword: e.target.value })
              }
              placeholder="Confirm new password"
            />
          </div>

          <div className="password-strength">
            <div className="strength-label">Password Strength:</div>
            <div className="strength-bar">
              <div className="strength-fill weak"></div>
            </div>
            <div className="strength-text">Weak</div>
          </div>
        </div>

        <div className="account-card">
          <h3>Account Actions</h3>

          <div className="account-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => showAlert('Export data not implemented yet.', 'Account')}
            >
              Export My Data
            </button>

            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => showAlert('Usage report not implemented yet.', 'Account')}
            >
              Download Usage Report
            </button>

            <button
              className="btn btn-warning"
              type="button"
              onClick={() => showAlert('Clear cache not implemented yet.', 'Account')}
            >
              Clear App Cache
            </button>

            <button
              className="btn btn-danger"
              type="button"
              onClick={handleLogoutAll}
            >
              Logout from All Devices
            </button>

            <div className="danger-zone">
              <h4>Danger Zone</h4>
              <p className="danger-text">
                Deleting your account will remove all your data and cannot be undone.
              </p>
              <button
                className="btn btn-danger-outline"
                type="button"
                onClick={() => showAlert('Delete account not implemented yet.', 'Account')}
              >
                Delete My Account
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="account-actions-footer">
        <button className="btn btn-secondary" onClick={onBack}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default AccountPage;

