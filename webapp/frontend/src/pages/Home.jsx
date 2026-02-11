import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

function Home() {
  const navigate = useNavigate();
  const [bleConnectionStatus, setBleConnectionStatus] = useState('Disconnected (Bluetooth)');
  const [bleDeviceName, setBleDeviceName] = useState('Not Connected');
  const [localUploadFile, setLocalUploadFile] = useState(null);
  const [localUploadStatus, setLocalUploadStatus] = useState('No file selected');
  const [localUploadLoading, setLocalUploadLoading] = useState(false);
  const localFileInputRef = useRef(null);

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const onLocalFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setLocalUploadFile(file);
      setLocalUploadStatus(`${file.name} — ${formatBytes(file.size)}`);
    } else {
      setLocalUploadFile(null);
      setLocalUploadStatus('No file selected');
    }
  };

  const onLocalTranscribe = async () => {
    if (!localUploadFile) return;
    setLocalUploadLoading(true);
    setLocalUploadStatus('Processing…');
    try {
      const formData = new FormData();
      formData.append('audio', localUploadFile, localUploadFile.name);
      const response = await fetch('/api/audio/filter-and-transcribe', {
        method: 'POST',
        body: formData
      });
      const text = await response.text();
      let result = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch (_) {
        result = {};
      }
      if (!response.ok) {
        throw new Error(result.error || response.statusText || 'Transcription failed');
      }
      const timelineId = result.timelineId || 1;
      const events = result.events || [];
      const timeline = {
        id: timelineId,
        device_id: null,
        date_generated: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        recording_start_time: result.recording_start_time || null
      };
      try {
        localStorage.setItem(
          `echolog_timeline_${timelineId}`,
          JSON.stringify({ timeline, events })
        );
      } catch (e) {
        console.warn('Cache write failed:', e);
      }
      setLocalUploadStatus('Done — opening timeline');
      navigate(`/timeline/${timelineId}`);
    } catch (error) {
      console.error('Local transcribe error:', error);
      setLocalUploadStatus('Error: ' + (error.message || 'Unknown error'));
    } finally {
      setLocalUploadLoading(false);
    }
  };

  useEffect(() => {
    // Web Bluetooth UUIDs (from your original HTML mockup)
    const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
    const CHAR_CMD_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
    const CHAR_DATA_UUID = '829a287c-03c4-4c22-9442-70b9687c703b';
    const CHAR_UPLOAD_UUID = 'ce2e1b12-5883-4903-8120-001004b3410f';

    let device, server, service, cmdChar, dataChar, uploadChar;
    let fileBuffer = [];
    let isDownloading = false;
    let startTime;
    let isConnected = false;
    let stopUploadFlag = false;
    let uploadFileObj;

    let downloadTotalSize = 0;
    let downloadBytesReceived = 0;
    let lastDownloadedBlob = null;
    let lastDownloadedFilename = null;

    const connStatus = document.getElementById('connStatus');
    const bleList = document.getElementById('bleList');
    const fileSelect = document.getElementById('fileSelect');
    const dlStatus = document.getElementById('dlStatus');
    const uploadStatus = document.getElementById('uploadStatus');
    const btnScan = document.getElementById('btnScan');
    const btnDisconnect = document.getElementById('btnDisconnect');
    const btnRefresh = document.getElementById('btnRefresh');
    const btnDownload = document.getElementById('btnDownload');
    const btnStartUpload = document.getElementById('btnStartUpload');
    const btnStopUpload = document.getElementById('btnStopUpload');
    const fileInput = document.getElementById('fileInput');

    if (
      !connStatus ||
      !bleList ||
      !fileSelect ||
      !dlStatus ||
      !uploadStatus ||
      !btnScan ||
      !btnDisconnect ||
      !btnRefresh ||
      !btnDownload ||
      !btnStartUpload ||
      !btnStopUpload ||
      !fileInput ||
      !btnTranscribe
    ) {
      return;
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }

    async function sendCommand(cmd) {
      if (!isConnected || !cmdChar) return;
      const enc = new TextEncoder();
      await cmdChar.writeValue(enc.encode(cmd));
    }

    function refreshFileList() {
      fileSelect.innerHTML = '<option>Scanning...</option>';
      isDownloading = false;
      sendCommand('ls');
    }

    function onConnected() {
      isConnected = true;
      setBleConnectionStatus('Connected (Bluetooth)');
      setBleDeviceName(device?.name || 'Device');
      if (connStatus) connStatus.innerText = 'Connected (Bluetooth)';
      if (bleList) {
        bleList.innerText = `Active: ${device?.name || 'Device'}`;
        bleList.style.color = 'green';
      }

      btnScan.style.display = 'none';
      btnDisconnect.style.display = 'inline-block';

      btnDownload.disabled = false;
      btnStartUpload.disabled = false;
      btnRefresh.disabled = false;

      refreshFileList();
    }

    function onDisconnected() {
      isConnected = false;
      setBleConnectionStatus('Disconnected (Bluetooth)');
      setBleDeviceName('Not Connected');
      if (connStatus) connStatus.innerText = 'Disconnected (Bluetooth)';
      if (bleList) {
        bleList.innerText = 'Not Connected';
        bleList.style.color = '#555';
      }

      btnScan.style.display = 'inline-block';
      btnDisconnect.style.display = 'none';

      btnRefresh.disabled = true;
      btnDownload.disabled = true;
      btnStartUpload.disabled = true;

      fileSelect.innerHTML = '<option>Disconnected</option>';
    }

    function finishDownload() {
      if (!isDownloading) return;
      const blob = new Blob(fileBuffer, { type: 'application/octet-stream' });
      lastDownloadedBlob = blob;
      lastDownloadedFilename = fileSelect.value || 'download.bin';
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = lastDownloadedFilename;
      a.click();
      URL.revokeObjectURL(url);
      isDownloading = false;
      dlStatus.innerText = 'Download Complete!';
      
      // Show transcribe button if it's an audio file
      if (lastDownloadedFilename.match(/\.(wav|mp3|ogg|m4a)$/i)) {
        btnTranscribe.style.display = 'inline-block';
        btnTranscribe.disabled = false;
      } else {
        btnTranscribe.style.display = 'none';
      }
    }

    async function processUploadStream() {
      uploadStatus.innerText = 'Starting Stream...';
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = e.target.result;
        const bytes = new Uint8Array(data);
        const total = bytes.length;
        const CHUNK_SIZE = 500;
        let offset = 0;
        startTime = Date.now();

        while (offset < total) {
          if (stopUploadFlag) {
            uploadStatus.innerText = 'Upload Cancelled';
            return;
          }
          const end = Math.min(offset + CHUNK_SIZE, total);
          const chunk = bytes.slice(offset, end);
          await uploadChar.writeValue(chunk);
          offset += chunk.length;

          if (offset % (CHUNK_SIZE * 5) === 0 || offset === total) {
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            const speed = offset / (elapsed || 1);
            const pct = ((offset / total) * 100).toFixed(0);
            uploadStatus.innerHTML = `Uploading: ${pct}% (${formatBytes(offset)}/${formatBytes(
              total
            )})<br>Speed: ${formatBytes(speed)}/s`;
          }
        }

        await sendCommand('end_upload');
        uploadStatus.innerText = 'Upload Complete!';
        setTimeout(refreshFileList, 1000);
      };
      reader.readAsArrayBuffer(uploadFileObj);
    }

    function handleIncomingData(event) {
      const value = event.target.value;
      const decoder = new TextDecoder();

      if (value.byteLength < 20) {
        const str = decoder.decode(value);
        if (str.includes('EOF')) {
          finishDownload();
          return;
        }
        if (str.includes('READY')) {
          processUploadStream();
          return;
        }
        if (str.includes('ERROR')) {
          uploadStatus.innerText = 'Error: SD Error';
          return;
        }
      }

      if (!isDownloading && value.byteLength < 100) {
        const str = decoder.decode(value);
        if (str.includes('|')) {
          const parts = str.split('|');
          const exists = Array.from(fileSelect.options).some((opt) => opt.value === parts[0]);
          if (!exists) {
            const opt = document.createElement('option');
            opt.value = parts[0];
            opt.text = `${parts[0]} (${formatBytes(parseInt(parts[1], 10))})`;
            opt.dataset.size = parts[1];
            fileSelect.appendChild(opt);
          }
          if (fileSelect.options[0] && fileSelect.options[0].text.includes('Scanning')) {
            fileSelect.remove(0);
          }
          return;
        }
      }

      if (isDownloading) {
        const chunk = new Uint8Array(value.buffer);
        fileBuffer.push(chunk);
        downloadBytesReceived += chunk.length;

        if (Math.random() > 0.8) {
          const now = Date.now();
          const elapsed = (now - startTime) / 1000;
          const speed = downloadBytesReceived / (elapsed || 1);
          dlStatus.innerHTML = `Downloaded: ${formatBytes(downloadBytesReceived)} / ${formatBytes(
            downloadTotalSize
          )}<br>Speed: ${formatBytes(speed)}/s`;
        }
      }
    }

    const onScanClick = async () => {
      try {
        device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [SERVICE_UUID] }]
        });
        bleList.innerText = 'Connecting...';
        device.addEventListener('gattserverdisconnected', onDisconnected);
        server = await device.gatt.connect();
        service = await server.getPrimaryService(SERVICE_UUID);
        cmdChar = await service.getCharacteristic(CHAR_CMD_UUID);
        dataChar = await service.getCharacteristic(CHAR_DATA_UUID);
        uploadChar = await service.getCharacteristic(CHAR_UPLOAD_UUID);
        await dataChar.startNotifications();
        dataChar.addEventListener('characteristicvaluechanged', handleIncomingData);
        onConnected();
      } catch (error) {
        // Web Bluetooth typically only works on HTTPS or localhost
        console.error(error);
        bleList.innerText = `Error: ${error.message}`;
      }
    };

    const onDisconnectClick = () => {
      if (device && device.gatt && device.gatt.connected) device.gatt.disconnect();
    };

    const onRefreshClick = () => refreshFileList();

    const onDownloadClick = () => {
      const filename = fileSelect.value;
      if (!filename || filename.includes('Scanning')) return;
      const selectedOpt = fileSelect.options[fileSelect.selectedIndex];
      downloadTotalSize = parseInt(selectedOpt.dataset.size || '0', 10);
      downloadBytesReceived = 0;
      fileBuffer = [];
      isDownloading = true;
      startTime = Date.now();
      dlStatus.innerText = 'Requesting...';
      sendCommand(`get ${filename}`);
    };

    const onFileChange = (e) => {
      if (e.target.files && e.target.files.length > 0) {
        uploadFileObj = e.target.files[0];
        uploadStatus.innerText = `File: ${uploadFileObj.name}\nSize: ${formatBytes(uploadFileObj.size)}`;
      }
    };

    const onStartUploadClick = () => {
      if (!uploadFileObj) return;
      stopUploadFlag = false;
      uploadStatus.innerText = 'Initializing...';
      sendCommand(`upload ${uploadFileObj.name}`);
    };

    const onStopUploadClick = () => {
      stopUploadFlag = true;
      uploadStatus.innerText = 'Stopping...';
    };

    const onTranscribeClick = async () => {
      if (!lastDownloadedBlob || !lastDownloadedFilename) return;
      
      btnTranscribe.disabled = true;
      btnTranscribe.innerText = 'Processing...';
      
      try {
        // Create FormData and send to backend for filtering and transcription
        const formData = new FormData();
        formData.append('audio', lastDownloadedBlob, lastDownloadedFilename);
        
        const response = await fetch('/api/audio/filter-and-transcribe', {
          method: 'POST',
          body: formData
        });
        
        const result = await response.json().catch(() => ({}));
        
        if (!response.ok) {
          const msg = result.error || response.statusText || 'Transcription failed';
          throw new Error(msg);
        }
        const timelineId = result.timelineId || 1;
        const events = result.events || [];
        const timeline = {
          id: timelineId,
          device_id: null,
          date_generated: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          recording_start_time: result.recording_start_time || null
        };
        try {
          localStorage.setItem(
            `echolog_timeline_${timelineId}`,
            JSON.stringify({ timeline, events })
          );
        } catch (e) {
          console.warn('Cache write failed:', e);
        }
        navigate(`/timeline/${timelineId}`);
      } catch (error) {
        console.error('Transcription error:', error);
        alert('Error transcribing audio: ' + (error.message || 'Unknown error'));
        btnTranscribe.disabled = false;
        btnTranscribe.innerText = 'TRANSCRIBE';
      }
    };

    btnScan.addEventListener('click', onScanClick);
    btnDisconnect.addEventListener('click', onDisconnectClick);
    btnRefresh.addEventListener('click', onRefreshClick);
    btnDownload.addEventListener('click', onDownloadClick);
    fileInput.addEventListener('change', onFileChange);
    btnStartUpload.addEventListener('click', onStartUploadClick);
    btnStopUpload.addEventListener('click', onStopUploadClick);
    btnTranscribe.addEventListener('click', onTranscribeClick);

    // initial UI state
    onDisconnected();
    btnTranscribe.style.display = 'none';

    return () => {
      try {
        btnScan.removeEventListener('click', onScanClick);
        btnDisconnect.removeEventListener('click', onDisconnectClick);
        btnRefresh.removeEventListener('click', onRefreshClick);
        btnDownload.removeEventListener('click', onDownloadClick);
        fileInput.removeEventListener('change', onFileChange);
        btnStartUpload.removeEventListener('click', onStartUploadClick);
        btnStopUpload.removeEventListener('click', onStopUploadClick);
        btnTranscribe.removeEventListener('click', onTranscribeClick);
      } catch {
        // ignore
      }
    };
  }, []);

  return (
    <div className="home-shell">
      <div className="floating-bg">
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
      </div>
      <div className="sidebar">
        <div className="logo">EchoLog</div>
        <div className="status-panel">
          Device: <span id="connStatus">{bleConnectionStatus}</span>
          <br />
          Bluetooth: <span id="bleDeviceName">{bleDeviceName}</span>
        </div>
        <div className="menu-item active">Home</div>
        <div className="menu-item" onClick={() => navigate('/timeline/1')}>
          Event Log →
        </div>
        <div className="menu-item" onClick={() => navigate('/login')}>
          Login / Register →
        </div>
        <div className="user-panel">
          <div className="avatar-circle">👤</div>
          <div className="username">guest</div>
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
            <div className="info-line" id="uploadStatus">
              File: -{'\n'}Size: 0Kb
            </div>
            <div className="control-group">
              <input type="file" id="fileInput" style={{ display: 'none' }} />
              <button className="btn btn-green" id="btnStartUpload" disabled>
                START ▶
              </button>
              <button
                className="btn btn-orange"
                onClick={() => document.getElementById('fileInput')?.click()}
              >
                SELECT FILES
              </button>
              <button className="btn btn-red" id="btnStopUpload">
                STOP
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="icon-box red-icon">⬇</div>
              <div>
                <h3>Download Files</h3>
                <p className="subtext">Download device&apos;s raw files</p>
              </div>
            </div>
            <div className="info-line" id="dlStatus">
              Status: Idle
            </div>
            <div className="control-group">
              <select id="fileSelect">
                <option>Disconnected</option>
              </select>
              <button className="btn btn-blue" id="btnRefresh" disabled title="Refresh list">
                ↻
              </button>
              <button className="btn btn-green" id="btnDownload" disabled>
                DOWNLOAD
              </button>
              <button className="btn btn-orange" id="btnTranscribe" style={{ display: 'none' }}>
                TRANSCRIBE
              </button>
            </div>
          </div>
        </div>

        <div className="card local-upload-row">
          <div className="card-header">
            <div className="icon-box purple-icon">📁</div>
            <div>
              <h3>Local Upload</h3>
              <p className="subtext">Upload an audio file from your computer to transcribe and open timeline</p>
            </div>
          </div>
          <div className="info-line local-upload-status">
            {localUploadStatus}
          </div>
          <div className="control-group">
            <input
              ref={localFileInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.ogg,.m4a"
              onChange={onLocalFileChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="btn btn-orange"
              onClick={() => localFileInputRef.current?.click()}
            >
              SELECT FILE
            </button>
            <button
              type="button"
              className="btn btn-green"
              onClick={onLocalTranscribe}
              disabled={!localUploadFile || localUploadLoading}
            >
              {localUploadLoading ? 'PROCESSING…' : 'TRANSCRIBE & OPEN TIMELINE'}
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
              <div className="device-list" id="bleList">
                Status: Not Connected
              </div>
              <div>
                <button className="btn btn-orange" id="btnScan">
                  SCAN &amp; CONNECT
                </button>
                <button className="btn btn-red" id="btnDisconnect" style={{ display: 'none' }}>
                  DISCONNECT
                </button>
              </div>
              <div className="hint">
                Note: Web Bluetooth requires Chrome/Edge and usually `https://` or `localhost`.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;

