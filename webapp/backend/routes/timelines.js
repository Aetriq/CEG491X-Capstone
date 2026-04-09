// webapp/Backend/routes/timelines.js

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Use mock data when database is not available
const USE_MOCK_DATA = process.env.USE_MOCK_DATA !== 'false';
const mockData = USE_MOCK_DATA ? require('../data/mockData') : null;

// Try to load database models, but don't fail if they don't exist
let Timeline, Event;
try {
  Timeline = require('../models/Timeline');
  Event = require('../models/Event');
} catch (err) {
  console.log('Database models not available, using mock data');
}

// Configure multer for audio file uploads
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /audio\/(wav|mp3|ogg|m4a)/;
    if (allowedTypes.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

// Generate Timeline â€” normalize cached/mock event shapes (event_number, null lat/long) before DB insert
function normalizeGenerateEvents(req, res, next) {
  if (req.body && req.body.deviceId === null) req.body.deviceId = undefined;
  if (!req.body || !Array.isArray(req.body.events)) return next();
  req.body.events = req.body.events.map((e, i) => {
    const n = parseInt(e.eventNumber != null ? e.eventNumber : e.event_number, 10);
    const lat = e.latitude;
    const lon = e.longitude;
    return {
      eventNumber: Number.isFinite(n) && n > 0 ? n : i + 1,
      time: (e.time != null && String(e.time).trim() !== "") ? String(e.time).trim() : "00:00:00",
      transcript: e.transcript != null ? String(e.transcript) : "",
      latitude: lat != null && lat !== "" && !Number.isNaN(parseFloat(lat)) ? parseFloat(lat) : null,
      longitude: lon != null && lon !== "" && !Number.isNaN(parseFloat(lon)) ? parseFloat(lon) : null,
      audioFilePath: e.audioFilePath || e.audio_file_path || null,
      audioDuration: (function() {
        const v = e.audioDuration != null ? e.audioDuration : e.audio_duration;
        if (v == null) return null;
        const num = parseInt(v, 10);
        return Number.isFinite(num) ? num : null;
      })()
    };
  });

  next();
}

router.post("/generate",
  verifyToken,
  normalizeGenerateEvents,
  [
    body("events").custom((value) => {
      if (!Array.isArray(value) || value.length < 1) {
        throw new Error("At least one event is required");
      }
      return true;
    })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array(), error: errors.array()[0] && errors.array()[0].msg });
      }
      if (!Timeline || !Event) {
        return res.status(503).json({ error: "Database not available" });
      }
      const { deviceId, events } = req.body;

      console.log('[DB-DEBUG] /timelines/generate request', {
        user: req.user ? { id: req.user.id, username: req.user.username, is_admin: req.user.is_admin } : null,
        deviceId: deviceId ?? null,
        eventsCount: Array.isArray(events) ? events.length : 0,
        sampleEvent: Array.isArray(events) && events.length ? {
          eventNumber: events[0].eventNumber,
          time: events[0].time,
          hasAudioPath: !!events[0].audioFilePath
        } : null
      });

      const timeline = await Timeline.create(req.user.id, deviceId);
      console.log('[DB-DEBUG] /timelines/generate created timeline', { timelineId: timeline?.id, userId: req.user.id });
      const createdEvents = [];
      for (const eventData of events) {
        const event = await Event.create(timeline.id, {
          eventNumber: eventData.eventNumber,
          time: eventData.time,
          transcript: eventData.transcript || "",
          latitude: eventData.latitude,
          longitude: eventData.longitude,
          audioFilePath: eventData.audioFilePath || null,
          audioDuration: eventData.audioDuration || null
        });
        createdEvents.push(event);
        console.log('[DB-DEBUG] /timelines/generate created event', {
          eventId: event?.id,
          timelineId: timeline.id,
          eventNumber: eventData.eventNumber,
          time: eventData.time,
          hasAudioPath: !!eventData.audioFilePath
        });
      }
      const timelineData = await Timeline.findById(timeline.id);
      timelineData.events = createdEvents;
      res.status(201).json({
        message: "Timeline generated successfully",
        timeline: timelineData
      });
    } catch (error) {
      console.error("Generate timeline error:", error);
      res.status(500).json({ error: error.message || "Error generating timeline" });
    }
  }
);

// View Timeline (no auth required)
router.get('/:id', async (req, res) => {
  try {
    const timelineId = parseInt(req.params.id);

    // Prefer database when available to avoid mixing storage backends.
    if (Timeline && Event) {
      const timeline = await Timeline.findById(timelineId);
      if (!timeline) {
        return res.status(404).json({ error: 'Timeline not found' });
      }

      const events = await Event.findByTimelineId(timelineId);
      timeline.events = events;
      return res.json({ timeline });
    }

    // Fallback to mock data when DB models are unavailable.
    if (mockData) {
      const timeline = mockData.getTimeline(timelineId);
      if (!timeline) {
        return res.status(404).json({ error: 'Timeline not found' });
      }
      const events = mockData.getEvents(timelineId);
      timeline.events = events || [];
      return res.json({ timeline });
    }

    res.status(500).json({ error: 'No data source available' });
  } catch (error) {
    console.error('View timeline error:', error);
    res.status(500).json({ error: 'Error fetching timeline' });
  }
});

// List user's timelines — prefers database when user is authenticated
router.get('/', optionalAuth, async (req, res) => {
  try {
    // Authenticated user + DB models → return ALL timelines for this user
    if (Timeline && Event && req.user) {
      const timelines = await Timeline.findByUserId(req.user.id);
      const withCounts = await Promise.all(
        timelines.map(async (timeline) => {
          const events = await Event.findByTimelineId(timeline.id);
          return { ...timeline, events_count: events.length };
        })
      );
      return res.json({ timelines: withCounts });
    }

    // Fallback: mock data (unauthenticated/demo mode)
    if (mockData) {
      const timeline = mockData.getTimeline(1);
      return res.json({ timelines: timeline ? [timeline] : [] });
    }

    res.json({ timelines: [] });
  } catch (error) {
    console.error('List timelines error:', error);
    res.status(500).json({ error: 'Error fetching timelines' });
  }
});

// Rename timeline
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const timelineId = parseInt(req.params.id, 10);
    const name = (req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Timeline name is required' });
    }

    if (Timeline) {
      const timeline = await Timeline.findById(timelineId);
      if (!timeline) return res.status(404).json({ error: 'Timeline not found' });
      if (timeline.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

      // Store user-facing timeline name in device_id for now.
      await Timeline.update(timelineId, { device_id: name });
      const updated = await Timeline.findById(timelineId);
      return res.json({ message: 'Timeline renamed successfully', timeline: updated });
    }

    if (mockData) {
      const timeline = mockData.getTimeline(timelineId);
      if (!timeline) return res.status(404).json({ error: 'Timeline not found' });
      timeline.device_id = name;
      return res.json({ message: 'Timeline renamed successfully (mock data)', timeline });
    }

    return res.status(500).json({ error: 'No data source available' });
  } catch (error) {
    console.error('Rename timeline error:', error);
    return res.status(500).json({ error: 'Error renaming timeline' });
  }
});

// Delete timeline
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const timelineId = parseInt(req.params.id, 10);

    if (Timeline) {
      const timeline = await Timeline.findById(timelineId);
      if (!timeline) return res.status(404).json({ error: 'Timeline not found' });
      if (timeline.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

      if (Event) {
        const events = await Event.findByTimelineId(timelineId);
        await Promise.all(events.map((ev) => Event.delete(ev.id)));
      }
      await Timeline.delete(timelineId);
      return res.json({ message: 'Timeline deleted successfully' });
    }

    if (mockData) {
      return res.status(501).json({ error: 'Delete not available in mock mode' });
    }

    return res.status(500).json({ error: 'No data source available' });
  } catch (error) {
    console.error('Delete timeline error:', error);
    return res.status(500).json({ error: 'Error deleting timeline' });
  }
});

// Search Timeline by Date
router.get('/search/date', verifyToken, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }

    const timelines = await Timeline.searchByDate(req.user.id, date);
    res.json({ timelines });
  } catch (error) {
    console.error('Search timeline error:', error);
    res.status(500).json({ error: 'Error searching timelines' });
  }
});

// Save Timeline (save currently viewed timeline to database) - no auth required for mock
router.post('/:id/save', verifyToken, async (req, res) => {
  try {
    const timelineId = parseInt(req.params.id);

    if (Timeline) {
      const timeline = await Timeline.findById(timelineId);
      if (!timeline) {
        return res.status(404).json({ error: 'Timeline not found' });
      }

      // Check ownership if user is authenticated
      if (req.user && timeline.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Timeline is already saved, just confirm
      return res.json({
        message: 'Timeline saved successfully',
        timeline
      });
    }

    if (mockData) {
      const timeline = mockData.getTimeline(timelineId);
      return res.json({
        message: 'Timeline saved successfully (mock data)',
        timeline
      });
    }

    res.status(500).json({ error: 'No data source available' });
  } catch (error) {
    console.error('Save timeline error:', error);
    res.status(500).json({ error: 'Error saving timeline' });
  }
});

// Edit Timeline (update event data) - no auth required for mock data
router.put('/:id/events/:eventId',
  [
    body('time').optional().notEmpty(),
    body('transcript').optional().isString(),
    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const timelineId = parseInt(req.params.id);
      const eventId = parseInt(req.params.eventId);

      if (Timeline && Event) {
        const timeline = await Timeline.findById(timelineId);
        if (!timeline) {
          return res.status(404).json({ error: 'Timeline not found' });
        }

        // Check ownership if user is authenticated
        if (req.user && timeline.user_id !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const event = await Event.findById(eventId);
        if (!event || event.timeline_id !== timelineId) {
          return res.status(404).json({ error: 'Event not found' });
        }

        const updates = {};
        if (req.body.time !== undefined) updates.time = req.body.time;
        if (req.body.transcript !== undefined) updates.transcript = req.body.transcript;
        if (req.body.latitude !== undefined) updates.latitude = req.body.latitude;
        if (req.body.longitude !== undefined) updates.longitude = req.body.longitude;

        await Event.update(eventId, updates);
        const updatedEvent = await Event.findById(eventId);

        return res.json({
          message: 'Event updated successfully',
          event: updatedEvent
        });
      }

      if (mockData) {
        const updates = {};
        if (req.body.time !== undefined) updates.time = req.body.time;
        if (req.body.transcript !== undefined) updates.transcript = req.body.transcript;
        if (req.body.latitude !== undefined) updates.latitude = req.body.latitude;
        if (req.body.longitude !== undefined) updates.longitude = req.body.longitude;

        const updatedEvent = mockData.updateEvent(eventId, updates);
        return res.json({
          message: 'Event updated successfully',
          event: updatedEvent
        });
      }

      res.status(500).json({ error: 'No data source available' });
    } catch (error) {
      console.error('Edit timeline error:', error);
      res.status(500).json({ error: 'Error updating event' });
    }
  }
);

// Export Timeline (download as CSV) - no auth required
router.get('/:id/export', async (req, res) => {
  try {
    const timelineId = parseInt(req.params.id);
    let events = [];
    let timeline = null;

    const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, '\n')}"`;

    const parseCoordinatesFromAudioName = (nameOrPath) => {
      if (!nameOrPath) return null;
      const base = String(nameOrPath).split(/[\\/]/).pop() || '';
      const match = base.match(/^(\d{8})_(\d{6})_(-?\d{1,9})_(-?\d{1,9})(?:\.[^.]+)?$/);
      if (!match) return null;
      const lat = Number(match[3]) / 1e6;
      const lon = Number(match[4]) / 1e6;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
      return { lat, lon };
    };

    const formatLocation = (event) => {
      let lat = event.latitude;
      let lon = event.longitude;
      if (lat == null || lon == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) {
        const fromName = parseCoordinatesFromAudioName(event.audio_file_path || event.audioFilePath || '');
        if (fromName) {
          lat = fromName.lat;
          lon = fromName.lon;
        }
      }
      if (lat == null || lon == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) {
        return 'N/A';
      }
      const nLat = Number(lat);
      const nLon = Number(lon);
      const latDir = nLat >= 0 ? 'N' : 'S';
      const lonDir = nLon >= 0 ? 'E' : 'W';
      return `${Math.abs(nLat).toFixed(6)} deg ${latDir}, ${Math.abs(nLon).toFixed(6)} deg ${lonDir}`;
    };

    if (Timeline && Event) {
      timeline = await Timeline.findById(timelineId);
      if (!timeline) {
        return res.status(404).json({ error: 'Timeline not found' });
      }

      // Check ownership if user is authenticated
      if (req.user && timeline.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      events = await Event.findByTimelineId(timelineId);
    } else if (mockData) {
      timeline = mockData.getTimeline(timelineId) || null;
      events = mockData.getEvents(timelineId);
    } else {
      return res.status(500).json({ error: 'No data source available' });
    }

    // Generate CSV to mirror Timeline View columns.
    const csvHeader = 'Event,Time,Transcript,Location,AudioFileName\n';
    const csvRows = events.map((event) => {
      const transcript = event.transcript != null ? String(event.transcript) : '';
      const location = formatLocation(event);

      const audioPath = event.audio_file_path || event.audioFilePath || '';
      const audioFileName = audioPath ? path.basename(audioPath) : '';

      return [
        csvEscape(event.event_number ?? ''),
        csvEscape(event.time || ''),
        csvEscape(transcript),
        csvEscape(location),
        csvEscape(audioFileName)
      ].join(',');
    }).join('\n');

    const csv = csvHeader + csvRows;
    const timelineCreated = timeline?.created_at || timeline?.date_generated;
    const createdDate = timelineCreated ? new Date(timelineCreated) : null;
    const timelineNameRaw = (createdDate && !Number.isNaN(createdDate.getTime()))
      ? createdDate.toISOString().replace(/:/g, '-').slice(0, 16)
      : `timeline-${timelineId}`;
    const safeTimelineName = timelineNameRaw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || `timeline-${timelineId}`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTimelineName}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Export timeline error:', error);
    res.status(500).json({ error: 'Error exporting timeline' });
  }
});

// Upload audio file for an event
router.post('/:id/events/:eventId/audio',
  verifyToken,
  upload.single('audio'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      const timelineId = parseInt(req.params.id);
      const eventId = parseInt(req.params.eventId);

      const timeline = await Timeline.findById(timelineId);
      if (!timeline || timeline.user_id !== req.user.id) {
        // Delete uploaded file if access denied
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ error: 'Access denied' });
      }

      const event = await Event.findById(eventId);
      if (!event || event.timeline_id !== timelineId) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Event not found' });
      }

      // Update event with audio file path
      await Event.update(eventId, {
        audio_file_path: req.file.path,
        audio_duration: req.body.duration ? parseInt(req.body.duration) : null
      });

      res.json({
        message: 'Audio file uploaded successfully',
        file: {
          path: req.file.path,
          filename: req.file.filename,
          size: req.file.size
        }
      });
    } catch (error) {
      console.error('Upload audio error:', error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: 'Error uploading audio file' });
    }
  }
);

module.exports = router;

