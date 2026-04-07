// Shows loading animation when app starts
import React from 'react';
import './SplashScreen.css';

const SplashScreen = () => {
  return (
    <div className="splash-screen">
      <div className="splash-content">
        {/* Animated logo */}
        <div className="logo-container">
          <div className="logo-circle">
            <div className="logo-inner"></div>
          </div>
          <h1 className="logo-text">EchoLog</h1>
        </div>
        
        {/* Loading animation */}
        <div className="loading-spinner">
          <div className="spinner-circle"></div>
          <div className="spinner-text">Loading...</div>
        </div>
        
        {/* Version info */}
        <div className="version-info">
          <p>Version 2.0.0</p>
          <p className="subtext">Professional Audio Logging System</p>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;