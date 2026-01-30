import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    const result = await register(username, email, password);
    setLoading(false);

    if (result.success) {
      navigate('/menu');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="login-glass-panel">
          <div className="login-title">EchoLog</div>
          <div className="login-sub">Create Account</div>
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-group">
              <label className="login-label" htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                className="login-input"
                placeholder="Enter Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
              />
            </div>
            <div className="login-group">
              <label className="login-label" htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                className="login-input"
                placeholder="Enter Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="login-group">
              <label className="login-label" htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                className="login-input"
                placeholder="Enter Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="login-group">
              <label className="login-label" htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                className="login-input"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <div className="login-links">
              <span></span>
              <Link to="/login">Already have an account? Login</Link>
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
      <div className="login-right"></div>
    </div>
  );
}

export default Register;
