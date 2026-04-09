// CEG491X-Capstone/webapp/Frontend/src/pages/Register.jsx

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next'; // NEW: i18n
import './Login.css';

function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { t } = useTranslation(); // NEW: i18n
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      return;
    }

    if (password.length < 6) {
      setError(t('passwordMinLength'));
      return;
    }

    setLoading(true);

    const result = await register(username, email, password);
    setLoading(false);

    if (result.success) {
      navigate('/home');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="login-container">
      {/* Video background (same as Login) */}
      <video className="video-background" autoPlay muted loop playsInline>
        <source src="/Boat1.mp4" type="video/mp4" />
        {t('videoNotSupported')}
      </video>
      <div className="video-overlay"></div>
      <div className="floating-elements">
        <div className="floating-element audio-wave"></div>
        <div className="floating-element bluetooth"></div>
        <div className="floating-element device"></div>
      </div>
      <div className="login-card">
        <div className="login-left">
          <div className="login-glass-panel">
            <div className="login-title">{t('appName')}</div>
            <div className="login-sub">{t('createAccount')}</div>
            <form className="login-form" onSubmit={handleSubmit}>
              <div className="login-group">
                <label className="login-label" htmlFor="username">{t('username')}</label>
                <input
                  type="text"
                  id="username"
                  className="login-input"
                  placeholder={t('username')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                />
              </div>
              <div className="login-group">
                <label className="login-label" htmlFor="email">{t('email')}</label>
                <input
                  type="email"
                  id="email"
                  className="login-input"
                  placeholder={t('email')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="login-group">
                <label className="login-label" htmlFor="password">{t('password')}</label>
                <input
                  type="password"
                  id="password"
                  className="login-input"
                  placeholder={t('password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="login-group">
                <label className="login-label" htmlFor="confirmPassword">{t('confirmPassword')}</label>
                <input
                  type="password"
                  id="confirmPassword"
                  className="login-input"
                  placeholder={t('confirmPassword')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <div className="login-links">
                <span></span>
                <Link to="/login">{t('alreadyHaveAccount')}</Link>
              </div>
              {error && <div className="error-msg">{error}</div>}
              <button type="submit" className="btn-login" disabled={loading}>
                {loading ? t('processing') : t('registerNow')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;