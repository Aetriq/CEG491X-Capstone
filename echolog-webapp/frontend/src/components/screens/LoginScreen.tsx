// CEG491X-Capstone/echolog-webapp/frontend/src/components/screens/LoginScreen.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next'; // NEW: i18n
import './LoginScreen.css';
import { FaEye, FaEyeSlash } from 'react-icons/fa'; // add at top of file


interface LoginProps {
  onLogin: (token: string, user: any) => void; // kept for backward compatibility
}

const LoginScreen: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [particles, setParticles] = useState<Array<{x: number, y: number, size: number, speed: number}>>([]);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useTranslation(); // NEW: translation hook

  useEffect(() => {
    const particlesArray = [];
    for (let i = 0; i < 20; i++) {
      particlesArray.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 4 + 2,
        speed: Math.random() * 0.5 + 0.2
      });
    }
    setParticles(particlesArray);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);
    if (result.success) {
      const user = { username };
      onLogin('mock-token', user);
      navigate('/dashboard');
    } else {
      setError(t('invalidCredentials')); // UPDATED: use translation
    }
    setLoading(false);
  };

  const handleDemoLogin = () => {
    setUsername('admin');
    setPassword('admin');
    setIsHovering(true);
    setTimeout(() => setIsHovering(false), 200);
  };

  return (
    <div className="login-container">
      {/* Animated background particles */}
      <div className="particles-background">
        {particles.map((particle, index) => (
          <div
            key={index}
            className="particle"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: particle.size,
              height: particle.size,
              animationDelay: `${index * 0.1}s`,
              animationDuration: `${3 + particle.speed}s`
            }}
          />
        ))}
      </div>

      <div className="login-card">
        {/* Logo Section */}
        <div className="logo-section">
          <div className="logo-container">
            <div className="logo-circle">
              <div className="logo-inner">
                <div className="logo-wave"></div>
                <div className="logo-wave delay-1"></div>
                <div className="logo-wave delay-2"></div>
              </div>
            </div>
            <h1 className="logo-text">{t('appName')}</h1> {/* UPDATED */}
            <p className="logo-tagline">{t('professionalAudio') || 'Professional Audio Logging System'}</p>
          </div>
        </div>

        {/* Form Section */}
        <div className="form-section">
          <h2>{t('welcomeBack')}</h2> {/* UPDATED */}
          <p className="form-subtitle">{t('signInToAccount')}</p> {/* UPDATED */}
          
          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <input
                type="text"
                placeholder={t('username')} // UPDATED
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="login-input"
                required
                aria-label={t('username')} // NEW: accessibility
              />
            </div>

            <div className="input-group">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={t('password')} // UPDATED
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="login-input"
                required
                aria-label={t('password')} // NEW: accessibility
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              >
                {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
              </button>
            </div>

            <div className="form-options">
              <label className="checkbox-container">
                <input type="checkbox" aria-label={t('rememberMe')} />
                <span className="checkmark"></span>
                {t('rememberMe')}
              </label>
              <a href="#" className="forgot-link" aria-label={t('forgotPassword')}>{t('forgotPassword')}</a>
            </div>

            {error && (
              <div className="error-message" role="alert"> {/* NEW: role alert */}
                {error}
              </div>
            )}

            <button
              type="submit"
              className={`login-button ${loading ? 'loading' : ''}`}
              disabled={loading || !username || !password}
              aria-label={t('login')}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  {t('processing')}
                </>
              ) : (
                t('login')
              )}
            </button>

            <div className="demo-section">
              <div className="demo-divider">
                <span>{t('quickAccess') || 'Quick Access'}</span>
              </div>
              <button
                type="button"
                className={`demo-button ${isHovering ? 'hovering' : ''}`}
                onClick={handleDemoLogin}
                disabled={loading}
                aria-label={t('demoAccount') || 'Use Demo Account (admin/admin)'}
              >
                {t('demoAccount') || 'Use Demo Account (admin/admin)'}
              </button>
            </div>

            <div className="register-link">
              {t('noAccount')} <Link to="/register" aria-label={t('signUpHere')}>{t('signUpHere')}</Link>
            </div>
          </form>

          <div className="version-info">
            <p>{t('appName')} Web v2.1.0</p>
            <p className="copyright">© {new Date().getFullYear()} {t('appName')} Systems</p>
          </div>
        </div>

        {/* Background Video Section */}
        <div className="background-section">
          <video className="video-background" autoPlay muted loop playsInline>
            <source src="/assets/BOAT1.mp4" type="video/mp4" />
            {t('videoNotSupported') || 'Your browser does not support the video tag.'}
          </video>
          <div className="video-overlay"></div>
          <div className="floating-elements">
            <div className="floating-element audio-wave"></div>
            <div className="floating-element bluetooth"></div>
            <div className="floating-element device"></div>
          </div>
          <div className="background-content">
            <div className="background-logo">
              <div className="logo-circle-small">
                <div className="logo-wave-small"></div>
              </div>
              <h2>{t('appName')}</h2>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;