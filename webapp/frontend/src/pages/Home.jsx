import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import { useBle } from '../contexts/BleConnectionContext';
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
      // Provide a filename when possible so the backend can persist it meaningfully
      if (filename) {
        formData.append('audio', audioFile, filename);
      } else if (audioFile && audioFile.name) {
        formData.append('audio', audioFile, audioFile.name);
      } else {
        formData.append('audio', audioFile);
      }
      // Local card: pass file metadata time so timeline shows correct recording time
      if (recordingStartTimeISO) {
        formData.append('recording_start_time', recordingStartTimeISO);
      }

      const response = await fetch('/api/audio/filter-and-transcribe', {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });

      // For robustness, mirror the existing \"read as text then JSON\" behaviour
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
      // Provide a filename when possible so the backend can persist it meaningfully
      if (filename) {
        formData.append('audio', audioFile, filename);
      } else if (audioFile && audioFile.name) {
        formData.append('audio', audioFile, audioFile.name);
      } else {
        formData.append('audio', audioFile);
      }
      // Local card: pass file metadata time so timeline shows correct recording time
      if (recordingStartTimeISO) {
        formData.append('recording_start_time', recordingStartTimeISO);
      }

      let response;
      try {
        // Create abort controller for timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes timeout
        
        response = await fetch(`/api/audio/append/${timelineId}`, {
          method: 'POST',
          headers: authHeaders(),
          body: formData,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
      } catch (fetchError) {
        // Handle network errors (ECONNRESET, ECONNREFUSED, timeout, etc.)
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

      // For robustness, mirror the existing \"read as text then JSON\" behaviour
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
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      throw error;
    }
  });

  return transcriptionQueue;
}

function Home() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { showAlert, showConfirm } = useDialog();
  const ble = useBle();
  const [downloadTranscribeLoading, setDownloadTranscribeLoading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('Status: Idle');
  const downloadedFilesRef = useRef([]);
  const lastDownloadedBlobRef = useRef(null);
  const lastDownloadedFilenameRef = useRef(null);

  // Keep download/upload controls in sync when BLE connects/disconnects (persists across routes).
  useEffect(() => {
    const fileSelect = document.getElementById('fileSelect');
    const fileChecklist = document.getElementById('fileChecklist');
    const dlStatus = document.getElementById('dlStatus');
    const btnRefresh = document.getElementById('btnRefresh');
    const btnDownload = document.getElementById('btnDownload');
    const btnDelete = document.getElementById('btnDelete');
    const btnStartUpload = document.getElementById('btnStartUpload');
    const btnTranscribe = document.getElementById('btnTranscribe');
    if (!fileSelect || !fileChecklist || !dlStatus || !btnRefresh || !btnDownload || !btnDelete || !btnStartUpload || !btnTranscribe) {
      return;
    }
    if (ble.isConnected) {
      btnRefresh.disabled = false;
      btnDownload.disabled = false;
      btnDelete.disabled = false;
      btnStartUpload.disabled = false;
    } else {
      btnRefresh.disabled = true;
      btnDownload.disabled = true;
      btnDelete.disabled = true;
      btnStartUpload.disabled = true;
      fileSelect.innerHTML = '<option>Disconnected</option>';
      fileChecklist.innerHTML = '<div class="file-checklist-empty">Disconnected</div>';
      downloadedFilesRef.current = [];
      lastDownloadedBlobRef.current = null;
      lastDownloadedFilenameRef.current = null;
      btnTranscribe.style.display = 'none';
      dlStatus.innerText = 'Status: Disconnected';
      setDownloadStatus('Status: Disconnected');
    }
  }, [ble.isConnected]);

  useEffect(() => {
    let fileBuffer = [];
    let isDownloading = false;
    let startTime;
    let stopUploadFlag = false;
    let uploadFileObj;

    let downloadTotalSize = 0;
    let downloadBytesReceived = 0;
    let downloadQueue = [];
    let currentDownloadIndex = -1;

    const fileSelect = document.getElementById('fileSelect');
    const dlStatus = document.getElementById('dlStatus');
    const uploadStatus = document.getElementById('uploadStatus');
    const btnRefresh = document.getElementById('btnRefresh');
    const btnDownload = document.getElementById('btnDownload');
    const btnDelete = document.getElementById('btnDelete');
    const btnStartUpload = document.getElementById('btnStartUpload');
    const btnStopUpload = document.getElementById('btnStopUpload');
    const fileInput = document.getElementById('fileInput');
    const btnTranscribe = document.getElementById('btnTranscribe');
    const dlRangeStart = document.getElementById('dlRangeStart');
    const dlRangeEnd = document.getElementById('dlRangeEnd');
    const dlDownloadAll = document.getElementById('dlDownloadAll');
    const btnApplyRange = document.getElementById('btnApplyRange');
    const dlRangeStatus = document.getElementById('dlRangeStatus');

    if (
      !fileSelect ||
      !fileChecklist ||
      !dlStatus ||
      !uploadStatus ||
      !btnRefresh ||
      !btnDownload ||
      !btnDelete ||
      !btnStartUpload ||
      !btnStopUpload ||
      !fileInput ||
      !btnTranscribe ||
      !dlRangeStart ||
      !dlRangeEnd ||
      !dlDownloadAll ||
      !btnApplyRange ||
      !dlRangeStatus
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
      return ble.sendCommand(cmd);
    }

    function refreshFileList() {
      fileSelect.innerHTML = '<option>Scanning...</option>';
      renderFileChecklist();
      isDownloading = false;
      dlRangeStatus.innerText = 'Range: All files';
      sendCommand('ls');
    }

    function renderFileChecklist() {
      fileChecklist.innerHTML = '';
      const options = Array.from(fileSelect.options || []);
      const validOptions = options.filter(
        (opt) => !opt.text.includes('Scanning') && !opt.text.includes('Disconnected')
      );
      if (validOptions.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'file-checklist-empty';
        empty.innerText = options[0]?.text || 'Disconnected';
        fileChecklist.appendChild(empty);
        return;
      }
      validOptions.forEach((opt, idx) => {
        const row = document.createElement('label');
        row.className = 'file-checklist-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !!opt.selected;
        checkbox.addEventListener('change', () => {
          opt.selected = checkbox.checked;
        });
        const text = document.createElement('span');
        text.innerText = opt.text;
        row.appendChild(checkbox);
        row.appendChild(text);
        fileChecklist.appendChild(row);
        if (idx === 0 && fileSelect.value !== opt.value) {
          fileSelect.value = opt.value;
        }
      });
    }

    function parseTimestampFromFilename(filename) {
      if (!filename) return null;
      const match = filename.match(/(\d{8})_(\d{6})/);
      if (!match) return null;
      const [, datePart, timePart] = match;
      const year = parseInt(datePart.slice(0, 4), 10);
      const month = parseInt(datePart.slice(4, 6), 10) - 1;
      const day = parseInt(datePart.slice(6, 8), 10);
      const hour = parseInt(timePart.slice(0, 2), 10);
      const minute = parseInt(timePart.slice(2, 4), 10);
      const second = parseInt(timePart.slice(4, 6), 10);
      const d = new Date(year, month, day, hour, minute, second);
      return Number.isNaN(d.getTime()) ? null : d.getTime();
    }

    function getOptionTimestampMs(opt) {
      if (!opt || !opt.value) return null;
      const datasetVal = opt.dataset?.recordingTimeMs;
      if (datasetVal) {
        const ms = Number(datasetVal);
        if (!Number.isNaN(ms) && ms > 0) return ms;
      }
      return parseTimestampFromFilename(opt.value);
    }

    function isWithinSelectedRange(opt) {
      const ts = getOptionTimestampMs(opt);
      // If we cannot infer a timestamp, include by default so files are not silently excluded.
      if (ts == null) return true;
      const startMs = dlRangeStart.value ? new Date(dlRangeStart.value).getTime() : null;
      const endMs = dlRangeEnd.value ? new Date(dlRangeEnd.value).getTime() : null;
      if (startMs != null && !Number.isNaN(startMs) && ts < startMs) return false;
      if (endMs != null && !Number.isNaN(endMs) && ts > endMs) return false;
      return true;
    }

    function applyRangeSelection() {
      const validOptions = Array.from(fileSelect.options).filter(
        (opt) => !opt.text.includes('Scanning') && !opt.text.includes('Disconnected')
      );
      if (validOptions.length === 0) {
        dlRangeStatus.innerText = 'Range: No files available';
        return;
      }
      const matched = validOptions.filter(isWithinSelectedRange);
      validOptions.forEach((opt) => {
        opt.selected = matched.includes(opt);
      });
      dlRangeStatus.innerText = `Range: ${matched.length}/${validOptions.length} files selected`;
      renderFileChecklist();
    }

    function finishDownload() {
      if (!isDownloading) return;
      const blob = new Blob(fileBuffer, { type: 'application/octet-stream' });
      const filename = fileSelect.value || 'download.bin';

      // Use recording time metadata parsed earlier from the device (time saved on recorder, not download time)
      let recordingStartTime = null;
      const selectedOpt = fileSelect.options[fileSelect.selectedIndex];
      if (selectedOpt && selectedOpt.dataset && selectedOpt.dataset.recordingTime) {
        recordingStartTime = selectedOpt.dataset.recordingTime;
      }
      
      // Add to downloaded files array (using ref since we're inside useEffect)
      const entry = { 
        blob, 
        filename, 
        downloadedAt: new Date().toISOString(),
        recordingStartTime
      };
      downloadedFilesRef.current = [...downloadedFilesRef.current, entry];

      // Log stored metadata so you can inspect it in browser dev tools
      try {
        console.log('[DOWNLOAD-DEBUG] Stored downloaded audio file:', entry);
        console.log('[DOWNLOAD-DEBUG] All downloaded audio files:', downloadedFilesRef.current);
      } catch {
        // ignore logging errors
      }
      
      // Keep for backward compatibility (single file mode)
      lastDownloadedBlobRef.current = blob;
      lastDownloadedFilenameRef.current = filename;
      
      // Do NOT trigger a browser download; keep file only in web app memory
      isDownloading = false;
      
      // Update status to show downloaded files count
      const audioFiles = downloadedFilesRef.current.filter(f => 
        f.filename.match(/\.(wav|mp3|ogg|m4a)$/i)
      );
      if (filename.match(/\.(wav|mp3|ogg|m4a)$/i)) {
        const statusText = audioFiles.length > 1 
          ? `Download Complete! ${audioFiles.length} audio file(s) ready to transcribe.`
          : 'Download Complete! Ready to transcribe.';
        dlStatus.innerText = statusText;
        setDownloadStatus(statusText);
        btnTranscribe.style.display = 'inline-block';
        btnTranscribe.disabled = false;
        if (audioFiles.length > 1) {
          btnTranscribe.innerText = `TRANSCRIBE ${audioFiles.length} FILES`;
        } else {
          btnTranscribe.innerText = 'TRANSCRIBE';
        }
      } else {
        dlStatus.innerText = 'Download Complete!';
        setDownloadStatus('Download Complete!');
        btnTranscribe.style.display = 'none';
      }

      // If we have a multi-file download queue, continue with the next file
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
            ? `Requesting ${nextOpt.value} (${currentDownloadIndex + 1}/${downloadQueue.length})…`
            : `Requesting ${nextOpt.value}…`;
          sendCommand(`get ${nextOpt.value}`);
        } else {
          // Finished whole queue
          downloadQueue = [];
          currentDownloadIndex = -1;
        }
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
          const uploadChar = ble.getUploadCharacteristic();
          if (!uploadChar) {
            uploadStatus.innerText = 'Upload failed: Bluetooth not connected';
            return;
          }
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
          const [name, sizeStr, recordedMeta] = parts;

          // Attempt to interpret recording metadata (time saved on device) before any download
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

          // Log device metadata so you can confirm recording time (pre-download)
          try {
            console.log('[BLE-DEBUG] Device file metadata (pre-download):', {
              raw: str,
              name,
              sizeBytes: parseInt(sizeStr, 10),
              recordingMetaRaw: recordedMeta ?? null,
              recordingTimeIsoFromDevice: recordingTimeIso
            });
          } catch {
            // ignore logging errors
          }

          const exists = Array.from(fileSelect.options).some((opt) => opt.value === name);
          if (!exists) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.text = `${name} (${formatBytes(parseInt(sizeStr, 10))})`;
            opt.dataset.size = sizeStr;

            // Store both raw and parsed recording time metadata on the option
            if (recordedMeta) {
              opt.dataset.recordingTimeRaw = recordedMeta;
            }
            if (recordingTimeIso) {
              opt.dataset.recordingTime = recordingTimeIso;
              opt.dataset.recordingTimeMs = String(new Date(recordingTimeIso).getTime());
            } else {
              const fromName = parseTimestampFromFilename(name);
              if (fromName != null) {
                opt.dataset.recordingTimeMs = String(fromName);
              }
            }

            fileSelect.appendChild(opt);
            renderFileChecklist();
          }
          if (fileSelect.options[0] && fileSelect.options[0].text.includes('Scanning')) {
            fileSelect.remove(0);
            renderFileChecklist();
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

    const onRefreshClick = () => refreshFileList();
    const onApplyRangeClick = () => applyRangeSelection();

    const onDeleteClick = async () => {
      const selectedOptions = Array.from(fileSelect.options).filter((opt) => opt.selected && !opt.text.includes('Scanning') && !opt.text.includes('Disconnected'));
      if (selectedOptions.length === 0) {
        dlStatus.innerText = 'Please select file(s) to delete';
        setDownloadStatus('Please select file(s) to delete');
        return;
      }

      const confirmed = await showConfirm(
        `Delete ${selectedOptions.length} file(s)? This cannot be undone.`,
        {
          title: 'Delete files',
          confirmText: 'Delete',
          cancelText: 'Cancel'
        }
      );
      if (!confirmed) {
        return;
      }

      dlStatus.innerText = `Deleting ${selectedOptions.length} file(s)...`;
      setDownloadStatus(`Deleting ${selectedOptions.length} file(s)...`);
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
          await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between deletions
        } catch (error) {
          console.error(`Error deleting ${filename}:`, error);
        }
      }

      setTimeout(() => {
        refreshFileList();
        dlStatus.innerText = `Deleted ${selectedOptions.length} file(s)`;
        setDownloadStatus(`Deleted ${selectedOptions.length} file(s)`);
        try {
          console.log('[BLE-DEBUG] Delete completed for files:', selectedOptions.map(o => o.value));
        } catch {
          // ignore
        }
      }, 500);
    };

    const onDownloadClick = () => {
      const validOptions = Array.from(fileSelect.options).filter(
        (opt) => !opt.text.includes('Scanning') && !opt.text.includes('Disconnected')
      );
      // Download all mode optionally constrained by date/time range.
      let selectedOptions = [];
      if (dlDownloadAll.checked) {
        selectedOptions = validOptions.filter(isWithinSelectedRange);
      } else {
        // Gather all selected options (multi-select)
        selectedOptions = validOptions.filter((opt) => opt.selected);
      }
      if (selectedOptions.length === 0) {
        const filename = fileSelect.value;
        if (!filename || filename.includes('Scanning')) return;
        selectedOptions.push(fileSelect.options[fileSelect.selectedIndex]);
      }

      // Initialize queue with selected options
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
        ? `Requesting ${filename} (1/${downloadQueue.length})…`
        : 'Requesting...';
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
      // Get all downloaded audio files from ref
      const audioFiles = downloadedFilesRef.current.filter(f => 
        f.filename.match(/\.(wav|mp3|ogg|m4a)$/i)
      );
      
      // Fallback to single file mode if array is empty
      if (audioFiles.length === 0) {
        if (!lastDownloadedBlobRef.current || !lastDownloadedFilenameRef.current) return;
        audioFiles.push({
          blob: lastDownloadedBlobRef.current,
          filename: lastDownloadedFilenameRef.current
        });
      }
      
      if (audioFiles.length === 0) return;
      
      setDownloadTranscribeLoading(true);
      btnTranscribe.disabled = true;
      btnTranscribe.innerText = audioFiles.length > 1 ? `Processing ${audioFiles.length} files…` : 'Processing...';
      
      const totalFiles = audioFiles.length;
      let processedCount = 0;
      let timelineId = null;
      let allEvents = [];
      const errors = [];

      try {
        // Process all files sequentially using the queue
        for (let i = 0; i < audioFiles.length; i++) {
          const file = audioFiles[i];
          processedCount = i + 1;
          
          // Update status to show progress
          if (totalFiles > 1) {
            const statusText = `Processing ${processedCount}/${totalFiles}: ${file.filename}…`;
            dlStatus.innerText = statusText;
            setDownloadStatus(statusText);
            btnTranscribe.innerText = `Processing ${processedCount}/${totalFiles}…`;
          } else {
            const statusText = `Processing: ${file.filename}…`;
            dlStatus.innerText = statusText;
            setDownloadStatus(statusText);
            btnTranscribe.innerText = 'Processing...';
          }

          try {
            let result;
            
            // Determine if we need to create a new timeline or append
            const shouldCreateNewTimeline = (i === 0) || !timelineId;
            
            if (shouldCreateNewTimeline) {
              // Create new timeline (first file or fallback after failure)
              // Use device-provided recording time when available so timeline shows actual recording time
              const recordingTimeISO = file.recordingStartTime || undefined;
              result = await transcribeAudioQueued(file.blob, file.filename, recordingTimeISO);
              timelineId = result.timelineId || 1;
              allEvents = result.events || [];
              
              if (i > 0) {
                console.log(`[Frontend] First file failed, created new timeline ${timelineId} for file ${i + 1}`);
              }
            } else {
              // Append to existing timeline (preserve per-file recording time when available)
              const recordingTimeISO = file.recordingStartTime || undefined;
              result = await appendAudioQueued(timelineId, file.blob, file.filename, recordingTimeISO);
              // In mockData fallback mode the backend may create a new timelineId;
              // update the frontend timelineId so we cache & navigate the correct timeline.
              if (result?.timelineId) {
                timelineId = result.timelineId;
              }
              // Append returns updated events array
              allEvents = result.events || allEvents;
            }
            
            // Update timeline cache after each successful transcription
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
            
            // If this was supposed to be the first file and it failed, log it
            if (i === 0) {
              console.warn(`[Frontend] First file failed, will try to create timeline with next file`);
            }
          }
        }

        // Final status and navigation - wait until ALL files are processed
        const successCount = totalFiles - errors.length;
        
        if (errors.length === 0) {
          // All succeeded
          if (totalFiles > 1) {
            const statusText = `Done — ${totalFiles} files transcribed and queued. Opening timeline…`;
            dlStatus.innerText = statusText;
            setDownloadStatus(statusText);
          } else {
            const statusText = 'Done — opening timeline';
            dlStatus.innerText = statusText;
            setDownloadStatus(statusText);
          }
          
          // Navigate to the timeline with all events
          if (timelineId) {
            // Clear downloaded files after successful transcription
            downloadedFilesRef.current = [];
            navigate(`/timeline/${timelineId}`);
          } else {
            dlStatus.innerText = 'Error: Timeline was not created';
            setDownloadStatus('Error: Timeline was not created');
          }
        } else if (successCount > 0 && timelineId) {
          // Some succeeded, some failed - but we have a timeline
          const errorSummary = errors.length === 1 
            ? `1 file failed (${errors[0].file})`
            : `${errors.length} files failed`;
          const statusText = `Partial success: ${successCount}/${totalFiles} processed. ${errorSummary}. Opening timeline…`;
          dlStatus.innerText = statusText;
          setDownloadStatus(statusText);
          // Clear successfully processed files (keep failed ones for retry if needed)
          downloadedFilesRef.current = downloadedFilesRef.current.filter(f => 
            errors.some(e => e.file === f.filename)
          );
          navigate(`/timeline/${timelineId}`);
        } else {
          // All failed or no timeline created
          if (errors.length === totalFiles) {
            const errorMsg = errors.map(e => `${e.file}: ${e.error}`).join('; ');
            const statusText = `Error: All ${totalFiles} files failed. ${errorMsg}`;
            dlStatus.innerText = statusText;
            setDownloadStatus(statusText);
            await showAlert(`Error: All files failed. ${errorMsg}`, 'Transcription failed');
          } else {
            const errorMsg = errors.map(e => `${e.file}: ${e.error}`).join('; ');
            const statusText = `Error: Failed to create timeline. ${errorMsg}`;
            dlStatus.innerText = statusText;
            setDownloadStatus(statusText);
            await showAlert(`Error: Failed to create timeline. ${errorMsg}`, 'Transcription failed');
          }
        }
      } catch (error) {
        console.error('Download transcribe error:', error);
        const errorText = 'Error: ' + (error.message || 'Unknown error');
        dlStatus.innerText = errorText;
        setDownloadStatus(errorText);
        await showAlert('Error transcribing audio: ' + (error.message || 'Unknown error'), 'Transcription error');
      } finally {
        setDownloadTranscribeLoading(false);
        btnTranscribe.disabled = false;
        
        // Update button text based on remaining files
        const remainingAudioFiles = downloadedFilesRef.current.filter(f => 
          f.filename.match(/\.(wav|mp3|ogg|m4a)$/i)
        );
        if (remainingAudioFiles.length > 1) {
          btnTranscribe.innerText = `TRANSCRIBE ${remainingAudioFiles.length} FILES`;
        } else if (remainingAudioFiles.length === 1) {
          btnTranscribe.innerText = 'TRANSCRIBE';
        } else {
          btnTranscribe.innerText = 'TRANSCRIBE';
          btnTranscribe.style.display = 'none';
        }
      }
    };

    ble.setDataHandler(handleIncomingData);

    btnRefresh.addEventListener('click', onRefreshClick);
    btnApplyRange.addEventListener('click', onApplyRangeClick);
    btnDownload.addEventListener('click', onDownloadClick);
    btnDelete.addEventListener('click', onDeleteClick);
    fileInput.addEventListener('change', onFileChange);
    btnStartUpload.addEventListener('click', onStartUploadClick);
    btnStopUpload.addEventListener('click', onStopUploadClick);
    btnTranscribe.addEventListener('click', onTranscribeClick);

    btnTranscribe.style.display = 'none';
    renderFileChecklist();

    return () => {
      ble.setDataHandler(null);
      try {
        btnRefresh.removeEventListener('click', onRefreshClick);
        btnApplyRange.removeEventListener('click', onApplyRangeClick);
        btnDownload.removeEventListener('click', onDownloadClick);
        btnDelete.removeEventListener('click', onDeleteClick);
        fileInput.removeEventListener('change', onFileChange);
        btnStartUpload.removeEventListener('click', onStartUploadClick);
        btnStopUpload.removeEventListener('click', onStopUploadClick);
        btnTranscribe.removeEventListener('click', onTranscribeClick);
      } catch {
        // ignore
      }
    };
  }, [ble, navigate, showAlert, showConfirm]);

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
          Device: <span>{ble.connectionStatus}</span>
          <br />
          Bluetooth: <span>{ble.deviceName}</span>
        </div>
        <div className="menu-item active">Home</div>
        <div className="menu-item" onClick={() => navigate('/menu')}>
          Main Menu →
        </div>
        <div className="menu-item" onClick={() => navigate(user ? '/account' : '/login')}>
          {user ? 'Account →' : 'Login / Register →'}
        </div>
        <div className="user-panel">
          <div className="avatar-circle">
            {user?.username ? user.username.charAt(0).toUpperCase() : '👤'}
          </div>
          <div className="username">{user?.username || 'guest'}</div>
          {user && (
            <div
              className="logout-link"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              Logout
            </div>
          )}
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

          <div className="card connect-card">
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
                <div
                  className="device-list"
                  style={ble.isConnected ? { color: '#4ade80' } : undefined}
                >
                  {ble.isConnected ? `Active: ${ble.deviceName}` : 'Not Connected'}
                </div>
                <div className="connection-actions">
                  <button
                    type="button"
                    className="btn btn-orange"
                    style={{ display: ble.isConnected ? 'none' : 'inline-block' }}
                    disabled={!ble.isBleSupported}
                    onClick={() => void ble.connect()}
                  >
                    {ble.isBleSupported ? 'SCAN & CONNECT' : 'UNSUPPORTED BROWSER'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-red"
                    style={{ display: ble.isConnected ? 'inline-block' : 'none' }}
                    onClick={() => ble.disconnect()}
                  >
                    DISCONNECT
                  </button>
                </div>
                <div className="hint">
                  {ble.isBleSupported
                    ? 'Tip: Web Bluetooth works best on Chrome/Edge over HTTPS or localhost.'
                    : ble.bleSupportMessage}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card bottom-row">
          <div className="card-header">
            <div className="icon-box red-icon">⬇</div>
            <div>
              <h3>Download Files</h3>
              <p className="subtext">Download and transcribe by date/time range or all files</p>
            </div>
          </div>
          <div className="info-line" id="dlStatus">
            Status: Idle
          </div>
          <div className="download-filter-row">
            <label className="download-filter-label" htmlFor="dlRangeStart">From</label>
            <input id="dlRangeStart" type="datetime-local" className="download-filter-input" />
            <label className="download-filter-label" htmlFor="dlRangeEnd">To</label>
            <input id="dlRangeEnd" type="datetime-local" className="download-filter-input" />
            <button className="btn btn-blue" id="btnApplyRange" type="button">
              SELECT RANGE
            </button>
          </div>
          <div className="download-filter-options">
            <label className="download-all-toggle">
              <input id="dlDownloadAll" type="checkbox" />
              Download all files (respecting selected range)
            </label>
            <div className="hint" id="dlRangeStatus">Range: All files</div>
          </div>
          <div className="control-group">
            <select id="fileSelect" multiple className="download-file-select-hidden">
              <option>Disconnected</option>
            </select>
            <div id="fileChecklist" className="file-checklist"></div>
            <button className="btn btn-blue" id="btnRefresh" disabled title="Refresh list">
              ↻
            </button>
            <button className="btn btn-green" id="btnDownload" disabled>
              DOWNLOAD
            </button>
            <button className="btn btn-red" id="btnDelete" disabled>
              DELETE
            </button>
            <button className="btn btn-orange" id="btnTranscribe" style={{ display: 'none' }}>
              TRANSCRIBE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
