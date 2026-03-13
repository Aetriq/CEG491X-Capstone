// CEG491X-Capstone/echolog-webapp/frontend/src/App.tsx
// Main application component: sets up routing, global toast notifications, theme, and splash screen.
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast'; // NEW: import Toaster
import SplashScreen from './components/common/SplashScreen';
import LoginScreen from './components/screens/LoginScreen';
import Dashboard from './components/screens/Dashboard';
import Home from './components/screens/Home';
import Menu from './components/screens/Menu';
import TimelineView from './components/screens/TimelineView';
import Register from './components/screens/Register';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './styles/globals.css';

interface User {
  id: number;
  username: string;
  email: string;
  name: string;
  role: string;
}

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true); // controls splash screen visibility
  const [isLoggedIn, setIsLoggedIn] = useState(false); // local auth state (duplicated from AuthContext – consider refactoring)
  const [user, setUser] = useState<User | null>(null);

  // Load theme from localStorage on app start
  useEffect(() => {
    const savedSettings = localStorage.getItem('echolog_settings');
    if (savedSettings) {
      try {
        const { theme } = JSON.parse(savedSettings);
        if (theme && theme !== 'auto') {
          document.documentElement.setAttribute('data-theme', theme);
        } else if (theme === 'auto') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        }
      } catch (e) {
        console.error('Failed to apply theme', e);
      }
    }
  }, []);

  // Hide splash screen after 2 seconds
  useEffect(() => {
  const timer = setTimeout(() => setShowSplash(false), 2000);
  return () => clearTimeout(timer);
  }, []);

  // Legacy login handler – used by LoginScreen's onLogin prop
  const handleLogin = (token: string, userData: any) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setIsLoggedIn(true);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsLoggedIn(false);
    setUser(null);
  };

  if (showSplash) return <SplashScreen />;

  return (
    <AuthProvider>
      {/* Global toast notifications (react-hot-toast) */}
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#4caf50',
              secondary: '#fff',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#dc3545',
              secondary: '#fff',
            },
          },
        }}
      />
      <div className="app-wrapper">
        {/* Animated floating background squares (decorative) */}
        <div className="floating-bg">
          <div className="floating-square square-1"></div>
          <div className="floating-square square-2"></div>
          <div className="floating-square square-3"></div>
          <div className="floating-square square-4"></div>
        </div>
        <Router>
          <div className="app">
            <Routes>
              <Route path="/login" element={isLoggedIn ? <Navigate to="/home" /> : <LoginScreen onLogin={handleLogin} />} />
              <Route path="/register" element={isLoggedIn ? <Navigate to="/home" /> : <Register />} />
              <Route path="/home" element={isLoggedIn ? <Home /> : <Navigate to="/login" />} />
              <Route path="/menu" element={isLoggedIn ? <Menu /> : <Navigate to="/login" />} />
              <Route path="/timeline/:id" element={<TimelineView />} />
              <Route path="/dashboard" element={isLoggedIn ? <Dashboard onLogout={handleLogout} user={user} /> : <Navigate to="/login" />} />
              <Route path="/" element={<Navigate to="/home" />} />
              <Route path="*" element={<div style={{ padding: '50px', textAlign: 'center' }}><h1>404 - Not Found</h1></div>} />
            </Routes>
          </div>
        </Router>
      </div>
    </AuthProvider>
  );
};

export default App;