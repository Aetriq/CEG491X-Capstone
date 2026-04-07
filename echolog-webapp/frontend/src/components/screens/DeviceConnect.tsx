// Update frontend/src/components/screens/DeviceConnect.tsx
// UPDATED: Fixed the fileTransferProgress status comparison error
import React, { useState, useEffect, useCallback } from 'react';
import { useBluetooth } from '../../hooks/useBluetooth';
import './DeviceConnect.css';

interface DeviceConnectProps {
  onBack: () => void;
}

const DeviceConnect: React.FC<DeviceConnectProps> = ({ onBack }) => {
  const {
    device,
    isConnected,
    isScanning,
    error,
    fileTransferProgress,
    isBluetoothSupported,
    availableDevices,
    scanForDevices,
    connectToDevice,
    disconnectDevice,
    sendCommand,
    uploadFile,
    downloadFile,
    listFiles,
    getDeviceInfo
  } = useBluetooth();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [commandLog, setCommandLog] = useState<Array<{time: string, command: string, type: 'sent' | 'received'}>>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load device info when connected
  useEffect(() => {
    if (isConnected && device) {
      loadDeviceInfo();
      refreshFileList();
    }
  }, [isConnected, device]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !isConnected) {
      alert('Please select a file and ensure device is connected');
      return;
    }

    try {
      await uploadFile(selectedFile);
      alert('File uploaded successfully!');
      setSelectedFile(null);
      refreshFileList();
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    }
  };

  const handleDownload = async (filename: string) => {
    if (!isConnected) {
      alert('Device not connected');
      return;
    }

    try {
      const blob = await downloadFile(filename);
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      addToCommandLog(`Downloaded ${filename}`, 'received');
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    }
  };

  const handleScan = async () => {
    const devices = await scanForDevices();
    if (devices.length > 0) {
      addToCommandLog(`Found ${devices.length} device(s)`, 'received');
    }
  };

  const handleConnect = async (deviceId: string) => {
    try {
      const success = await connectToDevice(deviceId);
      if (success) {
        addToCommandLog(`Connected to ${device?.name}`, 'received');
      }
    } catch (err: any) {
      addToCommandLog(`Connection failed: ${err.message}`, 'received');
    }
  };

  const handleSendCommand = async (command: string) => {
    try {
      const response = await sendCommand(command);
      addToCommandLog(`Sent: ${command}`, 'sent');
      addToCommandLog(`Response: ${response}`, 'received');
    } catch (err: any) {
      addToCommandLog(`Error: ${err.message}`, 'received');
    }
  };

  const refreshFileList = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const files = await listFiles();
      setAvailableFiles(files);
      addToCommandLog('Refreshed file list', 'sent');
    } catch (err: any) {
      addToCommandLog(`Failed to list files: ${err.message}`, 'received');
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadDeviceInfo = async () => {
    try {
      const info = await getDeviceInfo();
      setDeviceInfo(info);
    } catch (err: any) {
      console.error('Failed to load device info:', err);
    }
  };

  const addToCommandLog = (message: string, type: 'sent' | 'received') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setCommandLog(prev => [...prev.slice(-9), { time, command: message, type }]);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getProgressColor = () => {
    switch (fileTransferProgress.status) {
      case 'connecting': return '#ff9800';
      case 'transferring': return '#2196f3';
      case 'uploading': return '#2196f3'; // Added uploading
      case 'downloading': return '#2196f3'; // Added downloading
      case 'completed': return '#4caf50';
      case 'error': return '#f44336';
      default: return '#1a7199';
    }
  };

  return (
    <div className="device-connect-container">
      {/* Header with animated background */}
      <div className="device-header">
        <button className="back-button" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to Menu
        </button>
        <div className="header-content">
          <h1>Device Connection</h1>
          <p className="subtitle">Manage your EchoLog device wirelessly</p>
        </div>
        <div className="header-indicator">
          <div className={`connection-dot ${isConnected ? 'connected' : 'disconnected'}`}></div>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      {/* Warning banner for unsupported browsers */}
      {!isBluetoothSupported && (
        <div className="warning-card">
          <div className="warning-icon">⚠️</div>
          <div className="warning-content">
            <h4>Web Bluetooth Not Supported</h4>
            <p>Your browser doesn't support Web Bluetooth API. Please use Chrome, Edge, or Opera for full functionality.</p>
            <small>Demo mode is active. Real Bluetooth features are disabled.</small>
          </div>
        </div>
      )}

      <div className="device-grid">
        {/* Connection Panel */}
        <div className="device-card glass-card">
          <div className="card-header">
            <h2>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M17 7L7 17M7 7L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Device Connection
            </h2>
            <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? '✓ Connected' : '✗ Disconnected'}
            </div>
          </div>

          <div className="connection-info">
            <div className="info-row">
              <span className="info-label">Device:</span>
              <span className="info-value">{device?.name || 'Not connected'}</span>
            </div>
            
            {deviceInfo && (
              <>
                <div className="info-row">
                  <span className="info-label">Battery:</span>
                  <span className="info-value">
                    <div className="battery-indicator">
                      <div className="battery-level" style={{ width: `${deviceInfo.battery}%` }}></div>
                      <span>{deviceInfo.battery}%</span>
                    </div>
                  </span>
                </div>
                
                <div className="info-row">
                  <span className="info-label">Storage:</span>
                  <span className="info-value">
                    {formatBytes(deviceInfo.storage.used)} / {formatBytes(deviceInfo.storage.total)}
                    <div className="storage-bar">
                      <div className="storage-used" style={{ 
                        width: `${(deviceInfo.storage.used / deviceInfo.storage.total) * 100}%` 
                      }}></div>
                    </div>
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="connection-actions">
            <button
              className="btn btn-scan"
              onClick={handleScan}
              disabled={isScanning}
            >
              {isScanning ? (
                <>
                  <span className="spinner"></span>
                  Scanning...
                </>
              ) : (
                '🔍 Scan Devices'
              )}
            </button>

            {availableDevices.length > 0 && (
              <select 
                className="device-select"
                onChange={(e) => handleConnect(e.target.value)}
                defaultValue=""
              >
                <option value="">Select a device...</option>
                {availableDevices.map((dev) => (
                  <option key={dev.id} value={dev.id}>
                    {dev.name}
                  </option>
                ))}
              </select>
            )}

            {isConnected ? (
              <button
                className="btn btn-danger"
                onClick={disconnectDevice}
              >
                Disconnect
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => availableDevices.length > 0 && handleConnect(availableDevices[0].id)}
                disabled={availableDevices.length === 0}
              >
                Connect
              </button>
            )}
          </div>

          {error && (
            <div className="error-message">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* File Transfer Panel */}
        <div className="device-card glass-card">
          <div className="card-header">
            <h2>📁 File Transfer</h2>
            <button 
              className="refresh-btn"
              onClick={refreshFileList}
              disabled={!isConnected || isRefreshing}
            >
              {isRefreshing ? '🔄' : '↻'}
            </button>
          </div>

          <div className="transfer-section">
            <div className="upload-area">
              <h4>Upload to Device</h4>
              <div className="file-dropzone" onClick={() => document.getElementById('file-input')?.click()}>
                {selectedFile ? (
                  <div className="selected-file">
                    <div className="file-icon">📄</div>
                    <div className="file-details">
                      <div className="file-name">{selectedFile.name}</div>
                      <div className="file-size">{formatBytes(selectedFile.size)}</div>
                    </div>
                    <button className="remove-file" onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}>×</button>
                  </div>
                ) : (
                  <>
                    <div className="dropzone-icon">📤</div>
                    <p>Click to select file or drag & drop</p>
                    <small>Supports WAV, MP3, TXT files</small>
                  </>
                )}
                <input
                  type="file"
                  id="file-input"
                  onChange={handleFileSelect}
                  accept=".wav,.mp3,.txt,.json"
                  style={{ display: 'none' }}
                />
              </div>
              
              <button
                className="btn btn-upload"
                onClick={handleUpload}
                disabled={!selectedFile || !isConnected || fileTransferProgress.isTransferring}
              >
                {fileTransferProgress.isTransferring ? 'Uploading...' : 'Upload to Device'}
              </button>
            </div>

            <div className="download-area">
              <h4>Download from Device</h4>
              <div className="files-list">
                {availableFiles.length > 0 ? (
                  <div className="files-grid">
                    {availableFiles.slice(0, 4).map((file, index) => (
                      <div key={index} className="file-item">
                        <div className="file-icon">🎵</div>
                        <div className="file-info">
                          <div className="file-name">{file}</div>
                          <div className="file-size">{(Math.random() * 5).toFixed(1)} MB</div>
                        </div>
                        <button
                          className="btn-download"
                          onClick={() => handleDownload(file)}
                          disabled={!isConnected || fileTransferProgress.isTransferring}
                        >
                          ⬇
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-files">
                    {isConnected ? 'No files found' : 'Connect device to view files'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Progress Indicator */}
          {fileTransferProgress.isTransferring && (
            <div className="progress-indicator">
              <div className="progress-header">
                <span className="progress-title">
                  {/* UPDATED: Fixed the status comparison error */}
                  {fileTransferProgress.status === 'uploading' ? 'Uploading' : 
                   fileTransferProgress.status === 'downloading' ? 'Downloading' : 'Transferring'}: 
                  {fileTransferProgress.filename}
                </span>
                <span className="progress-percent">{fileTransferProgress.progress.toFixed(1)}%</span>
              </div>
              <div className="progress-track">
                <div 
                  className="progress-bar"
                  style={{ 
                    width: `${fileTransferProgress.progress}%`,
                    backgroundColor: getProgressColor()
                  }}
                ></div>
              </div>
              <div className="progress-details">
                <span>{formatBytes(fileTransferProgress.transferredBytes)} / {formatBytes(fileTransferProgress.totalBytes)}</span>
                <span>Speed: {formatBytes(fileTransferProgress.speed)}/s</span>
              </div>
            </div>
          )}
        </div>

        {/* Device Commands Panel */}
        <div className="device-card glass-card">
          <div className="card-header">
            <h2>⚡ Device Commands</h2>
            <div className="signal-strength">
              <div className="signal-bars">
                <div className="bar"></div>
                <div className="bar"></div>
                <div className="bar"></div>
                <div className="bar"></div>
              </div>
              <span>Strong</span>
            </div>
          </div>

          <div className="command-buttons">
            <button className="btn-command" onClick={() => handleSendCommand('GET_STATUS')}>
              <span className="command-icon">📊</span>
              Status
            </button>
            <button className="btn-command" onClick={() => handleSendCommand('GET_BATTERY')}>
              <span className="command-icon">🔋</span>
              Battery
            </button>
            <button className="btn-command" onClick={() => handleSendCommand('GET_STORAGE')}>
              <span className="command-icon">💾</span>
              Storage
            </button>
            <button className="btn-command" onClick={() => handleSendCommand('SYNC_TIME')}>
              <span className="command-icon">⏰</span>
              Sync Time
            </button>
            <button className="btn-command warning" onClick={() => {
              if (window.confirm('Clear all files from device?')) {
                handleSendCommand('CLEAR_FILES');
              }
            }}>
              <span className="command-icon">🗑️</span>
              Clear Files
            </button>
            <button className="btn-command danger" onClick={() => {
              if (window.confirm('Reset device to factory settings?')) {
                handleSendCommand('FACTORY_RESET');
              }
            }}>
              <span className="command-icon">🔄</span>
              Factory Reset
            </button>
          </div>

          <div className="command-log">
            <div className="log-header">
              <h4>Command Log</h4>
              <button 
                className="clear-log"
                onClick={() => setCommandLog([])}
              >
                Clear
              </button>
            </div>
            <div className="log-entries">
              {commandLog.length > 0 ? (
                commandLog.map((entry, index) => (
                  <div key={index} className={`log-entry ${entry.type}`}>
                    <span className="log-time">[{entry.time}]</span>
                    <span className="log-message">{entry.command}</span>
                  </div>
                ))
              ) : (
                <div className="no-entries">No commands sent yet</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Footer */}
      <div className="quick-stats">
        <div className="stat-item">
          <div className="stat-icon">📡</div>
          <div className="stat-value">{isConnected ? 'Connected' : 'Offline'}</div>
          <div className="stat-label">Connection</div>
        </div>
        <div className="stat-item">
          <div className="stat-icon">📁</div>
          <div className="stat-value">{availableFiles.length}</div>
          <div className="stat-label">Files</div>
        </div>
        <div className="stat-item">
          <div className="stat-icon">⚡</div>
          <div className="stat-value">{commandLog.length}</div>
          <div className="stat-label">Commands</div>
        </div>
        <div className="stat-item">
          <div className="stat-icon">🔋</div>
          <div className="stat-value">{deviceInfo?.battery || '--'}%</div>
          <div className="stat-label">Battery</div>
        </div>
      </div>
    </div>
  );
};

export default DeviceConnect;