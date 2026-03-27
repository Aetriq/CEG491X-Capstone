// frontend/src/components/screens/MenuPage.tsx
import React, { useState } from 'react';
import './MenuPage.css';

interface MenuPageProps {
  onNavigate: (page: string) => void;
}

const MenuPage: React.FC<MenuPageProps> = ({ onNavigate }) => {
  const [uploadProgress, setUploadProgress] = useState({
    file: '-',
    size: '0Kb',
    elapsed: '00:00:00',
  });

  const [downloadProgress, setDownloadProgress] = useState({
    elapsed: '00:00:00',
  });

  const [comPorts] = useState(['COM3', 'COM5', 'COM9', 'COM12']);
  const [selectedPort, setSelectedPort] = useState('');
  const [btDevices] = useState(['No devices found.']);

  const handleUpload = () => {
    // Mock upload simulation
    setUploadProgress({
      file: 'sample.wav',
      size: '2.4Mb',
      elapsed: '00:00:15',
    });
  };

  const handleDownload = () => {
    // Mock download simulation
    setDownloadProgress({
      elapsed: '00:00:30',
    });
  };

  const handleRefreshPorts = () => {
    console.log('Refreshing COM ports...');
  };

  const handleScanBluetooth = () => {
    console.log('Scanning Bluetooth...');
  };

  return (
    <div className="menu-container">
      <div className="menu-header">
        <h1>EchoLog Main Menu</h1>
        <p className="subtitle">Select an operation to begin</p>
      </div>

      <div className="menu-grid">
        {/* Upload Files Card */}
        <div className="menu-card">
          <div className="menu-card-header">
            <div className="menu-icon upload-icon">⬆</div>
            <div className="menu-card-title">
              <h3>Upload Files</h3>
              <p className="card-description">Upload files to onboard storage</p>
            </div>
          </div>
          
          <div className="file-info">
            <div className="info-row">
              <span className="info-label">File:</span>
              <span className="info-value">{uploadProgress.file}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Size:</span>
              <span className="info-value">{uploadProgress.size}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Elapsed:</span>
              <span className="info-value">{uploadProgress.elapsed}</span>
            </div>
          </div>

          <div className="button-group">
            <button className="btn btn-start" onClick={handleUpload}>
              START ▶
            </button>
            <button className="btn btn-select" onClick={() => document.getElementById('file-input')?.click()}>
              SELECT FILES
            </button>
            <button className="btn btn-stop" onClick={() => setUploadProgress({ file: '-', size: '0Kb', elapsed: '00:00:00' })}>
              STOP
            </button>
          </div>
          
          <input type="file" id="file-input" style={{ display: 'none' }} />
        </div>

        {/* Download Files Card */}
        <div className="menu-card">
          <div className="menu-card-header">
            <div className="menu-icon download-icon">⬇</div>
            <div className="menu-card-title">
              <h3>Download Files</h3>
              <p className="card-description">Download device's raw files</p>
            </div>
          </div>
          
          <div className="file-info">
            <div className="info-row">
              <span className="info-label">Elapsed time:</span>
              <span className="info-value">{downloadProgress.elapsed}</span>
            </div>
          </div>

          <div className="button-group">
            <button className="btn btn-select" onClick={() => console.log('Select directory')}>
              SELECT DIRECTORY
            </button>
            <button className="btn btn-start" onClick={handleDownload}>
              DOWNLOAD
            </button>
            <button className="btn btn-stop" onClick={() => setDownloadProgress({ elapsed: '00:00:00' })}>
              STOP
            </button>
          </div>
        </div>

        {/* Connect Device Card - Full Width */}
        <div className="menu-card wide-card">
          <div className="menu-card-header">
            <div className="menu-icon device-icon">🔗</div>
            <div className="menu-card-title">
              <h3>Connect Device</h3>
              <p className="card-description">Connect via Serial/USB or Bluetooth</p>
            </div>
          </div>

          <div className="device-connection-section">
            {/* Serial/USB Connection */}
            <div className="connection-column">
              <h4>Connect Serial/USB:</h4>
              <div className="device-list">
                {comPorts.map((port, index) => (
                  <div 
                    key={index} 
                    className={`device-item ${selectedPort === port ? 'selected' : ''}`}
                    onClick={() => setSelectedPort(port)}
                  >
                    {port}
                  </div>
                ))}
              </div>
              <div className="button-group">
                <button className="btn btn-refresh" onClick={handleRefreshPorts}>
                  REFRESH
                </button>
                <button className="btn btn-connect" onClick={() => console.log(`Connecting to ${selectedPort}`)}>
                  CONNECT ▶
                </button>
              </div>
            </div>

            {/* Bluetooth Connection */}
            <div className="connection-column">
              <h4>Connect Bluetooth:</h4>
              <div className="device-list">
                {btDevices.map((device, index) => (
                  <div key={index} className="device-item">
                    {device}
                  </div>
                ))}
              </div>
              <div className="button-group">
                <button className="btn btn-scan" onClick={handleScanBluetooth}>
                  SCAN
                </button>
                <button className="btn btn-connect" onClick={() => console.log('Connecting Bluetooth')}>
                  CONNECT ▶
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Navigation Footer */}
      <div className="quick-nav">
        <button className="quick-nav-btn" onClick={() => onNavigate('events')}>
          📊 View Event Log
        </button>
        <button className="quick-nav-btn" onClick={() => onNavigate('settings')}>
          ⚙️ Configuration Settings
        </button>
        <button className="quick-nav-btn" onClick={() => onNavigate('account')}>
          👤 Account Management
        </button>
      </div>
    </div>
  );
};

export default MenuPage;