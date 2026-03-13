// CEG491X-Capstone/echolog-webapp/backend/src/routes/audio.js
// Routes for handling audio upload, filtering, transcription, and playback.
// Supports both mockData (in‑memory) and SQLite database (via models).
// Includes debugging helpers for file existence tracking.

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { exec } = require('child_process');
const util = require('util');

// NEW: Import config and Bull queue
const config = require('../config');
const transcriptionQueue = require('../jobs/transcriptionQueue');

const execPromise = util.promisify(exec);

// Use config for upload paths (relative to backend root)
const uploadsDir = path.join(__dirname, '../../uploads');
const filteredDir = path.join(__dirname, '../../uploads/filtered');

// Ensure directories exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`[AUDIO-DEBUG] Created uploads directory: ${uploadsDir}`);
}
if (!fs.existsSync(filteredDir)) {
  fs.mkdirSync(filteredDir, { recursive: true });
  console.log(`[AUDIO-DEBUG] Created filtered directory: ${filteredDir}`);
}

/** Debug helper: Check file existence and log details */
function debugFileExists(filePath, context) {
  const exists = fs.existsSync(filePath);
  const absPath = path.resolve(filePath);
  const timestamp = new Date().toISOString();
  
  if (exists) {
    try {
      const stats = fs.statSync(filePath);
      console.log(`[AUDIO-DEBUG] ✅ FILE EXISTS [${context}] ${timestamp}`);
      console.log(`[AUDIO-DEBUG]   Path: ${absPath}`);
      console.log(`[AUDIO-DEBUG]   Size: ${stats.size} bytes`);
      console.log(`[AUDIO-DEBUG]   Modified: ${stats.mtime.toISOString()}`);
    } catch (statErr) {
      console.log(`[AUDIO-DEBUG] ⚠️ FILE EXISTS but stat failed [${context}] ${timestamp}`);
      console.log(`[AUDIO-DEBUG]   Path: ${absPath}`);
      console.log(`[AUDIO-DEBUG]   Error: ${statErr.message}`);
    }
  } else {
    console.log(`[AUDIO-DEBUG] ❌ FILE MISSING [${context}] ${timestamp}`);
    console.log(`[AUDIO-DEBUG]   Expected path: ${absPath}`);
    console.log(`[AUDIO-DEBUG]   Relative path: ${filePath}`);
    
    const parentDir = path.dirname(absPath);
    if (fs.existsSync(parentDir)) {
      console.log(`[AUDIO-DEBUG]   Parent directory exists: ${parentDir}`);
      try {
        const files = fs.readdirSync(parentDir);
        console.log(`[AUDIO-DEBUG]   Files in parent: ${files.slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}`);
      } catch (readErr) {
        console.log(`[AUDIO-DEBUG]   Cannot read parent directory: ${readErr.message}`);
      }
    } else {
      console.log(`[AUDIO-DEBUG]   Parent directory missing: ${parentDir}`);
    }
  }
  
  return exists;
}

/** Resolve Python command: use config.pythonCmd if set, else first of python/python3/py -3 that runs. */
async function getPythonCommand() {
  if (config.pythonCmd) { // UPDATED: use config
    return config.pythonCmd.trim();
  }
  const candidates = ['python', 'python3', 'py -3'];
  for (const cmd of candidates) {
    try {
      await execPromise(`${cmd} -c "import sys"`, { timeout: 5000 });
      return cmd;
    } catch (e) {
      // try next
    }
  }
  return 'python3';
}

/**
 * Run filter then transcribe on an audio file. Returns segments + metadata.
 * @param {string} inputPath - Absolute path to audio file
 * @param {string} pythonCmd - Python command (e.g. 'python3' or 'py -3')
 * @param {string} [model] - Whisper model (default from config.whisperModel)
 * @returns {{ segments: Array<{start, end, text}>, text: string, language: string, filteredAudioPath: string }}
 */

async function runFilterAndTranscribePipeline(inputPath, pythonCmd, model) {
  const filterScript = path.join(__dirname, '../../scripts/filter_audio.py');
  const transcribeScript = path.join(__dirname, '../../scripts/transcribe_audio.py');
  const chosenModel = model || config.whisperModel; // UPDATED: use config
  
  const pipelineStartTime = new Date().toISOString();
  console.log(`[AUDIO-DEBUG] 🔄 PIPELINE START [${pipelineStartTime}]`);
  console.log(`[AUDIO-DEBUG]   Input file: ${inputPath}`);
  console.log(`[AUDIO-DEBUG]   Python cmd: ${pythonCmd}`);
  console.log(`[AUDIO-DEBUG]   Whisper model: ${chosenModel}`);
  
  // Verify input file exists
  debugFileExists(inputPath, 'PIPELINE-INPUT');

  let filteredAudioPath = inputPath;
  if (fs.existsSync(filterScript)) {
    const outputFile = path.join(filteredDir, `filtered-${Date.now()}.wav`);
    console.log(`[AUDIO-DEBUG] 🎚️ FILTERING START`);
    console.log(`[AUDIO-DEBUG]   Output file: ${outputFile}`);
    try {
      await execPromise(`${pythonCmd} "${filterScript}" "${inputPath}" "${outputFile}" 400 3 lowpass`);
      console.log(`[AUDIO-DEBUG] 🎚️ FILTERING COMPLETE`);
      
      if (fs.existsSync(outputFile)) {
        filteredAudioPath = outputFile;
        debugFileExists(filteredAudioPath, 'FILTERED-OUTPUT');
        console.log(`[AUDIO-DEBUG] ✅ Using filtered audio: ${filteredAudioPath}`);
      } else {
        console.log(`[AUDIO-DEBUG] ⚠️ Filtered file not created, using original: ${inputPath}`);
        debugFileExists(outputFile, 'FILTERED-OUTPUT-MISSING');
      }
    } catch (err) {
      console.log(`[AUDIO-DEBUG] ⚠️ FILTERING FAILED: ${err.message}`);
      console.log(`[AUDIO-DEBUG]   Using original input: ${inputPath}`);
    }
  } else {
    console.log(`[AUDIO-DEBUG] ⚠️ Filter script not found: ${filterScript}`);
    console.log(`[AUDIO-DEBUG]   Using original input: ${inputPath}`);
  }

  // Verify filtered audio exists before transcription
  debugFileExists(filteredAudioPath, 'PRE-TRANSCRIBE');
  
  let segments = [];
  let text = '';
  let language = '';
  if (fs.existsSync(transcribeScript)) {
    const transcriptionJsonPath = filteredAudioPath.replace(/\.[^.]+$/, '.transcription.json');
    console.log(`[AUDIO-DEBUG] 📝 TRANSCRIBING START`);
    console.log(`[AUDIO-DEBUG]   Audio file: ${filteredAudioPath}`);
    console.log(`[AUDIO-DEBUG]   JSON output: ${transcriptionJsonPath}`);
    
    try {
      const { stdout } = await execPromise(
        `${pythonCmd} "${transcribeScript}" "${filteredAudioPath}" --model ${chosenModel} --output_json "${transcriptionJsonPath}"`
      );
      console.log(`[AUDIO-DEBUG] 📝 TRANSCRIBING COMPLETE`);
      
      const raw = (stdout && typeof stdout === 'string') ? stdout.trim() : '';
      let parsed = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch (parseErr) {
        console.log(`[AUDIO-DEBUG] ⚠️ Transcription output not JSON: ${parseErr.message}`);
        console.log(`[AUDIO-DEBUG]   Raw output (first 200 chars): ${raw ? raw.slice(0, 200) : '(empty)'}`);
      }
      if (parsed && typeof parsed === 'object') {
        segments = Array.isArray(parsed.segments) ? parsed.segments : [];
        text = typeof parsed.text === 'string' ? parsed.text : '';
        language = typeof parsed.language === 'string' ? parsed.language : '';
        console.log(`[AUDIO-DEBUG] ✅ Transcription parsed: ${segments.length} segments, language: ${language || 'unknown'}`);
        if (parsed.error) {
          console.log(`[AUDIO-DEBUG] ⚠️ Transcription script error: ${parsed.error}`);
        }
        if (text && segments.length === 0) {
          segments = [{ start: 0, end: 0, text }];
        }
      }
      if (segments.length === 0) {
        console.log(`[AUDIO-DEBUG] ⚠️ No segments found, using fallback`);
        segments = [{ start: 0, end: 0, text: 'Transcription unavailable.' }];
      }
    } catch (err) {
      console.log(`[AUDIO-DEBUG] ❌ TRANSCRIPTION FAILED: ${err.message}`);
      console.log(`[AUDIO-DEBUG]   Stack: ${err.stack}`);
      segments = [{ start: 0, end: 0, text: 'Transcription unavailable.' }];
    }
  } else {
    console.log(`[AUDIO-DEBUG] ❌ Transcription script not found: ${transcribeScript}`);
    segments = [{ start: 0, end: 0, text: 'Transcription script not found.' }];
  }
  
  const finalCheck = debugFileExists(filteredAudioPath, 'PIPELINE-END');
  if (!finalCheck) {
    console.log(`[AUDIO-DEBUG] ⚠️⚠️⚠️ CRITICAL: Audio file missing at pipeline end!`);
    console.log(`[AUDIO-DEBUG]   This file will cause 404 errors when accessed!`);
    console.log(`[AUDIO-DEBUG]   Path: ${path.resolve(filteredAudioPath)}`);
  }
  
  const pipelineEndTime = new Date().toISOString();
  console.log(`[AUDIO-DEBUG] ✅ PIPELINE COMPLETE [${pipelineEndTime}]`);
  console.log(`[AUDIO-DEBUG]   Final audio path: ${filteredAudioPath}`);
  console.log(`[AUDIO-DEBUG]   File exists: ${finalCheck}`);
  
  return { segments, text, language, filteredAudioPath };
}

/** Format a Date as recorded time (HH:MM - when the audio was recorded). */
function formatRecordedTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Build a single event per recording: time = recording start, transcript = full text. */
function eventsWithRecordedTime(segments, baseTime, filteredAudioPath, fullText) {
  const base = baseTime instanceof Date ? baseTime : new Date(baseTime);
  const segs = segments || [];
  const transcript = (typeof fullText === 'string' && fullText.trim() !== '')
    ? fullText.trim()
    : segs.map(s => s.text || '').join(' ').trim() || '';
  const totalDurationSec = segs.length ? Math.max(...segs.map(s => s.end != null ? s.end : 0)) : 0;
  const audioDurationMs = Math.round(totalDurationSec * 1000);
  return [{
    id: 0,
    event_number: 1,
    time: formatRecordedTime(base),
    transcript,
    latitude: null,
    longitude: null,
    audio_file_path: filteredAudioPath,
    audio_duration: audioDurationMs
  }];
}

/** Get recording start time from audio file mtime, or now. */
function getRecordingStartTime(audioPath) {
  try {
    if (audioPath && fs.existsSync(audioPath)) {
      const mtime = fs.statSync(audioPath).mtime;
      console.log(`[AUDIO-DEBUG] 📅 Recording start time from file mtime: ${mtime.toISOString()}`);
      console.log(`[AUDIO-DEBUG]   File: ${audioPath}`);
      return mtime;
    } else {
      console.log(`[AUDIO-DEBUG] ⚠️ Cannot get mtime, file missing: ${audioPath}`);
    }
  } catch (err) {
    console.log(`[AUDIO-DEBUG] ⚠️ Error getting mtime: ${err.message}`);
  }
  const now = new Date();
  console.log(`[AUDIO-DEBUG] 📅 Using current time as recording start: ${now.toISOString()}`);
  return now;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log(`[AUDIO-DEBUG] 📤 UPLOAD DESTINATION`);
    console.log(`[AUDIO-DEBUG]   Directory: ${uploadsDir}`);
    console.log(`[AUDIO-DEBUG]   Original filename: ${file.originalname}`);
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = 'audio-' + uniqueSuffix + path.extname(file.originalname);
    const fullPath = path.join(uploadsDir, filename);
    console.log(`[AUDIO-DEBUG] 📤 UPLOAD FILENAME`);
    console.log(`[AUDIO-DEBUG]   Generated filename: ${filename}`);
    console.log(`[AUDIO-DEBUG]   Full path: ${fullPath}`);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: config.maxFileSize }, // UPDATED: use config
  fileFilter: (req, file, cb) => {
    const allowedTypes = /audio\/(wav|mp3|ogg|m4a)/;
    const ext = (path.extname(file.originalname || '').toLowerCase());
    const audioExt = /\.(wav|mp3|ogg|m4a|bin)$/;
    if (allowedTypes.test(file.mimetype) || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else if (audioExt.test(ext) || !file.mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

// Try to load database models, but don't fail if they don't exist
let Event, Timeline;
try {
  Event = require('../models/Event');
  Timeline = require('../models/Timeline');
} catch (err) {
  console.log('Database models not available for audio routes');
}

// Use mock data based on config.useMockData
const USE_MOCK_DATA = config.useMockData; // UPDATED: use config
let mockData = null;
try {
  if (USE_MOCK_DATA) {
    mockData = require('../data/mockData');
    console.log(`[AUDIO-DEBUG] 📦 MockData loaded for audio routes`);
    console.log(`[AUDIO-DEBUG] ⚠️ WARNING: MockData is in-memory only - data lost on server restart!`);
    console.log(`[AUDIO-DEBUG] 💡 Use database (SQLite) for persistent storage`);
  } else {
    console.log(`[AUDIO-DEBUG] 📦 MockData disabled (USE_MOCK_DATA=false)`);
  }
} catch (err) {
  console.log(`[AUDIO-DEBUG] ❌ mockData not available: ${err.message}`);
}

// Play Recording (serve audio file) - no auth required
// Also supports ?filePath= query parameter for cached timelines
router.get('/:eventId', async (req, res) => {
  // Check if filePath query parameter is provided (for cached timelines)
  if (req.query.filePath) {
    const requestedPath = req.query.filePath;
    console.log(`[AUDIO-DEBUG] 🎵 AUDIO ACCESS via filePath parameter [${new Date().toISOString()}]`);
    console.log(`[AUDIO-DEBUG]   Event ID: ${req.params.eventId}`);
    console.log(`[AUDIO-DEBUG]   Requested file path: ${requestedPath}`);
    
    // Resolve and validate the path
    let filePath;
    try {
      // If it's an absolute path, use it directly
      if (path.isAbsolute(requestedPath)) {
        filePath = path.resolve(requestedPath);
      } else {
        // If relative, resolve from uploads directory
        filePath = path.resolve(uploadsDir, requestedPath);
      }
      
      // Security check: ensure path is within uploads directory
      const uploadsDirResolved = path.resolve(uploadsDir);
      if (!filePath.startsWith(uploadsDirResolved)) {
        console.log(`[AUDIO-DEBUG] ⛔ Security: File path outside uploads directory`);
        return res.status(403).json({ error: 'Invalid file path' });
      }
      
      const fileExists = debugFileExists(filePath, 'FILEPATH-PARAM');
      if (!fileExists) {
        return res.status(404).json({ error: 'Audio file not found' });
      }
      
      // Serve the file
      const ext = path.extname(filePath).toLowerCase();
      const contentTypeMap = {
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4'
      };
      const contentType = contentTypeMap[ext] || 'audio/wav';
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
      res.setHeader('Accept-Ranges', 'bytes');
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      
      fileStream.on('error', (err) => {
        console.error(`[AUDIO-DEBUG] ❌ Error streaming file: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming audio file' });
        }
      });
      
      return;
    } catch (err) {
      console.error(`[AUDIO-DEBUG] ❌ Error processing filePath parameter: ${err.message}`);
      return res.status(400).json({ error: 'Invalid file path' });
    }
  }
  
  // Original event-based lookup continues below...
  const accessTime = new Date().toISOString();
  try {
    const eventId = parseInt(req.params.eventId);
    console.log(`[AUDIO-DEBUG] 🎵 AUDIO ACCESS REQUEST [${accessTime}]`);
    console.log(`[AUDIO-DEBUG]   Event ID: ${eventId}`);
    console.log(`[AUDIO-DEBUG] 📊 Storage availability:`);
    console.log(`[AUDIO-DEBUG]   MockData: ${mockData ? '✅ Available' : '❌ Not available'}`);
    console.log(`[AUDIO-DEBUG]   Database (Event model): ${Event ? '✅ Available' : '❌ Not available'}`);
    console.log(`[AUDIO-DEBUG]   Database (Timeline model): ${Timeline ? '✅ Available' : '❌ Not available'}`);
    
    let event = null;
    let eventSource = 'none';

    // Use mock data if available
    if (mockData) {
      event = mockData.getEventById(eventId);
      if (event) {
        eventSource = 'mockData';
        console.log(`[AUDIO-DEBUG] ✅ Event found in mockData`);
      } else {
        console.log(`[AUDIO-DEBUG] ❌ Event ${eventId} not found in mockData`);
      }
    }

    // Use database if available
    if (!event && Event) {
      try {
        event = await Event.findById(eventId);
        if (event) {
          eventSource = 'database';
          console.log(`[AUDIO-DEBUG] ✅ Event found in database`);
        } else {
          console.log(`[AUDIO-DEBUG] ❌ Event ${eventId} not found in database`);
        }
      } catch (dbErr) {
        console.log(`[AUDIO-DEBUG] ⚠️ Database lookup error: ${dbErr.message}`);
      }
    }

    if (!event) {
      console.log(`[AUDIO-DEBUG] ❌ Event ${eventId} not found in ${eventSource === 'none' ? 'any source' : eventSource}`);
      console.log(`[AUDIO-DEBUG] ⚠️⚠️⚠️ POSSIBLE CAUSES:`);
      console.log(`[AUDIO-DEBUG]   1. Server was restarted - mockData in-memory storage was cleared`);
      console.log(`[AUDIO-DEBUG]   2. Event was never created`);
      console.log(`[AUDIO-DEBUG]   3. Using mockData but event is in database (or vice versa)`);
      console.log(`[AUDIO-DEBUG]   📝 Check server logs for when event ${eventId} was created`);
      console.log(`[AUDIO-DEBUG]   💡 Solution: Use database for persistent storage across restarts`);
      
      // FALLBACK: Try to find audio file even when event is missing (for cached timelines)
      console.log(`[AUDIO-DEBUG] 🔍 FALLBACK: Searching for audio file for event ${eventId}...`);
      
      // Event ID pattern: timelineId * 1000 + (eventNumber - 1)
      // For event 1000: timelineId = 1, eventNumber = 1
      const timelineId = Math.floor(eventId / 1000);
      const eventNumber = (eventId % 1000) + 1;
      
      console.log(`[AUDIO-DEBUG]   Inferred timeline ID: ${timelineId}, event number: ${eventNumber}`);
      
      // Search for audio files in filtered directory (most recent first)
      let foundAudioPath = null;
      try {
        if (fs.existsSync(filteredDir)) {
          const files = fs.readdirSync(filteredDir)
            .filter(f => /\.(wav|mp3|ogg|m4a)$/i.test(f))
            .map(f => ({
              name: f,
              path: path.join(filteredDir, f),
              stats: fs.statSync(path.join(filteredDir, f))
            }))
            .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime()); // Most recent first
          
          console.log(`[AUDIO-DEBUG]   Found ${files.length} audio files in filtered directory`);
          
          if (files.length > 0) {
            foundAudioPath = files[0].path;
            console.log(`[AUDIO-DEBUG]   ✅ Found fallback audio file: ${foundAudioPath}`);
            console.log(`[AUDIO-DEBUG]   File modified: ${files[0].stats.mtime.toISOString()}`);
            console.log(`[AUDIO-DEBUG]   ⚠️ NOTE: This is a best-effort match. For accurate playback,`);
            console.log(`[AUDIO-DEBUG]      frontend should pass audio_file_path via filePath query parameter.`);
            
            if (fs.existsSync(foundAudioPath)) {
              console.log(`[AUDIO-DEBUG]   ✅ Fallback file exists, serving audio`);
              
              event = {
                id: eventId,
                timeline_id: timelineId,
                event_number: eventNumber,
                audio_file_path: foundAudioPath
              };
              eventSource = 'fallback-file-search';
            } else {
              foundAudioPath = null;
            }
          }
        }
      } catch (searchErr) {
        console.log(`[AUDIO-DEBUG]   ⚠️ Error searching for fallback audio: ${searchErr.message}`);
      }
      
      if (!event) {
        console.log(`[AUDIO-DEBUG] ❌ No fallback audio file found for event ${eventId}`);
        return res.status(404).json({ 
          error: 'Event not found',
          message: 'Event was likely lost due to server restart. Audio file may still exist but event metadata is missing.'
        });
      }
    }

    console.log(`[AUDIO-DEBUG] 📋 Event details:`);
    console.log(`[AUDIO-DEBUG]   Event ID: ${event.id}`);
    console.log(`[AUDIO-DEBUG]   Timeline ID: ${event.timeline_id || 'N/A'}`);
    console.log(`[AUDIO-DEBUG]   Event number: ${event.event_number || 'N/A'}`);
    console.log(`[AUDIO-DEBUG]   Source: ${eventSource}`);

    if (!event.audio_file_path) {
      console.log(`[AUDIO-DEBUG] ❌ Event has no audio_file_path property`);
      return res.status(404).json({ error: 'Audio file not found for this event' });
    }

    const filePath = path.resolve(event.audio_file_path);
    console.log(`[AUDIO-DEBUG] 📁 Audio file path:`);
    console.log(`[AUDIO-DEBUG]   Stored path: ${event.audio_file_path}`);
    console.log(`[AUDIO-DEBUG]   Resolved path: ${filePath}`);

    const fileExists = debugFileExists(filePath, `AUDIO-ACCESS-${eventId}`);
    if (!fileExists) {
      console.log(`[AUDIO-DEBUG] ❌❌❌ CRITICAL: Audio file missing for event ${eventId}!`);
      return res.status(404).json({ error: 'Audio file not found on server' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypeMap = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4'
    };
    const contentType = contentTypeMap[ext] || 'audio/wav';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    res.setHeader('Accept-Ranges', 'bytes');

    console.log(`[AUDIO-DEBUG] 🎵 Starting audio stream for event ${eventId}`);
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('open', () => {
      console.log(`[AUDIO-DEBUG] ✅ File stream opened for event ${eventId}`);
    });

    fileStream.on('error', (err) => {
      console.error(`[AUDIO-DEBUG] ❌ Error streaming audio file for event ${eventId}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming audio file' });
      }
    });

    fileStream.on('end', () => {
      console.log(`[AUDIO-DEBUG] ✅ File stream completed for event ${eventId}`);
    });
  } catch (error) {
    console.error(`[AUDIO-DEBUG] ❌ Play recording error for event ${req.params.eventId}:`, error);
    res.status(500).json({ error: 'Error playing recording' });
  }
});

// Filter and transcribe audio - no auth required
router.post('/filter-and-transcribe', (req, res, next) => {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large (max ' + config.maxFileSize + ' bytes)' });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, async (req, res) => {
  const transcriptionStartTime = new Date().toISOString();
  try {
    req.setTimeout(600000);
    res.setTimeout(600000);

    console.log(`[AUDIO-DEBUG] 🎤 TRANSCRIPTION REQUEST START [${transcriptionStartTime}]`);

    if (!req.file) {
      console.log(`[AUDIO-DEBUG] ❌ No audio file provided in request`);
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const inputFile = req.file.path;
    console.log(`[AUDIO-DEBUG] 📤 Upload received:`);
    console.log(`[AUDIO-DEBUG]   Original name: ${req.file.originalname}`);
    console.log(`[AUDIO-DEBUG]   Saved path: ${inputFile}`);
    console.log(`[AUDIO-DEBUG]   Size: ${req.file.size} bytes`);
    
    debugFileExists(inputFile, 'UPLOAD-RECEIVED');
    
    let pythonCmd;
    try {
      pythonCmd = await getPythonCommand();
      console.log(`[AUDIO-DEBUG] ✅ Python command resolved: ${pythonCmd}`);
    } catch (pyErr) {
      console.error(`[AUDIO-DEBUG] ❌ getPythonCommand failed:`, pyErr);
      return res.status(500).json({ error: 'Python not available. Set ECHOLOG_PYTHON or install Python.' });
    }
    
    const { segments, text: fullText, filteredAudioPath } = await runFilterAndTranscribePipeline(inputFile, pythonCmd, config.whisperModel);
    const recordingStartTime = getRecordingStartTime(filteredAudioPath);
    
    console.log(`[AUDIO-DEBUG] 📝 Transcription complete, preparing to attach audio:`);
    console.log(`[AUDIO-DEBUG]   Filtered audio path: ${filteredAudioPath}`);
    console.log(`[AUDIO-DEBUG]   Segments count: ${segments.length}`);

    // Use mock data if available
    if (mockData && typeof mockData.addTranscriptionTimeline === 'function') {
      try {
        console.log(`[AUDIO-DEBUG] 💾 Saving to mockData...`);
        console.log(`[AUDIO-DEBUG]   Audio path to save: ${filteredAudioPath}`);
        
        const existsBeforeSave = debugFileExists(filteredAudioPath, 'BEFORE-MOCK-SAVE');
        if (!existsBeforeSave) {
          console.log(`[AUDIO-DEBUG] ⚠️⚠️⚠️ WARNING: Audio file missing before saving to mockData!`);
        }
        
        const timelineId = mockData.addTranscriptionTimeline(segments, filteredAudioPath, recordingStartTime);
        const events = mockData.getEvents(timelineId);
        const timeline = mockData.getTimeline(timelineId);
        
        console.log(`[AUDIO-DEBUG] ✅ MockData timeline created: ${timelineId}`);
        console.log(`[AUDIO-DEBUG]   Events count: ${events.length}`);
        
        events.forEach((ev, idx) => {
          console.log(`[AUDIO-DEBUG]   Event ${idx + 1} (ID: ${ev.id}):`);
          console.log(`[AUDIO-DEBUG]     Audio path: ${ev.audio_file_path || 'MISSING'}`);
          if (ev.audio_file_path) {
            debugFileExists(ev.audio_file_path, `EVENT-${ev.id}-AUDIO`);
          }
        });
        
        if (!Event || !Timeline) {
          console.log(`[AUDIO-DEBUG] ⚠️⚠️⚠️ PERSISTENCE WARNING:`);
          console.log(`[AUDIO-DEBUG]   Using mockData (in-memory) - data will be lost on server restart!`);
        }
        
        return res.json({
          message: 'Audio filtered and transcribed',
          timelineId,
          recording_start_time: recordingStartTime.toISOString(),
          events,
          timeline,
          ...(Event && Timeline ? {} : { 
            warning: 'Using in-memory storage - data will be lost on server restart. Enable database for persistence.' 
          })
        });
      } catch (addErr) {
        console.error(`[AUDIO-DEBUG] ❌ addTranscriptionTimeline failed:`, addErr);
        return res.status(500).json({ error: addErr.message || 'Failed to create timeline.' });
      }
    }

    // Database path: only write to DB when user is logged in (user_id is NOT NULL)
    if (!Event || !Timeline) {
      const draftId = 'draft-' + Date.now();
      return res.json({
        message: 'Audio processed (mock mode)',
        timelineId: draftId,
        recording_start_time: recordingStartTime.toISOString(),
        events: eventsWithRecordedTime(segments, recordingStartTime, filteredAudioPath, fullText)
      });
    }

    if (!req.user) {
      const draftId = 'draft-' + Date.now();
      return res.json({
        message: 'Audio filtered and transcribed. Log in and use "Save to database" on the timeline to store it.',
        timelineId: draftId,
        recording_start_time: recordingStartTime.toISOString(),
        events: eventsWithRecordedTime(segments, recordingStartTime, filteredAudioPath, fullText)
      });
    }

    try {
      console.log(`[AUDIO-DEBUG] 💾 Saving to database...`);
      console.log(`[AUDIO-DEBUG]   User ID: ${req.user.id}`);
      console.log(`[AUDIO-DEBUG]   Audio path to save: ${filteredAudioPath}`);
      
      const existsBeforeDbSave = debugFileExists(filteredAudioPath, 'BEFORE-DB-SAVE');
      if (!existsBeforeDbSave) {
        console.log(`[AUDIO-DEBUG] ⚠️⚠️⚠️ WARNING: Audio file missing before saving to database!`);
      }
      
      const timeline = await Timeline.create(req.user.id, null);
      const [singleEvent] = eventsWithRecordedTime(segments, recordingStartTime, filteredAudioPath, fullText);
      
      console.log(`[AUDIO-DEBUG] 📋 Creating event in database:`);
      console.log(`[AUDIO-DEBUG]   Timeline ID: ${timeline.id}`);
      console.log(`[AUDIO-DEBUG]   Event number: ${singleEvent.event_number}`);
      console.log(`[AUDIO-DEBUG]   Audio path: ${singleEvent.audio_file_path}`);
      
      const createdEvent = await Event.create(timeline.id, {
        eventNumber: singleEvent.event_number,
        time: singleEvent.time,
        transcript: singleEvent.transcript,
        latitude: null,
        longitude: null,
        audioFilePath: filteredAudioPath,
        audioDuration: singleEvent.audio_duration
      });
      
      console.log(`[AUDIO-DEBUG] ✅ Event created in database:`);
      console.log(`[AUDIO-DEBUG]   Event ID: ${createdEvent.id}`);
      
      debugFileExists(filteredAudioPath, 'AFTER-DB-SAVE');
      
      return res.json({
        message: 'Audio filtered and transcribed successfully',
        timelineId: timeline.id,
        recording_start_time: recordingStartTime.toISOString(),
        events: eventsWithRecordedTime(segments, recordingStartTime, filteredAudioPath, fullText)
      });
    } catch (dbErr) {
      console.error(`[AUDIO-DEBUG] ❌ Database save failed:`, dbErr);
      
      debugFileExists(filteredAudioPath, 'AFTER-DB-ERROR');
      
      const draftId = 'draft-' + Date.now();
      return res.json({
        message: 'Audio transcribed. Database unavailable; timeline saved locally. Log in and use "Save to database" to retry.',
        timelineId: draftId,
        recording_start_time: recordingStartTime.toISOString(),
        events: eventsWithRecordedTime(segments, recordingStartTime, filteredAudioPath, fullText)
      });
    }
  } catch (error) {
    console.error(`[AUDIO-DEBUG] ❌❌❌ FILTER AND TRANSCRIBE ERROR [${new Date().toISOString()}]:`, error);
    
    if (req.file && req.file.path) {
      console.log(`[AUDIO-DEBUG] 📁 Error cleanup - checking uploaded file:`);
      debugFileExists(req.file.path, 'ERROR-UPLOADED-FILE');
      
      if (fs.existsSync(req.file.path)) {
        try {
          console.log(`[AUDIO-DEBUG] 🗑️ Deleting uploaded file due to error: ${req.file.path}`);
          fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.log(`[AUDIO-DEBUG] ⚠️ Failed to delete uploaded file: ${unlinkErr.message}`);
        }
      }
    }
    
    const message = (error && error.message) ? String(error.message) : 'Error processing audio';
    if (!res.headersSent) {
      try {
        res.status(500).json({ 
          error: message,
          details: config.nodeEnv === 'development' ? error.stack : undefined // UPDATED: use config
        });
      } catch (sendErr) {
        console.error(`[AUDIO-DEBUG] ❌ Failed to send error response: ${sendErr.message}`);
      }
    }
  }
});

// Append a new recording to an existing timeline
router.post('/append/:timelineId', (req, res, next) => {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large (max ' + config.maxFileSize + ' bytes)' });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, async (req, res) => {
  const appendStartTime = new Date().toISOString();
  
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=600');
  
  try {
    req.setTimeout(600000);
    res.setTimeout(600000);
  } catch (timeoutErr) {
    console.error(`[AUDIO-DEBUG] ⚠️ Failed to set timeout: ${timeoutErr.message}`);
  }
  
  let responseSent = false;
  const sendResponse = (statusCode, data) => {
    if (responseSent) return;
    responseSent = true;
    if (!res.headersSent) {
      res.status(statusCode).json(data);
    }
  };
  
  try {
    const timelineId = parseInt(req.params.timelineId, 10);
    console.log(`[AUDIO-DEBUG] ➕ APPEND REQUEST START [${appendStartTime}]`);
    console.log(`[AUDIO-DEBUG]   Timeline ID: ${timelineId}`);
    
    if (!Number.isFinite(timelineId)) {
      console.log(`[AUDIO-DEBUG] ❌ Invalid timeline ID: ${req.params.timelineId}`);
      sendResponse(400, { error: 'Invalid timeline id' });
      return;
    }

    if (!req.file) {
      console.log(`[AUDIO-DEBUG] ❌ No audio file provided in append request`);
      sendResponse(400, { error: 'No audio file provided' });
      return;
    }

    const inputFile = req.file.path;
    console.log(`[AUDIO-DEBUG] 📤 Append upload received: ${inputFile}`);
    debugFileExists(inputFile, 'APPEND-UPLOAD-RECEIVED');

    let pythonCmd;
    try {
      pythonCmd = await getPythonCommand();
    } catch (pyErr) {
      console.error(`[AUDIO-DEBUG] ❌ getPythonCommand failed (append):`, pyErr);
      sendResponse(500, { error: 'Python not available. Set ECHOLOG_PYTHON or install Python.' });
      return;
    }

    const { segments, text: fullText, filteredAudioPath } = await runFilterAndTranscribePipeline(inputFile, pythonCmd, config.whisperModel);
    const recordingStartTime = getRecordingStartTime(filteredAudioPath);
    
    console.log(`[AUDIO-DEBUG] 📝 Append transcription complete: ${filteredAudioPath}`);

    // Mock-data path
    if (mockData && typeof mockData.appendTranscriptionEvent === 'function') {
      try {
        console.log(`[AUDIO-DEBUG] 💾 Appending to mockData timeline ${timelineId}...`);
        console.log(`[AUDIO-DEBUG]   Audio path to save: ${filteredAudioPath}`);
        
        const existingTimeline = mockData.getTimeline(timelineId);
        if (!existingTimeline) {
          console.log(`[AUDIO-DEBUG] ❌ Timeline ${timelineId} not found in mockData`);
          console.log(`[AUDIO-DEBUG]   Creating a new timeline instead...`);
          
          const newTimelineId = mockData.addTranscriptionTimeline(segments, filteredAudioPath, recordingStartTime);
          const events = mockData.getEvents(newTimelineId);
          
          sendResponse(200, {
            message: 'Timeline not found, created new timeline (mock)',
            timelineId: newTimelineId,
            recording_start_time: recordingStartTime.toISOString(),
            events,
            warning: `Original timeline ${timelineId} was not found (likely due to server restart). Created new timeline ${newTimelineId}.`
          });
          return;
        }
        
        const existsBeforeAppend = debugFileExists(filteredAudioPath, 'BEFORE-APPEND-MOCK-SAVE');
        if (!existsBeforeAppend) {
          console.log(`[AUDIO-DEBUG] ⚠️⚠️⚠️ WARNING: Audio file missing before appending to mockData!`);
        }
        
        const events = mockData.appendTranscriptionEvent(timelineId, segments, filteredAudioPath, recordingStartTime);
        
        sendResponse(200, {
          message: 'Recording added to timeline (mock)',
          timelineId,
          recording_start_time: recordingStartTime.toISOString(),
          events
        });
        return;
      } catch (mockErr) {
        console.error(`[AUDIO-DEBUG] ❌ appendTranscriptionEvent failed:`, mockErr);
        sendResponse(500, { error: mockErr.message || 'Failed to append event.' });
        return;
      }
    }

    // Database path
    if (!Event || !Timeline) {
      sendResponse(500, { error: 'Database models not available for append.' });
      return;
    }

    const timeline = await Timeline.findById(timelineId);
    if (!timeline) {
      sendResponse(404, { error: 'Timeline not found' });
      return;
    }

    if (req.user && timeline.user_id !== req.user.id) {
      sendResponse(403, { error: 'Access denied' });
      return;
    }

    console.log(`[AUDIO-DEBUG] 💾 Appending to database timeline ${timelineId}...`);
    const existsBeforeDbAppend = debugFileExists(filteredAudioPath, 'BEFORE-APPEND-DB-SAVE');
    if (!existsBeforeDbAppend) {
      console.log(`[AUDIO-DEBUG] ⚠️⚠️⚠️ WARNING: Audio file missing before appending to database!`);
    }
    
    const [singleEvent] = eventsWithRecordedTime(segments, recordingStartTime, filteredAudioPath, fullText);
    const existingEvents = await Event.findByTimelineId(timelineId);
    const nextEventNumber = existingEvents.length
      ? Math.max(...existingEvents.map((e) => e.event_number || 0)) + 1
      : 1;

    console.log(`[AUDIO-DEBUG] 📋 Creating event in database: event number ${nextEventNumber}`);
    
    const createdEvent = await Event.create(timelineId, {
      eventNumber: nextEventNumber,
      time: singleEvent.time,
      transcript: singleEvent.transcript,
      latitude: null,
      longitude: null,
      audioFilePath: filteredAudioPath,
      audioDuration: singleEvent.audio_duration
    });
    
    console.log(`[AUDIO-DEBUG] ✅ Event created in database: ID ${createdEvent.id}`);
    debugFileExists(filteredAudioPath, 'AFTER-APPEND-DB-SAVE');

    const updatedEvents = await Event.findByTimelineId(timelineId);
    sendResponse(200, {
      message: 'Recording added to timeline',
      timelineId,
      recording_start_time: timeline.recording_start_time || recordingStartTime.toISOString(),
      events: updatedEvents
    });
    return;
  } catch (error) {
    console.error(`[AUDIO-DEBUG] ❌❌❌ APPEND RECORDING ERROR:`, error);
    if (req.file && req.file.path) {
      debugFileExists(req.file.path, 'APPEND-ERROR-UPLOADED-FILE');
    }
    sendResponse(500, { 
      error: error.message || 'Failed to append recording',
      details: config.nodeEnv === 'development' ? error.stack : undefined // UPDATED: use config
    });
  }
});

// NEW: Background transcription endpoint
// Upload audio and start a job, returns job ID
router.post('/transcribe-job', (req, res, next) => {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large (max ' + config.maxFileSize + ' bytes)' });
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

    const inputFile = req.file.path;
    console.log(`[QUEUE] Upload received: ${inputFile}`);

    // Resolve Python command and model
    const pythonCmd = await getPythonCommand();
    const model = config.whisperModel; // UPDATED: use config

    // Create a Bull job
    const job = await transcriptionQueue.add({
      inputPath: inputFile,
      originalFilename: req.file.originalname,
      userId: req.user ? req.user.id : null, // if authenticated
      pythonCmd,
      model
    }, {
      attempts: 2,
      backoff: 5000,
      timeout: 600000
    });

    console.log(`[QUEUE] Job created with ID: ${job.id}`);

    res.json({
      success: true,
      jobId: job.id,
      message: 'Transcription job queued. Check status at /api/audio/job-status/:jobId'
    });
  } catch (error) {
    console.error('[QUEUE] Error creating job:', error);
    res.status(500).json({ error: 'Failed to queue transcription' });
  }
});

// NEW: Check job status and get result (if completed)
router.get('/job-status/:jobId', async (req, res) => {
  const jobId = req.params.jobId;
  const job = await transcriptionQueue.getJob(jobId);

  if (!job) return res.status(404).json({ error: 'Job not found' });

  const state = await job.getState();

  if (state === 'completed') {
    const result = job.returnvalue;
    return res.json({ status: 'completed', result });
  } else if (state === 'failed') {
    return res.json({ status: 'failed', error: job.failedReason });
  } else {
    return res.json({ status: state }); // waiting, active, delayed
  }
});

module.exports = router;
// ADD THIS LINE BELOW IT:
module.exports.runFilterAndTranscribePipeline = runFilterAndTranscribePipeline;