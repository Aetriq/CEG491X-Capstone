// echolog-webapp/frontend/src/components/screens/Register.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './LoginScreen.css'; // reuse login styles

// NEW: Password strength evaluation (same as in Settings)
const getPasswordStrength = (password: string): { score: number; label: string } => {
  if (!password) return { score: 0, label: 'None' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[score] };
};

const Register: React.FC = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: 'None' });
  const navigate = useNavigate();
  const { register } = useAuth();

  // NEW: Update password strength when password changes
  useEffect(() => {
    setPasswordStrength(getPasswordStrength(password));
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // NEW: Frontend validations
    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const result = await register(username, email, password);
    if (result.success) {
      alert('Registration successful! Please log in.');
      navigate('/login');
    } else {
      setError(result.error || 'Registration failed');
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo-section">
          <h1 className="logo-text">EchoLog</h1>
          <p className="logo-tagline">Create a new account</p>
        </div>
        <div className="form-section">
          <h2>Register</h2>
          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="login-input"
                required
                aria-label="Username" // NEW: accessibility
              />
            </div>
            <div className="input-group">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="login-input"
                required
                aria-label="Email"
              />
            </div>
            <div className="input-group">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="login-input"
                required
                aria-label="Password"
              />
              {/* NEW: Password strength indicator */}
              <div className="password-strength register-strength">
                <div className="strength-bar">
                  <div 
                    className="strength-fill" 
                    style={{ 
                      width: `${passwordStrength.score * 25}%`,
                      backgroundColor: 
                        passwordStrength.score <= 1 ? '#dc3545' :
                        passwordStrength.score === 2 ? '#ffc107' :
                        passwordStrength.score === 3 ? '#17a2b8' : '#28a745'
                    }}
                  ></div>
                </div>
                <span className="strength-label">{passwordStrength.label}</span>
              </div>
            </div>
            <div className="input-group">
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className="login-input"
                required
                aria-label="Confirm Password"
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Registering...' : 'Register'}
            </button>
            <div className="register-link">
              Already have an account? <Link to="/login">Sign in</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Register;