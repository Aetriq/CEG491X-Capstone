import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);
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
          <div className="login-sub">Login Now.</div>
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
              />
            </div>
            <div className="login-links">
              <a href="#">Forgot Password?</a>
              <Link to="/register">Register Here</Link>
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
      <div className="login-right"></div>
    </div>
  );
}

export default Login;
