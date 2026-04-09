// frontend/src/components/screens/Dashboard.tsx
// UPDATED: Added responsive hamburger menu
import React, { useState, useEffect } from 'react';
import './Dashboard.css';

import DeviceConnect from './DeviceConnect';
import MenuPage from './MenuPage';
import EventLogPage from './EventLogPage';
import SettingsPage from './SettingsPage';
import AccountPage from './AccountPage';

interface User {
  id: number;
  username: string;
  email: string;
  name: string;
  role: string;
}

interface DashboardProps {
  onLogout: () => void;
  user: any;
}

const Dashboard: React.FC<DashboardProps> = ({ onLogout, user }) => {
  const [particles, setParticles] = useState<Array<{x: number, y: number, size: number}>>([]);
  const [activePage, setActivePage] = useState('menu');
  const [sidebarOpen, setSidebarOpen] = useState(false); // NEW: state for mobile sidebar

  useEffect(() => {
    const particlesArray = [];
    for (let i = 0; i < 30; i++) {
      particlesArray.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1
      });
    }
    setParticles(particlesArray);
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case 'device-connect':
        return <DeviceConnect onBack={() => setActivePage('menu')} />;
      case 'events':
        return <EventLogPage onBack={() => setActivePage('menu')} />;
      case 'settings':
        return <SettingsPage onBack={() => setActivePage('menu')} />;
      case 'account':
        return <AccountPage onBack={() => setActivePage('menu')} user={user} onLogout={onLogout} />;
      default:
        return <MenuPage onNavigate={setActivePage} />;
    }
  };

  // NEW: Close sidebar when navigating (for mobile)
  const handleNavigate = (page: string) => {
    setActivePage(page);
    setSidebarOpen(false);
  };

  return (
    <div className="dashboard-container">
      {/* NEW: Hamburger button for mobile */}
      <button 
        className="menu-toggle" 
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        ☰
      </button>

      <div className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">EchoLog</div>
          <p className="sidebar-subtitle">Professional Audio Logging</p>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar" style={{ backgroundColor: user?.avatarColor || '#1a7199' }}>
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="user-info">
            <div className="user-name">{user?.name || 'User'}</div>
            <div className="user-role">{user?.role || 'Administrator'}</div>
          </div>
        </div>

        <div className="sidebar-nav">
          <button 
            className={`nav-item ${activePage === 'menu' ? 'active' : ''}`}
            onClick={() => handleNavigate('menu')}
          >
            <span className="nav-icon">🏠</span>
            <span className="nav-text">Main Menu</span>
          </button>
          
          <button 
            className={`nav-item ${activePage === 'device-connect' ? 'active' : ''}`}
            onClick={() => handleNavigate('device-connect')}
          >
            <span className="nav-icon">🔗</span>
            <span className="nav-text">Device Connect</span>
          </button>
          
          <button 
            className={`nav-item ${activePage === 'events' ? 'active' : ''}`}
            onClick={() => handleNavigate('events')}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-text">Event Log</span>
          </button>
          
          <button 
            className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
            onClick={() => handleNavigate('settings')}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-text">Settings</span>
          </button>
          
          <button 
            className={`nav-item ${activePage === 'account' ? 'active' : ''}`}
            onClick={() => handleNavigate('account')}
          >
            <span className="nav-icon">👤</span>
            <span className="nav-text">Account</span>
          </button>
        </div>

        <div className="sidebar-footer">
          <button className="logout-button" onClick={onLogout}>
            <span className="logout-icon">🚪</span>
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-main">
        <div className="dashboard-header">
          <h1 className="dashboard-title">
            {activePage === 'menu' && 'EchoLog Dashboard'}
            {activePage === 'device-connect' && 'Device Connection'}
            {activePage === 'events' && 'Event Log'}
            {activePage === 'settings' && 'Settings'}
            {activePage === 'account' && 'Account Management'}
          </h1>
          <p className="dashboard-subtitle">
            {activePage === 'menu' && 'Welcome to your audio logging dashboard'}
            {activePage === 'device-connect' && 'Connect and manage your EchoLog devices'}
            {activePage === 'events' && 'View and manage recorded audio events'}
            {activePage === 'settings' && 'Configure system settings and preferences'}
            {activePage === 'account' && 'Manage your account and security settings'}
          </p>
        </div>

        <div className="dashboard-content">
          {renderPage()}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;