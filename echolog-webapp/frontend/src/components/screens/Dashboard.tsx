// frontend/src/components/screens/Dashboard.tsx
// UPDATED: Added particle effects to Dashboard with useState and useEffect
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
  // UPDATED: Added particle state for background effects
  const [particles, setParticles] = useState<Array<{x: number, y: number, size: number}>>([]);
  const [activePage, setActivePage] = useState('menu');

  // UPDATED: Added useEffect to initialize particles
  useEffect(() => {
    // Create particles for background effect
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

  return (
    <div className="dashboard-container">
      {/* UPDATED: Added dashboard background with particles */}
      <div className="dashboard-background">
        {particles.map((particle, index) => (
          <div
            key={index}
            className="dashboard-particle"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: particle.size,
              height: particle.size,
              animationDelay: `${index * 0.1}s`
            }}
          />
        ))}
      </div>
      
      <div className="dashboard-sidebar">
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
            onClick={() => setActivePage('menu')}
          >
            <span className="nav-icon">🏠</span>
            <span className="nav-text">Main Menu</span>
          </button>
          
          <button 
            className={`nav-item ${activePage === 'device-connect' ? 'active' : ''}`}
            onClick={() => setActivePage('device-connect')}
          >
            <span className="nav-icon">🔗</span>
            <span className="nav-text">Device Connect</span>
          </button>
          
          <button 
            className={`nav-item ${activePage === 'events' ? 'active' : ''}`}
            onClick={() => setActivePage('events')}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-text">Event Log</span>
          </button>
          
          <button 
            className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
            onClick={() => setActivePage('settings')}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-text">Settings</span>
          </button>
          
          <button 
            className={`nav-item ${activePage === 'account' ? 'active' : ''}`}
            onClick={() => setActivePage('account')}
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