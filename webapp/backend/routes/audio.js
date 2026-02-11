const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

/** Resolve Python command: use ECHOLOG_PYTHON if set, else first of python/python3/py -3 that runs. */
async function getPythonCommand() {
  if (process.env.ECHOLOG_PYTHON) {
    return process.env.ECHOLOG_PYTHON.trim();
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
 * @param {string} [model] - Whisper model (default from WHISPER_MODEL env or 'base')
 * @returns {{ segments: Array<{start, end, text}>, text: string, language: string, filteredAudioPath: string }}
 */
async function runFilterAndTranscribePipeline(inputPath, pythonCmd, model) {
  const filterScript = path.join(__dirname, '../scripts/filter_audio.py');
  const transcribeScript = path.join(__dirname, '../scripts/transcribe_audio.py');
  const chosenModel = model || process.env.WHISPER_MODEL || 'base';

  let filteredAudioPath = inputPath;
  if (fs.existsSync(filterScript)) {
    const outputFile = path.join(filteredDir, `filtered-${Date.now()}.wav`);
    try {
      await execPromise(`${pythonCmd} "${filterScript}" "${inputPath}" "${outputFile}" 400 3 lowpass`);
      if (fs.existsSync(outputFile)) {
        filteredAudioPath = outputFile;
      }
    } catch (err) {
      console.log('Filtering skipped:', err.message);
    }
  }

  let segments = [];
  let text = '';
  let language = '';
  if (fs.existsSync(transcribeScript)) {
    const transcriptionJsonPath = filteredAudioPath.replace(/\.[^.]+$/, '.transcription.json');
    try {
      const { stdout } = await execPromise(
        `${pythonCmd} "${transcribeScript}" "${filteredAudioPath}" --model ${chosenModel} --output_json "${transcriptionJsonPath}"`
      );
      const raw = (stdout && typeof stdout === 'string') ? stdout.trim() : '';
      let parsed = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch (parseErr) {
        console.log('Transcription output not JSON:', parseErr.message, raw ? raw.slice(0, 200) : '(empty)');
      }
      if (parsed && typeof parsed === 'object') {
        segments = Array.isArray(parsed.segments) ? parsed.segments : [];
        text = typeof parsed.text === 'string' ? parsed.text : '';
        language = typeof parsed.language === 'string' ? parsed.language : '';
        if (parsed.error) {
          console.log('Transcription script error:', parsed.error);
        }
        if (text && segments.length === 0) {
          segments = [{ start: 0, end: 0, text }];
        }
      }
      if (segments.length === 0) {
        segments = [{ start: 0, end: 0, text: 'Transcription unavailable.' }];
      }
    } catch (err) {
      console.log('Transcription failed:', err.message);
      segments = [{ start: 0, end: 0, text: 'Transcription unavailable.' }];
    }
  } else {
    segments = [{ start: 0, end: 0, text: 'Transcription script not found.' }];
  }
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
      return fs.statSync(audioPath).mtime;
    }
  } catch (_) {}
  return new Date();
}

// Configure multer for audio file uploads
const uploadsDir = path.join(__dirname, '../uploads');
const filteredDir = path.join(__dirname, '../uploads/filtered');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(filteredDir)) {
  fs.mkdirSync(filteredDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'audio-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
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

// Use mock data when database is not available
const USE_MOCK_DATA = process.env.USE_MOCK_DATA !== 'false';
const mockData = USE_MOCK_DATA ? require('../data/mockData') : null;

// Play Recording (serve audio file) - no auth required
router.get('/:eventId', async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    let event = null;

    // Use mock data if available
    if (mockData) {
      event = mockData.getEventById(eventId);
    } else if (Event) {
      // Use database if available
      event = await Event.findById(eventId);
    }

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check ownership if user is authenticated and using database
    if (Timeline && req.user) {
      const timeline = await Timeline.findById(event.timeline_id);
      if (!timeline || timeline.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    if (!event.audio_file_path) {
      // Return a placeholder response for mock data without audio
      return res.status(404).json({ error: 'Audio file not found for this event' });
    }

    const filePath = path.resolve(event.audio_file_path);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audio file not found on server' });
    }

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypeMap = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4'
    };
    const contentType = contentTypeMap[ext] || 'audio/wav';

    // Set headers for audio streaming
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    res.setHeader('Accept-Ranges', 'bytes');

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (err) => {
      console.error('Error streaming audio file:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming audio file' });
      }
    });
  } catch (error) {
    console.error('Play recording error:', error);
    res.status(500).json({ error: 'Error playing recording' });
  }
});

// Filter and transcribe audio - no auth required
// Pipeline: upload -> filter -> transcribe -> create timeline -> return timelineId
router.post('/filter-and-transcribe', (req, res, next) => {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large (max 100MB)' });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    // Allow up to 10 min for filter + Whisper (CPU transcription can be slow)
    req.setTimeout(600000);
    res.setTimeout(600000);

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const inputFile = req.file.path;
    let pythonCmd;
    try {
      pythonCmd = await getPythonCommand();
    } catch (pyErr) {
      console.error('getPythonCommand failed:', pyErr);
      return res.status(500).json({ error: 'Python not available. Set ECHOLOG_PYTHON or install Python.' });
    }
    const { segments, text: fullText, filteredAudioPath } = await runFilterAndTranscribePipeline(inputFile, pythonCmd);
    const recordingStartTime = getRecordingStartTime(filteredAudioPath);

    const USE_MOCK_DATA = process.env.USE_MOCK_DATA !== 'false';
    let mockData = null;
    try {
      mockData = USE_MOCK_DATA ? require('../data/mockData') : null;
    } catch (requireErr) {
      console.error('mockData require failed:', requireErr);
    }
    if (mockData && typeof mockData.addTranscriptionTimeline === 'function') {
      try {
        const timelineId = mockData.addTranscriptionTimeline(segments, filteredAudioPath, recordingStartTime);
        const events = mockData.getEvents(timelineId);
        const timeline = mockData.getTimeline(timelineId);
        return res.json({
          message: 'Audio filtered and transcribed',
          timelineId,
          recording_start_time: recordingStartTime.toISOString(),
          events,
          timeline
        });
      } catch (addErr) {
        console.error('addTranscriptionTimeline failed:', addErr);
        return res.status(500).json({ error: addErr.message || 'Failed to create timeline.' });
      }
    }

    // Database path: only write to DB when user is logged in (user_id is NOT NULL)
    let TimelineModel, EventModel;
    try {
      TimelineModel = require('../models/Timeline');
      EventModel = require('../models/Event');
    } catch (err) {
      return res.json({
        message: 'Audio processed (mock mode)',
        timelineId: 1,
        recording_start_time: recordingStartTime.toISOString(),
        events: eventsWithRecordedTime(segments, recordingStartTime, filteredAudioPath)
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
      const timeline = await TimelineModel.create(req.user.id, null);
      const [singleEvent] = eventsWithRecordedTime(segments, recordingStartTime, filteredAudioPath, fullText);
      await EventModel.create(timeline.id, {
        eventNumber: singleEvent.event_number,
        time: singleEvent.time,
        transcript: singleEvent.transcript,
        latitude: null,
        longitude: null,
        audioFilePath: filteredAudioPath,
        audioDuration: singleEvent.audio_duration
      });
      return res.json({
        message: 'Audio filtered and transcribed successfully',
        timelineId: timeline.id,
        recording_start_time: recordingStartTime.toISOString(),
        events: eventsWithRecordedTime(segments, recordingStartTime, filteredAudioPath, fullText)
      });
    } catch (dbErr) {
      console.error('Database save failed, returning draft:', dbErr);
      const draftId = 'draft-' + Date.now();
      return res.json({
        message: 'Audio transcribed. Database unavailable; timeline saved locally. Log in and use "Save to database" to retry.',
        timelineId: draftId,
        recording_start_time: recordingStartTime.toISOString(),
        events: eventsWithRecordedTime(segments, recordingStartTime, filteredAudioPath, fullText)
      });
    }
  } catch (error) {
    console.error('Filter and transcribe error:', error);
    console.error(error.stack);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    const message = (error && error.message) ? String(error.message) : 'Error processing audio';
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
});

// Simple transcription: upload -> filter -> transcribe; returns JSON only (no download links)
router.post('/transcribe', (req, res, next) => {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large (max 100MB)' });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    req.setTimeout(600000);
    res.setTimeout(600000);
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    const model = req.body.model || process.env.WHISPER_MODEL || 'base';
    const pythonCmd = await getPythonCommand();
    const { segments, text, language } = await runFilterAndTranscribePipeline(req.file.path, pythonCmd, model);
    const duration = segments.length ? Math.max(...segments.map(s => s.end || 0)) : 0;
    return res.json({
      success: true,
      transcription: text,
      segments,
      language: language || undefined,
      duration
    });
  } catch (error) {
    console.error('Transcribe error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Transcription failed' });
    }
  }
});

// Local file pipeline: filter -> transcribe -> create timeline (file path in body, no upload)
// filePath must be under LOCAL_AUDIO_BASE (default: backend/uploads)
const localAudioBase = path.resolve(process.env.LOCAL_AUDIO_BASE || uploadsDir);
router.post('/from-local', async (req, res) => {
  try {
    req.setTimeout(600000);
    res.setTimeout(600000);
    const { filePath: rawPath } = req.body || {};
    if (!rawPath || typeof rawPath !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid filePath in request body' });
    }
    const normalized = path.normalize(rawPath).replace(/^(\.\.(\/|\\))+/, '');
    const resolved = path.resolve(localAudioBase, normalized);
    const relative = path.relative(localAudioBase, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return res.status(400).json({ error: 'File not found or not under allowed directory' });
    }
    const pythonCmd = await getPythonCommand();
    const { segments, text: fullText, filteredAudioPath } = await runFilterAndTranscribePipeline(resolved, pythonCmd);
    const recordingStartTime = getRecordingStartTime(filteredAudioPath);

    const USE_MOCK_DATA = process.env.USE_MOCK_DATA !== 'false';
    const mockDataLocal = USE_MOCK_DATA ? require('../data/mockData') : null;
    if (mockDataLocal && typeof mockDataLocal.addTranscriptionTimeline === 'function') {
      const timelineId = mockDataLocal.addTranscriptionTimeline(segments, filteredAudioPath, recordingStartTime);
      const events = mockDataLocal.getEvents(timelineId);
      return res.json({
        message: 'Audio filtered and transcribed from local file',
        timelineId,
        recording_start_time: recordingStartTime.toISOString(),
        events
      });
    }

    let Timeline, Event;
    try {
      Timeline = require('../models/Timeline');
      Event = require('../models/Event');
    } catch (err) {
      return res.json({
        message: 'Audio processed (mock mode)',
        timelineId: 1,
        recording_start_time: recordingStartTime.toISOString(),
        events: eventsWithRecordedTime(segments, recordingStartTime, filteredAudioPath, fullText)
      });
    }
    const timeline = await Timeline.create(req.user?.id || null, null);
    const [singleEvent] = eventsWithRecordedTime(segments, recordingStartTime, filteredAudioPath, fullText);
    await Event.create(timeline.id, {
      eventNumber: singleEvent.event_number,
      time: singleEvent.time,
      transcript: singleEvent.transcript,
      latitude: null,
      longitude: null,
      audioFilePath: filteredAudioPath,
      audioDuration: singleEvent.audio_duration
    });
    return res.json({
      message: 'Audio filtered and transcribed from local file',
      timelineId: timeline.id,
      recording_start_time: recordingStartTime.toISOString(),
      events: eventsWithRecordedTime(segments, recordingStartTime, filteredAudioPath, fullText)
    });
  } catch (error) {
    console.error('From-local error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Local file processing failed' });
    }
  }
});

module.exports = router;
