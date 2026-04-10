// webapp/frontend/src/contexts/AuthContext.jsx

import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { getApiUrl } from '../utils/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const USER_STORAGE_KEY = 'user';

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
      const cachedUser = localStorage.getItem(USER_STORAGE_KEY);
      if (cachedUser) {
        try {
          setUser(JSON.parse(cachedUser));
        } catch (_) {}
      }
      // Set auth header immediately to avoid race conditions where other pages
      // fire API requests before verifyToken() finishes.
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      verifyToken(token);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async (token) => {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Render free/low tier can cold-start; allow longer verify timeout.
        const response = await axios.get(getApiUrl('/auth/verify'), {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 60000
        });
        const verifiedUser = response.data?.user;
        if (!verifiedUser) {
          localStorage.removeItem('token');
          localStorage.removeItem(USER_STORAGE_KEY);
          delete axios.defaults.headers.common['Authorization'];
          setLoading(false);
          return;
        }
        setUser(verifiedUser);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(verifiedUser));
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setLoading(false);
        return;
      } catch (error) {
        const status = error.response?.status;
        if (status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem(USER_STORAGE_KEY);
          delete axios.defaults.headers.common['Authorization'];
          setUser(null);
          setLoading(false);
          return;
        }
        const retryable =
          !error.response ||
          status === 502 ||
          status === 503 ||
          status === 504;
        if (retryable && attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2500 * (attempt + 1)));
          continue;
        }
        break;
      }
    }
    setLoading(false);
  };

  const login = async (username, password) => {
    try {
      const response = await axios.post(getApiUrl('/auth/login'), {
        username,
        password
      });
      const data = response.data;
      if (!data || typeof data !== 'object' || !data.token) {
        return {
          success: false,
          error:
            'Unexpected response from server. If you are on the deployed site, set VITE_API_URL to your backend URL and redeploy.'
        };
      }
      const { token, user: loggedInUser } = data;
      localStorage.setItem('token', token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(loggedInUser));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(loggedInUser);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      };
    }
  };

  const register = async (username, email, password) => {
    try {
      const response = await axios.post(getApiUrl('/auth/register'), {
        username,
        email,
        password
      });
      const data = response.data;
      if (!data || typeof data !== 'object' || !data.token) {
        return {
          success: false,
          error:
            'Unexpected response from server. If you are on the deployed site, set VITE_API_URL to your backend URL and redeploy.'
        };
      }
      const { token, user: registeredUser } = data;
      localStorage.setItem('token', token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(registeredUser));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(registeredUser);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Registration failed'
      };
    }
  };

  const logout = async () => {
    try {
      await axios.post(getApiUrl('/auth/logout'));
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem(USER_STORAGE_KEY);
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
