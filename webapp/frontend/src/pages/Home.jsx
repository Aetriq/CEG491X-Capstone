// CEG491X-Capstone/webapp/Frontend/src/pages/Home.jsx

import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next'; // NEW: i18n
import './Home.css';

// Attach JWT so transcribe/append persist to DB for logged-in users
function authHeaders() {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Global transcription queue so multiple audio files are processed sequentially
let transcriptionQueue = Promise.resolve(null);

async function transcribeAudioQueued(audioFile, filename, recordingStartTimeISO) {
  transcriptionQueue = transcriptionQueue.then(async () => {
    try {
      // Quick health check before making the request
      try {
        const healthController = new AbortController();
        const healthTimeout = setTimeout(() => healthController.abort(), 5000); // 5 second timeout
        
        const healthCheck = await fetch('/api/health', { 
          method: 'GET',
          signal: healthController.signal
        });
        
        clearTimeout(healthTimeout);
        
        if (!healthCheck.ok) {
          throw new Error('Backend health check failed');
        }
      } catch (healthError) {
        if (healthError.name === 'AbortError') {
          throw new Error('Backend server health check timed out. Server may be overloaded or not responding.');
        }
        throw new Error('Backend server is not running or not accessible. Please ensure the backend server is running on port 3001.');
      }

      const formData = new FormData();
      if (filename) {
        formData.append('audio', audioFile, filename);
      } else if (audioFile && audioFile.name) {
        formData.append('audio', audioFile, audioFile.name);
      } else {
        formData.append('audio', audioFile);
      }
      if (recordingStartTimeISO) {
        formData.append('recording_start_time', recordingStartTimeISO);
      }

      const response = await fetch('/api/audio/filter-and-transcribe', {
        method: 'POST',
        headers: authHeaders(),
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
        const errorMsg = result.error || response.statusText || 'Transcription failed';
        const statusCode = response.status;
        throw new Error(`Internal Server Error (${statusCode}): ${errorMsg}`);
      }

      return result;
    } catch (error) {
      console.error('Transcription error (queued):', error);
      throw error;
    }
  });

  return transcriptionQueue;
}

async function appendAudioQueued(timelineId, audioFile, filename, recordingStartTimeISO) {
  transcriptionQueue = transcriptionQueue.then(async () => {
    try {
      // Quick health check
      try {
        const healthController = new AbortController();
        const healthTimeout = setTimeout(() => healthController.abort(), 5000);
        const healthCheck = await fetch('/api/health', { signal: healthController.signal });
        clearTimeout(healthTimeout);
        if (!healthCheck.ok) throw new Error('Backend health check failed');
      } catch (healthError) {
        if (healthError.name === 'AbortError') {
          throw new Error('Backend server health check timed out. Server may be overloaded or not responding.');
        }
        throw new Error('Backend server is not running or not accessible. Please ensure the backend server is running on port 3001.');
      }

      const formData = new FormData();
      if (filename) {
        formData.append('audio', audioFile, filename);
      } else if (audioFile && audioFile.name) {
        formData.append('audio', audioFile, audioFile.name);
      } else {
        formData.append('audio', audioFile);
      }
      if (recordingStartTimeISO) {
        formData.append('recording_start_time', recordingStartTimeISO);
      }

      let response;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000);
        response = await fetch(`/api/audio/append/${timelineId}`, {
          method: 'POST',
          headers: authHeaders(),
          body: formData,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        if (fetchError.name === 'AbortError') {
          throw new Error('Request timeout - transcription took too long (10 minutes)');
        } else if (
          fetchError.message?.includes('ECONNRESET') || 
          fetchError.message?.includes('ECONNREFUSED') ||
          fetchError.message?.includes('network') || 
          fetchError.message?.includes('Failed to fetch') ||
          fetchError.message?.includes('fetch')
        ) {
          const errorMsg = fetchError.message?.includes('ECONNREFUSED') 
            ? 'Backend server is not running. Please start the backend server on port 3001.'
            : 'Connection error - server may have crashed or restarted. Please check backend logs and try again.';
          throw new Error(errorMsg);
        }
        throw fetchError;
      }

      let text;
      try {
        text = await response.text();
      } catch (readError) {
        throw new Error(`Failed to read response: ${readError.message}`);
      }

      let result = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch (_) {
        result = {};
      }

      if (!response.ok) {
        const errorMsg = result.error || response.statusText || 'Append transcription failed';
        const statusCode = response.status;
        throw new Error(`Append failed (${statusCode}): ${errorMsg}`);
      }

      return result;
    } catch (error) {
      console.error('Append transcription error (queued):', error);
      throw error;
    }
  });

  return transcriptionQueue;
}

function Home() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useTranslation(); // NEW: i18n
  const [bleConnectionStatus, setBleConnectionStatus] = useState('Disconnected (Bluetooth)');
  const [bleDeviceName, setBleDeviceName] = useState('Not Connected');
  const [localUploadFiles, setLocalUploadFiles] = useState([]);
  const [localUploadStatus, setLocalUploadStatus] = useState('No files selected');
  const [localUploadLoading, setLocalUploadLoading] = useState(false);
  const [downloadTranscribeLoading, setDownloadTranscribeLoading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('Status: Idle');
  const localFileInputRef = useRef(null);
  const downloadedFilesRef = useRef([]);

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const onLocalFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setLocalUploadFiles(files);
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      if (files.length === 1) {
        setLocalUploadStatus(`${files[0].name} — ${formatBytes(files[0].size)}`);
      } else {
        setLocalUploadStatus(`${files.length} ${t('filesSelected')} — ${formatBytes(totalSize)} ${t('total')}`);
      }
    } else {
      setLocalUploadFiles([]);
      setLocalUploadStatus(t('noFilesSelected')); // NEW: i18n
    }
  };

  const onLocalTranscribe = async () => {
    if (!localUploadFiles || localUploadFiles.length === 0) return;
    setLocalUploadLoading(true);
    
    const totalFiles = localUploadFiles.length;
    let processedCount = 0;
    let timelineId = null;
    let allEvents = [];
    const errors = [];

    try {
      for (let i = 0; i < localUploadFiles.length; i++) {
        const file = localUploadFiles[i];
        processedCount = i + 1;
        
        if (totalFiles > 1) {
          setLocalUploadStatus(t('processingXofY', { current: processedCount, total: totalFiles, name: file.name }));
        } else {
          setLocalUploadStatus(t('processingFile', { name: file.name }));
        }

        try {
          let result;
          const shouldCreateNewTimeline = (i === 0) || !timelineId;
          
          if (shouldCreateNewTimeline) {
            result = await transcribeAudioQueued(file, file.name, undefined);
            timelineId = result.timelineId || 1;
            allEvents = result.events || [];
            
            if (i > 0) {
              console.log(`[Frontend] First file failed, created new timeline ${timelineId} for file ${i + 1}`);
            }
          } else {
            result = await appendAudioQueued(timelineId, file, file.name, undefined);
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
              localStorage.setItem(
                `echolog_timeline_${timelineId}`,
                JSON.stringify({ timeline, events: allEvents })
              );
            } catch (e) {
              console.warn('Cache write failed:', e);
            }
          }
        } catch (error) {
          console.error(`Error transcribing ${file.name}:`, error);
          const errorMessage = error.message || 'Unknown error';
          errors.push({ file: file.name, error: errorMessage });
          
          if (i === 0) {
            console.warn(`[Frontend] First file failed, will try to create timeline with next file`);
          }
        }
      }

      const successCount = totalFiles - errors.length;
      
      if (errors.length === 0) {
        if (totalFiles > 1) {
          setLocalUploadStatus(t('allFilesProcessed', { count: totalFiles }));
        } else {
          setLocalUploadStatus(t('doneOpeningTimeline'));
        }
        
        if (timelineId) {
          navigate(`/timeline/${timelineId}`);
        } else {
          setLocalUploadStatus(t('timelineNotCreated'));
        }
      } else if (successCount > 0 && timelineId) {
        const errorSummary = errors.length === 1 
          ? t('oneFileFailed', { file: errors[0].file })
          : t('multipleFilesFailed', { count: errors.length });
        setLocalUploadStatus(t('partialSuccess', { success: successCount, total: totalFiles, error: errorSummary }));
        navigate(`/timeline/${timelineId}`);
      } else {
        if (errors.length === totalFiles) {
          const errorMsg = errors.map(e => `${e.file}: ${e.error}`).join('; ');
          setLocalUploadStatus(t('allFilesFailed', { count: totalFiles, error: errorMsg }));
        } else {
          setLocalUploadStatus(t('failedToCreateTimeline', { errors: errors.map(e => `${e.file}: ${e.error}`).join('; ') }));
        }
      }
    } catch (error) {
      console.error('Local transcribe error:', error);
      setLocalUploadStatus(t('errorPrefix') + ' ' + (error.message || t('unknownError')));
    } finally {
      setLocalUploadLoading(false);
    }
  };

  useEffect(() => {
    // Web Bluetooth UUIDs
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
    let downloadQueue = [];
    let currentDownloadIndex = -1;
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
    const btnDelete = document.getElementById('btnDelete');
    const btnStartUpload = document.getElementById('btnStartUpload');
    const btnStopUpload = document.getElementById('btnStopUpload');
    const fileInput = document.getElementById('fileInput');
    const btnTranscribe = document.getElementById('btnTranscribe');
    const btnSaveConfig = document.getElementById('btnSaveConfig');
    const btnDefaultConfig = document.getElementById('btnDefaultConfig');
    const btnSyncTime = document.getElementById('btnSyncTime');

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
      !btnDelete ||
      !btnStartUpload ||
      !btnStopUpload ||
      !fileInput ||
      !btnTranscribe ||
      !btnSaveConfig ||
      !btnDefaultConfig ||
      !btnSyncTime
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
      setBleConnectionStatus(t('connectedBluetooth')); // NEW: i18n
      setBleDeviceName(device?.name || 'Device');
      if (connStatus) connStatus.innerText = t('connectedBluetooth');
      if (bleList) {
        bleList.innerText = `Active: ${device?.name || 'Device'}`;
        bleList.style.color = 'green';
      }

      btnScan.style.display = 'none';
      btnDisconnect.style.display = 'inline-block';

      btnDownload.disabled = false;
      btnDelete.disabled = false;
      btnStartUpload.disabled = false;
      btnRefresh.disabled = false;
      btnSaveConfig.disabled = false;
      btnDefaultConfig.disabled = false;
      btnSyncTime.disabled = false;

      refreshFileList();
    }

    function onDisconnected() {
      isConnected = false;
      setBleConnectionStatus(t('disconnectedBluetooth')); // NEW: i18n
      setBleDeviceName(t('notConnected')); // NEW: i18n
      if (connStatus) connStatus.innerText = t('disconnectedBluetooth');
      if (bleList) {
        bleList.innerText = t('notConnected');
        bleList.style.color = '#555';
      }

      btnScan.style.display = 'inline-block';
      btnDisconnect.style.display = 'none';

      btnRefresh.disabled = true;
      btnDownload.disabled = true;
      btnDelete.disabled = true;
      btnStartUpload.disabled = true;
      btnSaveConfig.disabled = true;
      btnDefaultConfig.disabled = true;
      btnSyncTime.disabled = true;

      fileSelect.innerHTML = `<option>${t('disconnected')}</option>`;
      
      downloadedFilesRef.current = [];
      lastDownloadedBlob = null;
      lastDownloadedFilename = null;
      btnTranscribe.style.display = 'none';
      dlStatus.innerText = t('status') + ': ' + t('disconnected');
      setDownloadStatus(t('status') + ': ' + t('disconnected'));
    }

    function finishDownload() {
      if (!isDownloading) return;
      const blob = new Blob(fileBuffer, { type: 'application/octet-stream' });
      const filename = fileSelect.value || 'download.bin';

      let recordingStartTime = null;
      const selectedOpt = fileSelect.options[fileSelect.selectedIndex];
      if (selectedOpt && selectedOpt.dataset && selectedOpt.dataset.recordingTime) {
        recordingStartTime = selectedOpt.dataset.recordingTime;
      }
      
      const entry = { 
        blob, 
        filename, 
        downloadedAt: new Date().toISOString(),
        recordingStartTime
      };
      downloadedFilesRef.current = [...downloadedFilesRef.current, entry];

      try {
        console.log('[DOWNLOAD-DEBUG] Stored downloaded audio file:', entry);
        console.log('[DOWNLOAD-DEBUG] All downloaded audio files:', downloadedFilesRef.current);
      } catch {
        // ignore
      }
      
      lastDownloadedBlob = blob;
      lastDownloadedFilename = filename;
      isDownloading = false;
      
      const audioFiles = downloadedFilesRef.current.filter(f => 
        f.filename.match(/\.(wav|mp3|ogg|m4a)$/i)
      );
      if (filename.match(/\.(wav|mp3|ogg|m4a)$/i)) {
        const statusText = audioFiles.length > 1 
          ? t('downloadCompleteMultiple', { count: audioFiles.length })
          : t('downloadCompleteSingle');
        dlStatus.innerText = statusText;
        setDownloadStatus(statusText);
        btnTranscribe.style.display = 'inline-block';
        btnTranscribe.disabled = false;
        if (audioFiles.length > 1) {
          btnTranscribe.innerText = t('transcribeFiles', { count: audioFiles.length });
        } else {
          btnTranscribe.innerText = t('transcribe');
        }
      } else {
        dlStatus.innerText = t('downloadComplete');
        setDownloadStatus(t('downloadComplete'));
        btnTranscribe.style.display = 'none';
      }

      if (downloadQueue.length > 0 && currentDownloadIndex >= 0) {
        currentDownloadIndex += 1;
        if (currentDownloadIndex < downloadQueue.length) {
          const nextOpt = downloadQueue[currentDownloadIndex];
          fileSelect.value = nextOpt.value;
          const size = parseInt(nextOpt.dataset.size || '0', 10);
          downloadTotalSize = Number.isNaN(size) ? 0 : size;
          downloadBytesReceived = 0;
          fileBuffer = [];
          isDownloading = true;
          startTime = Date.now();
          const remaining = downloadQueue.length - currentDownloadIndex;
          dlStatus.innerText = remaining > 1
            ? t('requestingFileProgress', { filename: nextOpt.value, current: currentDownloadIndex + 1, total: downloadQueue.length })
            : t('requestingFile', { filename: nextOpt.value });
          sendCommand(`get ${nextOpt.value}`);
        } else {
          downloadQueue = [];
          currentDownloadIndex = -1;
        }
      }
    }

    async function processUploadStream() {
      uploadStatus.innerText = t('startingStream');
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
            uploadStatus.innerText = t('uploadCancelled');
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
            uploadStatus.innerHTML = t('uploadProgress', { percent: pct, transferred: formatBytes(offset), total: formatBytes(total), speed: formatBytes(speed) });
          }
        }

        await sendCommand('end_upload');
        uploadStatus.innerText = t('uploadComplete');
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
          uploadStatus.innerText = t('sdError');
          return;
        }
      }

      if (!isDownloading && value.byteLength < 100) {
        const str = decoder.decode(value);
        if (str.includes('|')) {
          const parts = str.split('|');
          const [name, sizeStr, recordedMeta] = parts;

          let recordingTimeIso = null;
          if (recordedMeta) {
            const numeric = Number(recordedMeta);
            if (!Number.isNaN(numeric) && numeric > 0) {
              const ms = numeric < 1e11 ? numeric * 1000 : numeric;
              const d = new Date(ms);
              if (!Number.isNaN(d.getTime())) {
                recordingTimeIso = d.toISOString();
              }
            } else {
              const d = new Date(recordedMeta);
              if (!Number.isNaN(d.getTime())) {
                recordingTimeIso = d.toISOString();
              }
            }
          }

          try {
            console.log('[BLE-DEBUG] Device file metadata (pre-download):', {
              raw: str,
              name,
              sizeBytes: parseInt(sizeStr, 10),
              recordingMetaRaw: recordedMeta ?? null,
              recordingTimeIsoFromDevice: recordingTimeIso
            });
          } catch {
            // ignore
          }

          const exists = Array.from(fileSelect.options).some((opt) => opt.value === name);
          if (!exists) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.text = `${name} (${formatBytes(parseInt(sizeStr, 10))})`;
            opt.dataset.size = sizeStr;

            if (recordedMeta) {
              opt.dataset.recordingTimeRaw = recordedMeta;
            }
            if (recordingTimeIso) {
              opt.dataset.recordingTime = recordingTimeIso;
            }

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
          dlStatus.innerHTML = t('downloadProgress', { transferred: formatBytes(downloadBytesReceived), total: formatBytes(downloadTotalSize), speed: formatBytes(speed) });
        }
      }
    }

    const onScanClick = async () => {
      try {
        device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [SERVICE_UUID] }]
        });
        bleList.innerText = t('connecting');
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
        console.error(error);
        bleList.innerText = t('errorPrefix') + ' ' + error.message;
      }
    };

    const onDisconnectClick = () => {
      if (device && device.gatt && device.gatt.connected) device.gatt.disconnect();
    };

    const onRefreshClick = () => refreshFileList();

    const onDeleteClick = async () => {
      const selectedOptions = Array.from(fileSelect.options).filter((opt) => opt.selected && !opt.text.includes('Scanning') && !opt.text.includes('Disconnected'));
      if (selectedOptions.length === 0) {
        dlStatus.innerText = t('pleaseSelectFiles');
        setDownloadStatus(t('pleaseSelectFiles'));
        return;
      }

      if (!window.confirm(t('confirmDelete', { count: selectedOptions.length }))) {
        return;
      }

      dlStatus.innerText = t('deletingFiles', { count: selectedOptions.length });
      setDownloadStatus(t('deletingFiles', { count: selectedOptions.length }));
      try {
        console.log('[BLE-DEBUG] Delete requested for files:', selectedOptions.map(o => o.value));
      } catch {
        // ignore
      }

      for (const opt of selectedOptions) {
        const filename = opt.value;
        try {
          console.log('[BLE-DEBUG] Sending delete command for:', filename);
          await sendCommand(`del ${filename}`);
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`Error deleting ${filename}:`, error);
        }
      }

      setTimeout(() => {
        refreshFileList();
        dlStatus.innerText = t('deletedFiles', { count: selectedOptions.length });
        setDownloadStatus(t('deletedFiles', { count: selectedOptions.length }));
        try {
          console.log('[BLE-DEBUG] Delete completed for files:', selectedOptions.map(o => o.value));
        } catch {
          // ignore
        }
      }, 500);
    };

    const onDownloadClick = () => {
      const selectedOptions = Array.from(fileSelect.options).filter((opt) => opt.selected && !opt.text.includes('Scanning'));
      if (selectedOptions.length === 0) {
        const filename = fileSelect.value;
        if (!filename || filename.includes('Scanning')) return;
        selectedOptions.push(fileSelect.options[fileSelect.selectedIndex]);
      }

      downloadQueue = selectedOptions;
      currentDownloadIndex = 0;

      const firstOpt = downloadQueue[0];
      const filename = firstOpt.value;
      if (!filename || filename.includes('Scanning')) return;

      fileSelect.value = filename;
      const size = parseInt(firstOpt.dataset.size || '0', 10);
      downloadTotalSize = Number.isNaN(size) ? 0 : size;
      downloadBytesReceived = 0;
      fileBuffer = [];
      isDownloading = true;
      startTime = Date.now();
      dlStatus.innerText = downloadQueue.length > 1
        ? t('requestingFileProgress', { filename, current: 1, total: downloadQueue.length })
        : t('requestingFile', { filename });
      sendCommand(`get ${filename}`);
    };

    const onFileChange = (e) => {
      if (e.target.files && e.target.files.length > 0) {
        uploadFileObj = e.target.files[0];
        uploadStatus.innerText = `${t('fileColon')} ${uploadFileObj.name}\n${t('sizeColon')} ${formatBytes(uploadFileObj.size)}`;
      }
    };

    const onStartUploadClick = () => {
      if (!uploadFileObj) return;
      stopUploadFlag = false;
      uploadStatus.innerText = t('initializing');
      sendCommand(`upload ${uploadFileObj.name}`);
    };

    const onStopUploadClick = () => {
      stopUploadFlag = true;
      uploadStatus.innerText = t('stopping');
    };

    const onTranscribeClick = async () => {
      const audioFiles = downloadedFilesRef.current.filter(f => 
        f.filename.match(/\.(wav|mp3|ogg|m4a)$/i)
      );
      
      if (audioFiles.length === 0) {
        if (!lastDownloadedBlob || !lastDownloadedFilename) return;
        audioFiles.push({ blob: lastDownloadedBlob, filename: lastDownloadedFilename });
      }
      
      if (audioFiles.length === 0) return;
      
      setDownloadTranscribeLoading(true);
      btnTranscribe.disabled = true;
      btnTranscribe.innerText = audioFiles.length > 1 ? t('processingXFiles', { count: audioFiles.length }) : t('processing');
      
      const totalFiles = audioFiles.length;
      let processedCount = 0;
      let timelineId = null;
      let allEvents = [];
      const errors = [];

      try {
        for (let i = 0; i < audioFiles.length; i++) {
          const file = audioFiles[i];
          processedCount = i + 1;
          
          if (totalFiles > 1) {
            const statusText = t('processingXofY', { current: processedCount, total: totalFiles, name: file.filename });
            dlStatus.innerText = statusText;
            setDownloadStatus(statusText);
            btnTranscribe.innerText = t('processingCount', { current: processedCount, total: totalFiles });
          } else {
            const statusText = t('processingFile', { name: file.filename });
            dlStatus.innerText = statusText;
            setDownloadStatus(statusText);
            btnTranscribe.innerText = t('processing');
          }

          try {
            let result;
            const shouldCreateNewTimeline = (i === 0) || !timelineId;
            
            if (shouldCreateNewTimeline) {
              const recordingTimeISO = file.recordingStartTime || undefined;
              result = await transcribeAudioQueued(file.blob, file.filename, recordingTimeISO);
              timelineId = result.timelineId || 1;
              allEvents = result.events || [];
              
              if (i > 0) {
                console.log(`[Frontend] First file failed, created new timeline ${timelineId} for file ${i + 1}`);
              }
            } else {
              const recordingTimeISO = file.recordingStartTime || undefined;
              result = await appendAudioQueued(timelineId, file.blob, file.filename, recordingTimeISO);
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
                localStorage.setItem(
                  `echolog_timeline_${timelineId}`,
                  JSON.stringify({ timeline, events: allEvents })
                );
              } catch (e) {
                console.warn('Cache write failed:', e);
              }
            }
          } catch (error) {
            console.error(`Error transcribing ${file.filename}:`, error);
            const errorMessage = error.message || 'Unknown error';
            errors.push({ file: file.filename, error: errorMessage });
            
            if (i === 0) {
              console.warn(`[Frontend] First file failed, will try to create timeline with next file`);
            }
          }
        }

        const successCount = totalFiles - errors.length;
        
        if (errors.length === 0) {
          if (totalFiles > 1) {
            const statusText = t('allFilesProcessed', { count: totalFiles });
            dlStatus.innerText = statusText;
            setDownloadStatus(statusText);
          } else {
            const statusText = t('doneOpeningTimeline');
            dlStatus.innerText = statusText;
            setDownloadStatus(statusText);
          }
          
          if (timelineId) {
            downloadedFilesRef.current = [];
            navigate(`/timeline/${timelineId}`);
          } else {
            dlStatus.innerText = t('timelineNotCreated');
            setDownloadStatus(t('timelineNotCreated'));
          }
        } else if (successCount > 0 && timelineId) {
          const errorSummary = errors.length === 1 
            ? t('oneFileFailed', { file: errors[0].file })
            : t('multipleFilesFailed', { count: errors.length });
          const statusText = t('partialSuccess', { success: successCount, total: totalFiles, error: errorSummary });
          dlStatus.innerText = statusText;
          setDownloadStatus(statusText);
          downloadedFilesRef.current = downloadedFilesRef.current.filter(f => 
            errors.some(e => e.file === f.filename)
          );
          navigate(`/timeline/${timelineId}`);
        } else {
          if (errors.length === totalFiles) {
            const errorMsg = errors.map(e => `${e.file}: ${e.error}`).join('; ');
            const statusText = t('allFilesFailed', { count: totalFiles, error: errorMsg });
            dlStatus.innerText = statusText;
            setDownloadStatus(statusText);
            alert(t('allFilesFailedAlert', { error: errorMsg }));
          } else {
            const errorMsg = errors.map(e => `${e.file}: ${e.error}`).join('; ');
            const statusText = t('failedToCreateTimeline', { errors: errorMsg });
            dlStatus.innerText = statusText;
            setDownloadStatus(statusText);
            alert(t('failedToCreateTimelineAlert', { error: errorMsg }));
          }
        }
      } catch (error) {
        console.error('Download transcribe error:', error);
        const errorText = t('errorPrefix') + ' ' + (error.message || t('unknownError'));
        dlStatus.innerText = errorText;
        setDownloadStatus(errorText);
        alert(t('transcribeErrorAlert') + ' ' + (error.message || t('unknownError')));
      } finally {
        setDownloadTranscribeLoading(false);
        btnTranscribe.disabled = false;
        
        const remainingAudioFiles = downloadedFilesRef.current.filter(f => 
          f.filename.match(/\.(wav|mp3|ogg|m4a)$/i)
        );
        if (remainingAudioFiles.length > 1) {
          btnTranscribe.innerText = t('transcribeFiles', { count: remainingAudioFiles.length });
        } else if (remainingAudioFiles.length === 1) {
          btnTranscribe.innerText = t('transcribe');
        } else {
          btnTranscribe.innerText = t('transcribe');
          btnTranscribe.style.display = 'none';
        }
      }
    };

    const onSaveConfigClick = async () => {
      const recLength = document.getElementById('recLengthSlider')?.value || '30';
      const actThresh = document.getElementById('actThresh')?.value || '1800';
      const actTime = document.getElementById('actTime')?.value || '10';
      const inaThresh = document.getElementById('inaThresh')?.value || '1500';
      const inaTime = document.getElementById('inaTime')?.value || '10';
      
      try {
        await sendCommand(`cfg_rec ${recLength}`);
        await new Promise(resolve => setTimeout(resolve, 200));
        await sendCommand(`cfg_acc ${actThresh} ${actTime} ${inaThresh} ${inaTime}`);
        dlStatus.innerText = t('configSaved');
        setDownloadStatus(t('configSaved'));
      } catch (error) {
        console.error('Error saving config:', error);
        dlStatus.innerText = t('configError');
        setDownloadStatus(t('configError'));
      }
    };

    const onDefaultConfigClick = async () => {
      const recLengthSlider = document.getElementById('recLengthSlider');
      const sVal = document.getElementById('sVal');
      const actThresh = document.getElementById('actThresh');
      const actTime = document.getElementById('actTime');
      const inaThresh = document.getElementById('inaThresh');
      const inaTime = document.getElementById('inaTime');
      
      if (recLengthSlider) recLengthSlider.value = '30';
      if (sVal) sVal.innerText = '30s';
      if (actThresh) actThresh.value = '1800';
      if (actTime) actTime.value = '10';
      if (inaThresh) inaThresh.value = '1500';
      if (inaTime) inaTime.value = '10';
      
      try {
        await sendCommand('cfg_rec 30');
        await new Promise(resolve => setTimeout(resolve, 200));
        await sendCommand('cfg_acc 1800 10 1500 10');
        dlStatus.innerText = t('defaultsRestored');
        setDownloadStatus(t('defaultsRestored'));
      } catch (error) {
        console.error('Error resetting config:', error);
        dlStatus.innerText = t('configError');
        setDownloadStatus(t('configError'));
      }
    };

    const onSyncTimeClick = async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      
      try {
        await sendCommand(`time ${year} ${month} ${day} ${hours} ${minutes} ${seconds}`);
        dlStatus.innerText = t('timeSynced');
        setDownloadStatus(t('timeSynced'));
      } catch (error) {
        console.error('Error syncing time:', error);
        dlStatus.innerText = t('timeSyncError');
        setDownloadStatus(t('timeSyncError'));
      }
    };

    btnScan.addEventListener('click', onScanClick);
    btnDisconnect.addEventListener('click', onDisconnectClick);
    btnRefresh.addEventListener('click', onRefreshClick);
    btnDownload.addEventListener('click', onDownloadClick);
    btnDelete.addEventListener('click', onDeleteClick);
    fileInput.addEventListener('change', onFileChange);
    btnStartUpload.addEventListener('click', onStartUploadClick);
    btnStopUpload.addEventListener('click', onStopUploadClick);
    btnTranscribe.addEventListener('click', onTranscribeClick);
    btnSaveConfig.addEventListener('click', onSaveConfigClick);
    btnDefaultConfig.addEventListener('click', onDefaultConfigClick);
    btnSyncTime.addEventListener('click', onSyncTimeClick);

    onDisconnected();
    btnTranscribe.style.display = 'none';

    return () => {
      try {
        btnScan.removeEventListener('click', onScanClick);
        btnDisconnect.removeEventListener('click', onDisconnectClick);
        btnRefresh.removeEventListener('click', onRefreshClick);
        btnDownload.removeEventListener('click', onDownloadClick);
        btnDelete.removeEventListener('click', onDeleteClick);
        fileInput.removeEventListener('change', onFileChange);
        btnStartUpload.removeEventListener('click', onStartUploadClick);
        btnStopUpload.removeEventListener('click', onStopUploadClick);
        btnTranscribe.removeEventListener('click', onTranscribeClick);
        btnSaveConfig.removeEventListener('click', onSaveConfigClick);
        btnDefaultConfig.removeEventListener('click', onDefaultConfigClick);
        btnSyncTime.removeEventListener('click', onSyncTimeClick);
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
        <div className="logo">{t('appName')}</div> {/* NEW: i18n */}
        <div className="status-panel">
          {t('device')}: <span id="connStatus">{bleConnectionStatus}</span> {/* NEW: i18n */}
          <br />
          Bluetooth: <span id="bleDeviceName">{bleDeviceName}</span>
        </div>
        <div className="menu-item active">{t('home')}</div> {/* NEW: i18n */}
        <div className="menu-item" onClick={() => navigate('/menu')}>
          {t('mainMenu')} → {/* NEW: i18n */}
        </div>
        <div className="menu-item" onClick={() => navigate(user ? '/account' : '/login')}>
          {user ? t('account') + ' →' : t('loginRegister') + ' →'} {/* NEW: i18n */}
        </div>
        <div className="user-panel">
          <div className="avatar-circle">
            {user?.username ? user.username.charAt(0).toUpperCase() : '👤'}
          </div>
          <div className="username">{user?.username || t('guest')}</div> {/* NEW: i18n */}
          {user && (
            <div
              className="logout-link"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              {t('logout')} {/* NEW: i18n */}
            </div>
          )}
        </div>
      </div>

      <div className="main-content">
        <div className="welcome-hero">
          <h1>{t('welcome')}</h1> {/* NEW: i18n */}
          <p>{t('homeDescription')}</p> {/* NEW: i18n */}
        </div>

        <div className="top-row">
          <div className="card">
            <div className="card-header">
              <div className="icon-box orange-icon">⬆</div>
              <div>
                <h3>{t('uploadFiles')}</h3> {/* NEW: i18n */}
                <p className="subtext">{t('uploadDescription')}</p> {/* NEW: i18n */}
              </div>
            </div>
            <div className="info-line" id="uploadStatus">
              {t('fileColon')} -{'\n'}{t('sizeColon')} 0Kb {/* NEW: i18n */}
            </div>
            <div className="control-group">
              <input type="file" id="fileInput" style={{ display: 'none' }} />
              <button className="btn btn-green" id="btnStartUpload" disabled>
                {t('start')} ▶ {/* NEW: i18n */}
              </button>
              <button
                className="btn btn-orange"
                onClick={() => document.getElementById('fileInput')?.click()}
              >
                {t('selectFiles')} {/* NEW: i18n */}
              </button>
              <button className="btn btn-red" id="btnStopUpload">
                {t('stop')} {/* NEW: i18n */}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="icon-box red-icon">⬇</div>
              <div>
                <h3>{t('downloadFiles')}</h3> {/* NEW: i18n */}
                <p className="subtext">{t('downloadDescription')}</p> {/* NEW: i18n */}
              </div>
            </div>
            <div className="info-line" id="dlStatus">
              {t('status')}: {t('idle')} {/* NEW: i18n */}
            </div>
            <div className="control-group">
              <select id="fileSelect" multiple>
                <option>{t('disconnected')}</option> {/* NEW: i18n */}
              </select>
              <button className="btn btn-blue" id="btnRefresh" disabled title={t('refresh')}> {/* NEW: i18n */}
                ↻
              </button>
              <button className="btn btn-green" id="btnDownload" disabled>
                {t('download')} {/* NEW: i18n */}
              </button>
              <button className="btn btn-red" id="btnDelete" disabled>
                {t('delete')} {/* NEW: i18n */}
              </button>
              <button className="btn btn-orange" id="btnTranscribe" style={{ display: 'none' }}>
                {t('transcribe')} {/* NEW: i18n */}
              </button>
            </div>
          </div>
        </div>

        <div className="card local-upload-row">
          <div className="card-header">
            <div className="icon-box purple-icon">📁</div>
            <div>
              <h3>{t('localUpload')}</h3> {/* NEW: i18n */}
              <p className="subtext">{t('localUploadDescription')}</p> {/* NEW: i18n */}
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
              multiple
              onChange={onLocalFileChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="btn btn-orange"
              onClick={() => localFileInputRef.current?.click()}
            >
              {t('selectFiles')} {/* NEW: i18n */}
            </button>
            <button
              type="button"
              className="btn btn-green"
              onClick={onLocalTranscribe}
              disabled={!localUploadFiles || localUploadFiles.length === 0 || localUploadLoading}
            >
              {localUploadLoading 
                ? (localUploadFiles.length > 1 
                    ? t('processingXFiles', { count: localUploadFiles.length }) 
                    : t('processing'))
                : localUploadFiles.length > 1
                  ? t('transcribeXFiles', { count: localUploadFiles.length })
                  : t('transcribeAndOpen')} {/* NEW: i18n */}
            </button>
          </div>
        </div>

        <div className="card bottom-row">
          <div className="card-header">
            <div className="icon-box purple-icon">⚙️</div>
            <div>
              <h3>{t('deviceParameters')}</h3> {/* NEW: i18n */}
              <p className="subtext">{t('pushSettings')}</p> {/* NEW: i18n */}
            </div>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '13px', color: '#444' }}>
              {t('audioRecordingLength')} (s) {/* NEW: i18n */}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="range"
                min="10"
                max="300"
                defaultValue="30"
                id="recLengthSlider"
                style={{ flex: 1, cursor: 'pointer' }}
                onChange={(e) => {
                  const val = document.getElementById('sVal');
                  if (val) val.innerText = e.target.value + 's';
                }}
              />
              <span id="sVal" style={{ fontWeight: 'bold', color: '#555', minWidth: '40px' }}>30s</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '13px', color: '#444' }}>
                {t('activityThreshold')} {/* NEW: i18n */}
              </label>
              <input
                type="number"
                id="actThresh"
                defaultValue="1800"
                style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '13px', color: '#444' }}>
                {t('activityTime')} (ms) {/* NEW: i18n */}
              </label>
              <input
                type="number"
                id="actTime"
                defaultValue="10"
                style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '13px', color: '#444' }}>
                {t('inactivityThreshold')} {/* NEW: i18n */}
              </label>
              <input
                type="number"
                id="inaThresh"
                defaultValue="1500"
                style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '13px', color: '#444' }}>
                {t('inactivityTime')} (ms) {/* NEW: i18n */}
              </label>
              <input
                type="number"
                id="inaTime"
                defaultValue="10"
                style={{ width: '100%', padding: '10px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', borderRadius: '6px' }}
              />
            </div>
          </div>
          <div className="control-group" style={{ marginTop: '20px', borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '20px' }}>
            <button className="btn btn-green" id="btnSaveConfig" disabled>
              {t('saveToDevice')} {/* NEW: i18n */}
            </button>
            <button className="btn btn-dark" id="btnDefaultConfig" disabled>
              {t('resetDefaults')} {/* NEW: i18n */}
            </button>
            <button className="btn btn-blue" id="btnSyncTime" disabled style={{ marginLeft: 'auto' }}>
              {t('syncTime')} {/* NEW: i18n */}
            </button>
          </div>
        </div>

        <div className="card bottom-row">
          <div className="card-header">
            <div className="icon-box teal-icon">🔗</div>
            <div>
              <h3>{t('connectDevice')}</h3> {/* NEW: i18n */}
              <p className="subtext">{t('connectDescription')}</p> {/* NEW: i18n */}
            </div>
          </div>
          <div className="connection-single">
            <div className="conn-box">
              <div className="conn-title">{t('bluetoothConnection')}:</div> {/* NEW: i18n */}
              <div className="device-list" id="bleList">
                {t('status')}: {t('notConnected')} {/* NEW: i18n */}
              </div>
              <div>
                <button className="btn btn-orange" id="btnScan">
                  {t('scanAndConnect')} {/* NEW: i18n */}
                </button>
                <button className="btn btn-red" id="btnDisconnect" style={{ display: 'none' }}>
                  {t('disconnect')} {/* NEW: i18n */}
                </button>
              </div>
              <div className="hint">
                {t('webBluetoothNote')} {/* NEW: i18n */}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;