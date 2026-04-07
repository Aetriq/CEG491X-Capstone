// CEG491X-Capstone/webapp/Frontend/src/pages/Login.jsx

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next'; // NEW
import { FaEye, FaEyeSlash } from 'react-icons/fa'; // NEW (if you want eye icons)
import './Login.css';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false); // NEW
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation(); // NEW

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);
    setLoading(false);

    if (result.success) {
      navigate('/home');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="login-container">
      {/* Video Background */}
      <video className="video-background" autoPlay muted loop playsInline>
        <source src="/Boat1.mp4" type="video/mp4" />
        {t('videoNotSupported') || 'Your browser does not support the video tag.'}
      </video>
      <div className="video-overlay"></div>

      {/* Floating elements (optional) */}
      <div className="floating-elements">
        <div className="floating-element audio-wave"></div>
        <div className="floating-element bluetooth"></div>
        <div className="floating-element device"></div>
      </div>

      {/* Login Card */}
      <div className="login-card">
        <div className="login-left">
          <div className="login-glass-panel">
            <div className="login-title">{t('appName')}</div>
            <div className="login-sub">{t('welcomeBack')}</div>
            <form className="login-form" onSubmit={handleSubmit}>
              <div className="login-group">
                <label className="login-label" htmlFor="username">
                  {t('username')}
                </label>
                <input
                  type="text"
                  id="username"
                  className="login-input"
                  placeholder={t('username')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="login-group">
                <label className="login-label" htmlFor="password">
                  {t('password')}
                </label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    className="login-input"
                    placeholder={t('password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                  >
                    {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
                  </button>
                </div>
              </div>
              <div className="login-links">
                <Link to="/register">{t('signUpHere')}</Link>
              </div>
              {error && <div className="error-msg">{error}</div>}
              <button type="submit" className="btn-login" disabled={loading}>
                {loading ? t('processing') : t('login')}
              </button>
            </form>
          </div>
        </div>
        {/* The right side can be removed or left empty; the video covers the whole container */}
      </div>
    </div>
  );
}

export default Login;