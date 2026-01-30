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
    const outputFile = path.join(filteredDir, `filtered-${Date.now()}.wav`);
    const pythonCmd = await getPythonCommand();

    // Step 1: Filter audio (Python script)
    const filterScript = path.join(__dirname, '../scripts/filter_audio.py');
    let filteredAudioPath = inputFile;

    if (fs.existsSync(filterScript)) {
      try {
        await execPromise(`${pythonCmd} "${filterScript}" "${inputFile}" "${outputFile}" 400 3 lowpass`);
        if (fs.existsSync(outputFile)) {
          filteredAudioPath = outputFile;
          console.log('Audio filtered successfully');
        }
      } catch (err) {
        console.log('Filtering skipped:', err.message);
      }
    }

    // Step 2: Transcribe filtered audio (Whisper)
    const transcribeScript = path.join(__dirname, '../scripts/transcribe_audio.py');
    const transcriptionJsonPath = filteredAudioPath.replace(/\.[^.]+$/, '.transcription.json');
    let segments = [];

    if (fs.existsSync(transcribeScript)) {
      try {
        const model = process.env.WHISPER_MODEL || 'base';
        const { stdout } = await execPromise(
          `${pythonCmd} "${transcribeScript}" "${filteredAudioPath}" --model ${model} --output_json "${transcriptionJsonPath}"`
        );
        const parsed = JSON.parse(stdout.trim());
        segments = parsed.segments || [];
        if (parsed.text && segments.length === 0) {
          segments = [{ start: 0, end: 0, text: parsed.text }];
        }
        console.log('Transcription completed, segments:', segments.length);
      } catch (err) {
        console.log('Transcription failed, using placeholder:', err.message);
        segments = [{
          start: 0,
          end: 0,
          text: 'Transcription unavailable. Install: pip install openai-whisper'
        }];
      }
    } else {
      segments = [{
        start: 0,
        end: 0,
        text: 'Transcription script not found. Add scripts/transcribe_audio.py'
      }];
    }

    // Step 3: Create timeline from segments
    const USE_MOCK_DATA = process.env.USE_MOCK_DATA !== 'false';
    const mockData = USE_MOCK_DATA ? require('../data/mockData') : null;

    if (mockData && typeof mockData.addTranscriptionTimeline === 'function') {
      const timelineId = mockData.addTranscriptionTimeline(segments, filteredAudioPath);
      return res.json({
        message: 'Audio filtered and transcribed',
        timelineId,
        events: segments
      });
    }

    // Database path
    let Timeline, Event;
    try {
      Timeline = require('../models/Timeline');
      Event = require('../models/Event');
    } catch (err) {
      return res.json({
        message: 'Audio processed (mock mode)',
        timelineId: 1,
        events: segments
      });
    }

    const timeline = await Timeline.create(req.user?.id || null, null);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const start = seg.start != null ? seg.start : 0;
      const mins = Math.floor(start / 60);
      const secs = Math.floor(start % 60);
      const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      await Event.create(timeline.id, {
        eventNumber: i + 1,
        time: timeStr,
        transcript: seg.text || '',
        latitude: null,
        longitude: null,
        audioFilePath: filteredAudioPath,
        audioDuration: seg.end != null && seg.start != null ? Math.round((seg.end - seg.start) * 1000) : null
      });
    }

    res.json({
      message: 'Audio filtered and transcribed successfully',
      timelineId: timeline.id,
      events: segments
    });
  } catch (error) {
    console.error('Filter and transcribe error:', error);
    console.error(error.stack);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    const message = error.message || 'Error processing audio';
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
});

module.exports = router;
