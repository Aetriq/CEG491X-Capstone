const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
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

// Generate Timeline (from device data)
router.post('/generate',
  verifyToken,
  [
    body('deviceId').optional().isString(),
    body('events').isArray().withMessage('Events array is required'),
    body('events.*.eventNumber').isInt().withMessage('Event number is required'),
    body('events.*.time').notEmpty().withMessage('Time is required'),
    body('events.*.transcript').optional().isString(),
    body('events.*.latitude').optional().isFloat(),
    body('events.*.longitude').optional().isFloat()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { deviceId, events } = req.body;

      // Create timeline
      const timeline = await Timeline.create(req.user.id, deviceId);

      // Create events
      const createdEvents = [];
      for (const eventData of events) {
        const event = await Event.create(timeline.id, {
          eventNumber: eventData.eventNumber,
          time: eventData.time,
          transcript: eventData.transcript || '',
          latitude: eventData.latitude || null,
          longitude: eventData.longitude || null,
          audioFilePath: eventData.audioFilePath || null,
          audioDuration: eventData.audioDuration || null
        });
        createdEvents.push(event);
      }

      // Fetch complete timeline with events
      const timelineData = await Timeline.findById(timeline.id);
      timelineData.events = createdEvents;

      res.status(201).json({
        message: 'Timeline generated successfully',
        timeline: timelineData
      });
    } catch (error) {
      console.error('Generate timeline error:', error);
      res.status(500).json({ error: 'Error generating timeline' });
    }
  }
);

// View Timeline (no auth required)
router.get('/:id', async (req, res) => {
  try {
    const timelineId = parseInt(req.params.id);

    // Use mock data if available
    if (mockData) {
      const timeline = mockData.getTimeline(timelineId);
      const events = mockData.getEvents(timelineId);
      timeline.events = events;
      return res.json({ timeline });
    }

    // Use database if available
    if (Timeline && Event) {
      const timeline = await Timeline.findById(timelineId);
      if (!timeline) {
        return res.status(404).json({ error: 'Timeline not found' });
      }

      const events = await Event.findByTimelineId(timelineId);
      timeline.events = events;
      return res.json({ timeline });
    }

    res.status(500).json({ error: 'No data source available' });
  } catch (error) {
    console.error('View timeline error:', error);
    res.status(500).json({ error: 'Error fetching timeline' });
  }
});

// List user's timelines (no auth required for mock data)
router.get('/', async (req, res) => {
  try {
    // Use mock data if available
    if (mockData) {
      const timeline = mockData.getTimeline(1);
      return res.json({ timelines: [timeline] });
    }

    // Use database if available
    if (Timeline && req.user) {
      const timelines = await Timeline.findByUserId(req.user.id);
      return res.json({ timelines });
    }

    // Return mock timeline if no auth
    if (mockData) {
      const timeline = mockData.getTimeline(1);
      return res.json({ timelines: [timeline] });
    }

    res.json({ timelines: [] });
  } catch (error) {
    console.error('List timelines error:', error);
    res.status(500).json({ error: 'Error fetching timelines' });
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
router.post('/:id/save', async (req, res) => {
  try {
    const timelineId = parseInt(req.params.id);

    // Use mock data if available
    if (mockData) {
      const timeline = mockData.getTimeline(timelineId);
      return res.json({
        message: 'Timeline saved successfully (mock data)',
        timeline
      });
    }

    // Use database if available
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

      // Use mock data if available
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

      // Use database if available
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

    // Use mock data if available
    if (mockData) {
      events = mockData.getEvents(timelineId);
    } else if (Timeline && Event) {
      // Use database if available
      const timeline = await Timeline.findById(timelineId);
      if (!timeline) {
        return res.status(404).json({ error: 'Timeline not found' });
      }

      // Check ownership if user is authenticated
      if (req.user && timeline.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      events = await Event.findByTimelineId(timelineId);
    } else {
      return res.status(500).json({ error: 'No data source available' });
    }

    // Generate CSV
    const csvHeader = 'Event,Time,Transcript,Latitude,Longitude\n';
    const csvRows = events.map(event => {
      const transcript = (event.transcript || '').replace(/"/g, '""');
      return `${event.event_number},"${event.time}","${transcript}",${event.latitude || ''},${event.longitude || ''}`;
    }).join('\n');

    const csv = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="timeline-${timelineId}.csv"`);
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
