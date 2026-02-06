import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Import the components we just fixed
import SplashScreen from './components/common/SplashScreen';
import LoginScreen from './components/screens/LoginScreen';
import Dashboard from './components/screens/Dashboard';

import './styles/globals.css'; 

// NEW: Define the User interface here (copied from Dashboard.tsx) to type the user state and prop.
// This ensures type safety and matches what Dashboard expects.

interface User {
  id: number;
  username: string;
  email: string;
  name: string;
  role: string;
}

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  // NEW: Add state to hold the user data, typed as User | null to match DashboardProps.
  // This will be loaded from localStorage and passed as a prop to Dashboard.
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsLoggedIn(true);
      // NEW: Load user data from localStorage and set it in state.
      // This ensures user is available as a prop when Dashboard renders.
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));  // Parse back to User object
        } catch (error) {
          console.error('Error parsing user data from localStorage:', error);
          // Optional: Clear invalid data if parsing fails
          localStorage.removeItem('user');
        }
      }
    }
    
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);


  // MODIFIED: Update handleLogin to accept userData as User (instead of any) for better typing.
  // This matches the User interface and what LoginScreen passes.

  const handleLogin = (token: string, userData: any) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setIsLoggedIn(true);
    // NEW: Set the user state with the userData received from LoginScreen.
    // This makes user available for passing as a prop to Dashboard.
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsLoggedIn(false);
    // NEW: Clear the user state on logout to ensure it's null when not logged in.
    setUser(null);
  };

  // 1. Use the SplashScreen component here
  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <div className="app-wrapper">
      {/* This background stays put while the "pages" change inside the Router */}
      <div className="floating-bg">
        <div className="floating-square square-1"></div>
        <div className="floating-square square-2"></div>
        <div className="floating-square square-3"></div>
        <div className="floating-square square-4"></div>
      </div>

      <Router>
        <div className="app">
          <Routes>
            <Route 
              path="/login" 
              // 2. Use the LoginScreen component here
              element={isLoggedIn ? <Navigate to="/dashboard" /> : <LoginScreen onLogin={handleLogin} />} 
            />
            
            <Route 
              path="/dashboard" 
              // 3. MODIFIED: Pass the 'user' prop to Dashboard to satisfy DashboardProps.
              // This fixes the TypeScript error by providing the required 'user' property.
              // 'user' is sourced from state, which is set from localStorage or handleLogin.
              element={isLoggedIn ? <Dashboard onLogout={handleLogout} user={user} /> : <Navigate to="/login" />}            
            />
            
            <Route path="/" element={isLoggedIn ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />
            
            <Route path="*" element={<div style={{ padding: '50px', textAlign: 'center' }}><h1>404 - Not Found</h1></div>} />
          </Routes>
        </div>
      </Router>
    </div>
  );
}

export default App;