// CEG491X-Capstone/echolog-webapp/frontend/src/App.tsx
// UPDATED: Added all routes from merged code, including Home, Menu, Register, TimelineView
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SplashScreen from './components/common/SplashScreen';
import LoginScreen from './components/screens/LoginScreen';
import Dashboard from './components/screens/Dashboard';
import Home from './components/screens/Home';                // NEW
import Menu from './components/screens/Menu';                 // NEW (friend's Menu)
import TimelineView from './components/screens/TimelineView'; // NEW
import Register from './components/screens/Register';         // NEW
import { AuthProvider, useAuth } from './contexts/AuthContext'; // NEW
import './styles/globals.css';

interface User {
  id: number;
  username: string;
  email: string;
  name: string;
  role: string;
}

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsLoggedIn(true);
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (error) {
          console.error('Error parsing user data from localStorage:', error);
          localStorage.removeItem('user');
        }
      }
    }
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

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
      <div className="app-wrapper">
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