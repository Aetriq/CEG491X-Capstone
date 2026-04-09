// webapp/Frontend/src/App.jsx

import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Menu from './pages/Menu';
import Home from './pages/Home';
import TimelineView from './pages/TimelineView';
import SettingsPage from './pages/SettingsPage';
import AccountPage from './pages/AccountPage';
import { DialogProvider } from './contexts/DialogContext';
import { BleConnectionProvider } from './contexts/BleConnectionContext';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  return user ? children : <Navigate to="/login" />;
}

function App() {
  // Apply persisted theme on initial load
  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'Dark') {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    } catch {
      // ignore
    }
  }, []);

  return (
    <AuthProvider>
      <DialogProvider>
        <BleConnectionProvider>
          <Router>
            <Routes>
              <Route path="/home" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route
                path="/menu"
                element={
                  <PrivateRoute>
                    <Menu />
                  </PrivateRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <PrivateRoute>
                    <SettingsPage onBack={() => window.history.back()} />
                  </PrivateRoute>
                }
              />
              <Route
                path="/account"
                element={
                  <PrivateRoute>
                    <AccountPage onBack={() => window.history.back()} />
                  </PrivateRoute>
                }
              />
              <Route path="/timeline/:id" element={<TimelineView />} />
              <Route path="/" element={<Navigate to="/home" />} />
            </Routes>
          </Router>
        </BleConnectionProvider>
      </DialogProvider>
    </AuthProvider>
  );
}

export default App;
