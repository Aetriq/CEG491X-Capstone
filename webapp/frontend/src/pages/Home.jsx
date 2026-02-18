import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

// Global transcription queue so multiple audio files are processed sequentially
let transcriptionQueue = Promise.resolve(null);

async function transcribeAudioQueued(audioFile, filename) {
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

      const response = await fetch('/api/audio/filter-and-transcribe', {
        method: 'POST',
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

async function appendAudioQueued(timelineId, audioFile, filename) {
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

      let response;
      try {
        // Create abort controller for timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes timeout
        
        response = await fetch(`/api/audio/append/${timelineId}`, {
          method: 'POST',
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
        setLocalUploadStatus(`${files.length} files selected — ${formatBytes(totalSize)} total`);
      }
    } else {
      setLocalUploadFiles([]);
      setLocalUploadStatus('No files selected');
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
      // Process all files sequentially using the queue
      for (let i = 0; i < localUploadFiles.length; i++) {
        const file = localUploadFiles[i];
        processedCount = i + 1;
        
        // Update status to show progress
        if (totalFiles > 1) {
          setLocalUploadStatus(`Processing ${processedCount}/${totalFiles}: ${file.name}…`);
        } else {
          setLocalUploadStatus(`Processing: ${file.name}…`);
        }

        try {
          let result;
          
          // Determine if we need to create a new timeline or append
          // Create new timeline if:
          // 1. This is the first file (i === 0), OR
          // 2. Previous file failed and we don't have a timeline yet
          const shouldCreateNewTimeline = (i === 0) || !timelineId;
          
          if (shouldCreateNewTimeline) {
            // Create new timeline (first file or fallback after failure)
            result = await transcribeAudioQueued(file, file.name);
            timelineId = result.timelineId || 1;
            allEvents = result.events || [];
            
            if (i > 0) {
              console.log(`[Frontend] First file failed, created new timeline ${timelineId} for file ${i + 1}`);
            }
          } else {
            // Append to existing timeline
            result = await appendAudioQueued(timelineId, file, file.name);
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
          console.error(`Error transcribing ${file.name}:`, error);
          const errorMessage = error.message || 'Unknown error';
          errors.push({ file: file.name, error: errorMessage });
          
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
          setLocalUploadStatus(`Done — ${totalFiles} files transcribed and queued. Opening timeline…`);
        } else {
          setLocalUploadStatus('Done — opening timeline');
        }
        
        // Navigate to the timeline with all events
        if (timelineId) {
          navigate(`/timeline/${timelineId}`);
        } else {
          setLocalUploadStatus('Error: Timeline was not created');
        }
      } else if (successCount > 0 && timelineId) {
        // Some succeeded, some failed - but we have a timeline
        const errorSummary = errors.length === 1 
          ? `1 file failed (${errors[0].file})`
          : `${errors.length} files failed`;
        setLocalUploadStatus(
          `Partial success: ${successCount}/${totalFiles} processed. ${errorSummary}. Opening timeline…`
        );
        navigate(`/timeline/${timelineId}`);
      } else {
        // All failed or no timeline created
        if (errors.length === totalFiles) {
          const errorMsg = errors.map(e => `${e.file}: ${e.error}`).join('; ');
          setLocalUploadStatus(`Error: All ${totalFiles} files failed. ${errorMsg}`);
        } else {
          setLocalUploadStatus(`Error: Failed to create timeline. ${errors.map(e => `${e.file}: ${e.error}`).join('; ')}`);
        }
      }
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
    const btnTranscribe = document.getElementById('btnTranscribe');

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
      
      // Clear downloaded files on disconnect
      downloadedFilesRef.current = [];
      lastDownloadedBlob = null;
      lastDownloadedFilename = null;
      btnTranscribe.style.display = 'none';
      dlStatus.innerText = 'Status: Disconnected';
      setDownloadStatus('Status: Disconnected');
    }

    function finishDownload() {
      if (!isDownloading) return;
      const blob = new Blob(fileBuffer, { type: 'application/octet-stream' });
      const filename = fileSelect.value || 'download.bin';
      
      // Add to downloaded files array (using ref since we're inside useEffect)
      downloadedFilesRef.current = [...downloadedFilesRef.current, { 
        blob, 
        filename, 
        downloadedAt: new Date().toISOString() 
      }];
      
      // Keep for backward compatibility (single file mode)
      lastDownloadedBlob = blob;
      lastDownloadedFilename = filename;
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
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
      // Get all downloaded audio files from ref
      const audioFiles = downloadedFilesRef.current.filter(f => 
        f.filename.match(/\.(wav|mp3|ogg|m4a)$/i)
      );
      
      // Fallback to single file mode if array is empty
      if (audioFiles.length === 0) {
        if (!lastDownloadedBlob || !lastDownloadedFilename) return;
        audioFiles.push({ blob: lastDownloadedBlob, filename: lastDownloadedFilename });
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
              result = await transcribeAudioQueued(file.blob, file.filename);
              timelineId = result.timelineId || 1;
              allEvents = result.events || [];
              
              if (i > 0) {
                console.log(`[Frontend] First file failed, created new timeline ${timelineId} for file ${i + 1}`);
              }
            } else {
              // Append to existing timeline
              result = await appendAudioQueued(timelineId, file.blob, file.filename);
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
            alert(`Error: All files failed. ${errorMsg}`);
          } else {
            const errorMsg = errors.map(e => `${e.file}: ${e.error}`).join('; ');
            const statusText = `Error: Failed to create timeline. ${errorMsg}`;
            dlStatus.innerText = statusText;
            setDownloadStatus(statusText);
            alert(`Error: Failed to create timeline. ${errorMsg}`);
          }
        }
      } catch (error) {
        console.error('Download transcribe error:', error);
        const errorText = 'Error: ' + (error.message || 'Unknown error');
        dlStatus.innerText = errorText;
        setDownloadStatus(errorText);
        alert('Error transcribing audio: ' + (error.message || 'Unknown error'));
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
              <p className="subtext">Upload one or more audio files from your computer to transcribe and open timeline</p>
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
              SELECT FILES
            </button>
            <button
              type="button"
              className="btn btn-green"
              onClick={onLocalTranscribe}
              disabled={!localUploadFiles || localUploadFiles.length === 0 || localUploadLoading}
            >
              {localUploadLoading 
                ? (localUploadFiles.length > 1 
                    ? `PROCESSING ${localUploadFiles.length} FILES…` 
                    : 'PROCESSING…')
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
