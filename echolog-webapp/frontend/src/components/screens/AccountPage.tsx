// frontend/src/components/screens/AccountPage.tsx
import React, { useState } from 'react';
import './AccountPage.css';

interface AccountPageProps {
  onBack: () => void;
  user: any;
  onLogout: () => void;
}

const AccountPage: React.FC<AccountPageProps> = ({ onBack, user, onLogout }) => {
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handleSave = () => {
    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      alert('New passwords do not match!');
      return;
    }
    console.log('Updating account:', formData);
    alert('Account updated successfully!');
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
              <h4>{user?.name || 'User'}</h4>
              <p>{user?.role || 'Administrator'}</p>
              <button className="btn-text">Change Avatar</button>
            </div>
          </div>

          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
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
              onChange={(e) => setFormData({...formData, currentPassword: e.target.value})}
              placeholder="Enter current password"
            />
          </div>

          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={formData.newPassword}
              onChange={(e) => setFormData({...formData, newPassword: e.target.value})}
              placeholder="Enter new password"
            />
          </div>

          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
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
            <button className="btn btn-secondary">
              Export My Data
            </button>
            
            <button className="btn btn-secondary">
              Download Usage Report
            </button>
            
            <button className="btn btn-warning">
              Clear App Cache
            </button>
            
            <button className="btn btn-danger" onClick={onLogout}>
              Logout from All Devices
            </button>
            
            <div className="danger-zone">
              <h4>Danger Zone</h4>
              <p className="danger-text">
                Deleting your account will remove all your data and cannot be undone.
              </p>
              <button className="btn btn-danger-outline">
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
        <button className="btn btn-primary" onClick={handleSave}>
          Save Changes
        </button>
      </div>
    </div>
  );
};

export default AccountPage;