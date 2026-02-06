// frontend/src/components/screens/LoginScreen.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './LoginScreen.css';

interface LoginProps {
  onLogin: (token: string, user: any) => void;
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

  // Create floating particles effect
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

    try {
      // Mock login for now
      if (username === 'admin' && password === 'admin') {
        const mockUser = {
          id: 1,
          username: 'admin',
          email: 'admin@echolog.com',
          name: 'System Administrator',
          role: 'admin',
          avatarColor: '#1a7199'
        };
        
        const mockToken = `jwt-token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 800));
        
        onLogin(mockToken, mockUser);
        navigate('/dashboard');
      } else {
        setError('Invalid credentials. Try admin/admin');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    setUsername('admin');
    setPassword('admin');
    // Trigger visual feedback
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
            <h1 className="logo-text">EchoLog</h1>
            <p className="logo-tagline">Professional Audio Logging System</p>
          </div>
        </div>

        {/* Form Section */}
        <div className="form-section">
          <h2>Welcome Back</h2>
          <p className="form-subtitle">Sign in to your account</p>
          
          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <div className="input-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="#1a7199" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="#1a7199" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="login-input"
              />
            </div>

            <div className="input-group">
              <div className="input-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="11" width="18" height="11" rx="2" stroke="#1a7199" strokeWidth="2"/>
                  <path d="M7 11V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V11" stroke="#1a7199" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="login-input"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>

            <div className="form-options">
              <label className="checkbox-container">
                <input type="checkbox" />
                <span className="checkmark"></span>
                Remember me
              </label>
              <a href="#" className="forgot-link">Forgot password?</a>
            </div>

            {error && (
              <div className="error-message">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="#dc3545" strokeWidth="2"/>
                  <path d="M12 8V12" stroke="#dc3545" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M12 16H12.01" stroke="#dc3545" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              className={`login-button ${loading ? 'loading' : ''}`}
              disabled={loading || !username || !password}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>

            <div className="demo-section">
              <div className="demo-divider">
                <span>Quick Access</span>
              </div>
              <button
                type="button"
                className={`demo-button ${isHovering ? 'hovering' : ''}`}
                onClick={handleDemoLogin}
                disabled={loading}
              >
                <span className="demo-icon">🚀</span>
                Use Demo Account (admin/admin)
              </button>
            </div>

            <div className="register-link">
              Don't have an account? <a href="#">Sign up here</a>
            </div>
          </form>

          <div className="version-info">
            <p>EchoLog Web v2.1.0</p>
            <p className="copyright">© {new Date().getFullYear()} EchoLog Systems</p>
          </div>
        </div>

        {/* UPDATED: Background Video Section */}
        <div className="background-section">
          {/* Video Background - Replace with your video path */}
          <video className="video-background" autoPlay muted loop playsInline>
            <source src="/assets/BOAT1.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          
          <div className="video-overlay"></div>
          
          <div className="floating-elements">
            <div className="floating-element audio-wave"></div>
            <div className="floating-element bluetooth"></div>
            <div className="floating-element device"></div>
          </div>
          
          <div className="background-content">
            {/* Added logo to video section */}
            <div className="background-logo">
              <div className="logo-circle-small">
                <div className="logo-wave-small"></div>
              </div>
              <h2>EchoLog</h2>
            </div>
            
            <h3>Professional Audio Logging</h3>
            <ul className="feature-list">
              <li>🔒 Military-grade encryption</li>
              <li>⚡ Real-time device sync</li>
              <li>📊 Advanced analytics</li>
              <li>🌐 Cloud backup</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;