// CEG491X-Capstone/echolog-webapp/frontend/src/components/screens/Home.tsx
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useBluetooth } from '../../hooks/useBluetooth'; // YOUR hook
import './Home.css';

// Global transcription queue for sequential processing
let transcriptionQueue: Promise<any> = Promise.resolve(null);

async function transcribeAudioQueued(audioFile: File | Blob, filename?: string): Promise<any> {
  transcriptionQueue = transcriptionQueue.then(async () => {
    // Health check
    try {
      const healthController = new AbortController();
      const healthTimeout = setTimeout(() => healthController.abort(), 5000);
      const healthCheck = await fetch('/api/health', { signal: healthController.signal });
      clearTimeout(healthTimeout);
      if (!healthCheck.ok) throw new Error('Backend health check failed');
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error('Health check timeout');
      throw new Error('Backend server not running');
    }

    const formData = new FormData();
    formData.append('audio', audioFile, filename);

    const response = await fetch('/api/audio/filter-and-transcribe', { method: 'POST', body: formData });
    const text = await response.text();
    let result: any = {};
    try { result = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
    if (!response.ok) throw new Error(result.error || 'Transcription failed');
    return result;
  });
  return transcriptionQueue;
}

async function appendAudioQueued(timelineId: number, audioFile: File | Blob, filename?: string): Promise<any> {
  transcriptionQueue = transcriptionQueue.then(async () => {
    // Health check (same)
    try {
      const healthController = new AbortController();
      const healthTimeout = setTimeout(() => healthController.abort(), 5000);
      const healthCheck = await fetch('/api/health', { signal: healthController.signal });
      clearTimeout(healthTimeout);
      if (!healthCheck.ok) throw new Error('Backend health check failed');
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error('Health check timeout');
      throw new Error('Backend server not running');
    }

    const formData = new FormData();
    formData.append('audio', audioFile, filename);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000);
    const response = await fetch(`/api/audio/append/${timelineId}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const text = await response.text();
    let result: any = {};
    try { result = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
    if (!response.ok) throw new Error(result.error || 'Append failed');
    return result;
  });
  return transcriptionQueue;
}

interface DownloadedFile {
  blob: Blob;
  filename: string;
  downloadedAt: string;
}

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    isConnected,
    isScanning,
    error,
    fileTransferProgress,
    availableDevices,
    scanForDevices,
    connectToDevice,
    disconnectDevice,
    uploadFile,
    downloadFile,
    listFiles,
    getDeviceInfo
  } = useBluetooth();

  // Local state for UI
  const [bleConnectionStatus, setBleConnectionStatus] = useState('Disconnected (Bluetooth)');
  const [bleDeviceName, setBleDeviceName] = useState('Not Connected');
  const [localUploadFiles, setLocalUploadFiles] = useState<File[]>([]);
  const [localUploadStatus, setLocalUploadStatus] = useState('No files selected');
  const [localUploadLoading, setLocalUploadLoading] = useState(false);
  const [downloadTranscribeLoading, setDownloadTranscribeLoading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('Status: Idle');
  const localFileInputRef = useRef<HTMLInputElement>(null);
  const downloadedFilesRef = useRef<DownloadedFile[]>([]);

  // Refs for DOM elements used in the original Bluetooth logic
  const connStatusRef = useRef<HTMLSpanElement>(null);
  const bleListRef = useRef<HTMLDivElement>(null);
  const fileSelectRef = useRef<HTMLSelectElement>(null);
  const dlStatusRef = useRef<HTMLDivElement>(null);
  const uploadStatusRef = useRef<HTMLDivElement>(null);
  const btnScanRef = useRef<HTMLButtonElement>(null);
  const btnDisconnectRef = useRef<HTMLButtonElement>(null);
  const btnRefreshRef = useRef<HTMLButtonElement>(null);
  const btnDownloadRef = useRef<HTMLButtonElement>(null);
  const btnStartUploadRef = useRef<HTMLButtonElement>(null);
  const btnStopUploadRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const btnTranscribeRef = useRef<HTMLButtonElement>(null);

  // Update UI when Bluetooth state changes
  useEffect(() => {
    if (isConnected) {
      setBleConnectionStatus('Connected');
      setBleDeviceName(availableDevices[0]?.name || 'Device');
      if (connStatusRef.current) connStatusRef.current.innerText = 'Connected (Bluetooth)';
      if (bleListRef.current) {
        bleListRef.current.innerText = `Active: ${availableDevices[0]?.name || 'Device'}`;
        bleListRef.current.style.color = 'green';
      }
      if (btnScanRef.current) btnScanRef.current.style.display = 'none';
      if (btnDisconnectRef.current) btnDisconnectRef.current.style.display = 'inline-block';
      if (btnRefreshRef.current) btnRefreshRef.current.disabled = false;
      if (btnDownloadRef.current) btnDownloadRef.current.disabled = false;
      if (btnStartUploadRef.current) btnStartUploadRef.current.disabled = false;
      refreshFileList();
    } else {
      setBleConnectionStatus('Disconnected');
      setBleDeviceName('Not Connected');
      if (connStatusRef.current) connStatusRef.current.innerText = 'Disconnected (Bluetooth)';
      if (bleListRef.current) {
        bleListRef.current.innerText = 'Not Connected';
        bleListRef.current.style.color = '#555';
      }
      if (btnScanRef.current) btnScanRef.current.style.display = 'inline-block';
      if (btnDisconnectRef.current) btnDisconnectRef.current.style.display = 'none';
      if (btnRefreshRef.current) btnRefreshRef.current.disabled = true;
      if (btnDownloadRef.current) btnDownloadRef.current.disabled = true;
      if (btnStartUploadRef.current) btnStartUploadRef.current.disabled = true;
      if (fileSelectRef.current) fileSelectRef.current.innerHTML = '<option>Disconnected</option>';
      downloadedFilesRef.current = [];
      if (btnTranscribeRef.current) btnTranscribeRef.current.style.display = 'none';
      if (dlStatusRef.current) dlStatusRef.current.innerText = 'Status: Disconnected';
      setDownloadStatus('Status: Disconnected');
    }
  }, [isConnected, availableDevices]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const onLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    setLocalUploadFiles(files);
    if (files.length === 0) {
      setLocalUploadStatus('No files selected');
    } else if (files.length === 1) {
      setLocalUploadStatus(`${files[0].name} — ${formatBytes(files[0].size)}`);
    } else {
      const total = files.reduce((sum, f) => sum + f.size, 0);
      setLocalUploadStatus(`${files.length} files selected — ${formatBytes(total)} total`);
    }
  };

  const onLocalTranscribe = async () => {
    if (!localUploadFiles.length) return;
    setLocalUploadLoading(true);
    const totalFiles = localUploadFiles.length;
    let timelineId: number | null = null;
    let allEvents: any[] = [];
    const errors: { file: string; error: string }[] = [];

    try {
      for (let i = 0; i < localUploadFiles.length; i++) {
        const file = localUploadFiles[i];
        setLocalUploadStatus(`Processing ${i + 1}/${totalFiles}: ${file.name}…`);

        try {
          const shouldCreateNew = i === 0 || !timelineId;
          let result: any;
          if (shouldCreateNew) {
            result = await transcribeAudioQueued(file, file.name);
            timelineId = result.timelineId || 1;
            allEvents = result.events || [];
          } else {
            result = await appendAudioQueued(timelineId!, file, file.name);
            allEvents = result.events || allEvents;
          }

          if (timelineId && result) {
            const timeline = {
              id: timelineId,
              device_id: null,
              date_generated: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              recording_start_time: result.recording_start_time || null
            };
            try {
              localStorage.setItem(`echolog_timeline_${timelineId}`, JSON.stringify({ timeline, events: allEvents }));
            } catch (e) {
              console.warn('Cache write failed', e);
            }
          }
        } catch (err: any) {
          errors.push({ file: file.name, error: err.message });
          if (i === 0) console.warn('First file failed, will try to create timeline with next');
        }
      }

      const successCount = totalFiles - errors.length;
      if (errors.length === 0) {
        setLocalUploadStatus(totalFiles > 1 ? `Done — ${totalFiles} files transcribed. Opening timeline…` : 'Done — opening timeline');
        if (timelineId) navigate(`/timeline/${timelineId}`);
        else setLocalUploadStatus('Error: Timeline was not created');
      } else if (successCount > 0 && timelineId) {
        setLocalUploadStatus(`Partial success: ${successCount}/${totalFiles} processed. Opening timeline…`);
        navigate(`/timeline/${timelineId}`);
      } else {
        setLocalUploadStatus(`Error: All files failed. ${errors.map(e => `${e.file}: ${e.error}`).join('; ')}`);
      }
    } catch (err: any) {
      setLocalUploadStatus('Error: ' + (err.message || 'Unknown error'));
    } finally {
      setLocalUploadLoading(false);
    }
  };

  // Bluetooth helper functions (using your hook)
  const refreshFileList = async () => {
    if (!isConnected) return;
    if (fileSelectRef.current) fileSelectRef.current.innerHTML = '<option>Scanning...</option>';
    try {
      const files = await listFiles();
      if (fileSelectRef.current) {
        fileSelectRef.current.innerHTML = '';
        files.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f;
          opt.text = f;
          fileSelectRef.current?.appendChild(opt);
        });
      }
    } catch (err) {
      console.error('Failed to list files', err);
    }
  };

  const handleScan = async () => {
    await scanForDevices();
  };

  const handleConnect = async () => {
    if (availableDevices.length > 0) {
      await connectToDevice(availableDevices[0].id);
    }
  };

  const handleDisconnect = async () => {
    await disconnectDevice();
  };

  const handleDownload = async () => {
    if (!fileSelectRef.current || !isConnected) return;
    const filename = fileSelectRef.current.value;
    if (!filename || filename.includes('Scanning')) return;
    try {
      setDownloadStatus('Requesting...');
      const blob = await downloadFile(filename);
      downloadedFilesRef.current.push({ blob, filename, downloadedAt: new Date().toISOString() });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadStatus('Download Complete!');
      if (filename.match(/\.(wav|mp3|ogg|m4a)$/i)) {
        if (btnTranscribeRef.current) {
          btnTranscribeRef.current.style.display = 'inline-block';
          btnTranscribeRef.current.disabled = false;
        }
      }
    } catch (err: any) {
      setDownloadStatus(`Error: ${err.message}`);
    }
  };

  const handleTranscribe = async () => {
    const audioFiles = downloadedFilesRef.current.filter(f => f.filename.match(/\.(wav|mp3|ogg|m4a)$/i));
    if (audioFiles.length === 0) return;
    setDownloadTranscribeLoading(true);
    if (btnTranscribeRef.current) btnTranscribeRef.current.disabled = true;

    const totalFiles = audioFiles.length;
    let timelineId: number | null = null;
    let allEvents: any[] = [];
    const errors: { file: string; error: string }[] = [];

    try {
      for (let i = 0; i < audioFiles.length; i++) {
        const file = audioFiles[i];
        setDownloadStatus(`Processing ${i + 1}/${totalFiles}: ${file.filename}…`);

        try {
          const shouldCreateNew = i === 0 || !timelineId;
          let result: any;
          if (shouldCreateNew) {
            result = await transcribeAudioQueued(file.blob, file.filename);
            timelineId = result.timelineId || 1;
            allEvents = result.events || [];
          } else {
            result = await appendAudioQueued(timelineId!, file.blob, file.filename);
            allEvents = result.events || allEvents;
          }

          if (timelineId && result) {
            const timeline = {
              id: timelineId,
              device_id: null,
              date_generated: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              recording_start_time: result.recording_start_time || null
            };
            try {
              localStorage.setItem(`echolog_timeline_${timelineId}`, JSON.stringify({ timeline, events: allEvents }));
            } catch (e) { console.warn(e); }
          }
        } catch (err: any) {
          errors.push({ file: file.filename, error: err.message });
        }
      }

      const successCount = totalFiles - errors.length;
      if (errors.length === 0) {
        setDownloadStatus('Done — opening timeline');
        if (timelineId) navigate(`/timeline/${timelineId}`);
      } else if (successCount > 0 && timelineId) {
        setDownloadStatus(`Partial success: ${successCount}/${totalFiles} processed. Opening timeline…`);
        navigate(`/timeline/${timelineId}`);
      } else {
        setDownloadStatus(`Error: All files failed. ${errors.map(e => `${e.file}: ${e.error}`).join('; ')}`);
      }
    } catch (err: any) {
      setDownloadStatus('Error: ' + err.message);
    } finally {
      setDownloadTranscribeLoading(false);
      if (btnTranscribeRef.current) btnTranscribeRef.current.disabled = false;
    }
  };

  return (
    <div className="home-shell">
      <div className="floating-bg">
        {[...Array(7)].map((_, i) => <div key={i} className="square"></div>)}
      </div>
      <div className="sidebar">
        <div className="logo">EchoLog</div>
        <div className="status-panel">
          Device: <span id="connStatus" ref={connStatusRef}>{bleConnectionStatus}</span><br />
          Bluetooth: <span id="bleDeviceName">{bleDeviceName}</span>
        </div>
        <div className="menu-item active">Home</div>
        <div className="menu-item" onClick={() => navigate('/timeline/1')}>Event Log →</div>
        <div className="menu-item" onClick={() => navigate('/login')}>Login / Register →</div>
        <div className="user-panel">
          <div className="avatar-circle">👤</div>
          <div className="username">{user?.username || 'guest'}</div>
        </div>
      </div>

      <div className="main-content">
        <div className="welcome-hero">
          <h1>Welcome</h1>
          <p>Upload, download, and connect to your EchoLog device.</p>
        </div>

        <div className="top-row">
          <div className="card">
            <div className="card-header">
              <div className="icon-box orange-icon">⬆</div>
              <div>
                <h3>Upload Files</h3>
                <p className="subtext">Upload files to onboard storage</p>
              </div>
            </div>
            <div className="info-line" id="uploadStatus" ref={uploadStatusRef}>File: -\nSize: 0Kb</div>
            <div className="control-group">
              <input type="file" id="fileInput" ref={fileInputRef} style={{ display: 'none' }} />
              <button className="btn btn-green" id="btnStartUpload" ref={btnStartUploadRef} disabled>START ▶</button>
              <button className="btn btn-orange" onClick={() => fileInputRef.current?.click()}>SELECT FILES</button>
              <button className="btn btn-red" id="btnStopUpload" ref={btnStopUploadRef}>STOP</button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="icon-box red-icon">⬇</div>
              <div>
                <h3>Download Files</h3>
                <p className="subtext">Download device's raw files</p>
              </div>
            </div>
            <div className="info-line" id="dlStatus" ref={dlStatusRef}>{downloadStatus}</div>
            <div className="control-group">
              <select id="fileSelect" ref={fileSelectRef}>
                <option>Disconnected</option>
              </select>
              <button className="btn btn-blue" id="btnRefresh" ref={btnRefreshRef} onClick={refreshFileList} disabled>↻</button>
              <button className="btn btn-green" id="btnDownload" ref={btnDownloadRef} onClick={handleDownload} disabled>DOWNLOAD</button>
              <button className="btn btn-orange" id="btnTranscribe" ref={btnTranscribeRef} onClick={handleTranscribe} style={{ display: 'none' }}>TRANSCRIBE</button>
            </div>
          </div>
        </div>

        <div className="card local-upload-row">
          <div className="card-header">
            <div className="icon-box purple-icon">📁</div>
            <div>
              <h3>Local Upload</h3>
              <p className="subtext">Upload one or more audio files from your computer to transcribe and open timeline</p>
            </div>
          </div>
          <div className="info-line local-upload-status">{localUploadStatus}</div>
          <div className="control-group">
            <input
              ref={localFileInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.ogg,.m4a"
              multiple
              onChange={onLocalFileChange}
              style={{ display: 'none' }}
            />
            <button className="btn btn-orange" onClick={() => localFileInputRef.current?.click()}>SELECT FILES</button>
            <button
              className="btn btn-green"
              onClick={onLocalTranscribe}
              disabled={!localUploadFiles.length || localUploadLoading}
            >
              {localUploadLoading
                ? (localUploadFiles.length > 1 ? `PROCESSING ${localUploadFiles.length} FILES…` : 'PROCESSING…')
                : localUploadFiles.length > 1
                ? `TRANSCRIBE ${localUploadFiles.length} FILES`
                : 'TRANSCRIBE & OPEN TIMELINE'}
            </button>
          </div>
        </div>

        <div className="card bottom-row">
          <div className="card-header">
            <div className="icon-box teal-icon">🔗</div>
            <div>
              <h3>Connect Device</h3>
              <p className="subtext">Connect via Bluetooth Low Energy (BLE)</p>
            </div>
          </div>
          <div className="connection-single">
            <div className="conn-box">
              <div className="conn-title">Bluetooth Connection:</div>
              <div className="device-list" id="bleList" ref={bleListRef}>Status: Not Connected</div>
              <div>
                <button className="btn btn-orange" id="btnScan" ref={btnScanRef} onClick={handleScan} disabled={isScanning}>
                  {isScanning ? 'Scanning...' : 'SCAN & CONNECT'}
                </button>
                <button className="btn btn-red" id="btnDisconnect" ref={btnDisconnectRef} onClick={handleDisconnect} style={{ display: 'none' }}>DISCONNECT</button>
              </div>
              <div className="hint">Note: Web Bluetooth requires Chrome/Edge and usually `https://` or `localhost`.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;