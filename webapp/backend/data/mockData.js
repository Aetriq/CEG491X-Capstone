// In-memory mock data storage for timelines and events
// Used when database is not available or USE_MOCK_DATA=true
// ⚠️ WARNING: This data is lost on server restart!

const initTimestamp = new Date().toISOString();
console.log(`[MOCKDATA-DEBUG] 🔄 MOCKDATA INITIALIZED [${initTimestamp}]`);
console.log(`[MOCKDATA-DEBUG] ⚠️ WARNING: In-memory storage - data will be lost on server restart!`);

let nextTimelineId = 1;
let nextEventId = 1000;

const timelines = {};
const events = {};
const transcriptionTimelines = {};

// Log initial state
console.log(`[MOCKDATA-DEBUG] 📊 Initial state:`);
console.log(`[MOCKDATA-DEBUG]   Timelines: ${Object.keys(timelines).length}`);
console.log(`[MOCKDATA-DEBUG]   Events: ${Object.keys(events).length}`);
console.log(`[MOCKDATA-DEBUG]   Transcription timelines: ${Object.keys(transcriptionTimelines).length}`);
console.log(`[MOCKDATA-DEBUG]   Next timeline ID: ${nextTimelineId}`);
console.log(`[MOCKDATA-DEBUG]   Next event ID: ${nextEventId}`);

/** Format a Date as recorded time (HH:MM). */
function formatRecordedTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Create a timeline with a single event from transcription segments.
 * @param {Array} segments - Transcription segments from Whisper
 * @param {string} audioFilePath - Path to the filtered audio file
 * @param {Date} recordingStartTime - When the recording started
 * @returns {number} timelineId
 */
function addTranscriptionTimeline(segments, audioFilePath, recordingStartTime) {
  const timestamp = new Date().toISOString();
  console.log(`[MOCKDATA-DEBUG] 📝 addTranscriptionTimeline called [${timestamp}]`);
  console.log(`[MOCKDATA-DEBUG]   Audio file path: ${audioFilePath}`);
  console.log(`[MOCKDATA-DEBUG]   Segments count: ${segments ? segments.length : 0}`);
  
  // Verify audio file exists before storing reference
  const fs = require('fs');
  const path = require('path');
  const fileExists = fs.existsSync(audioFilePath);
  console.log(`[MOCKDATA-DEBUG]   Audio file exists: ${fileExists}`);
  if (!fileExists) {
    console.log(`[MOCKDATA-DEBUG] ⚠️⚠️⚠️ WARNING: Audio file does not exist when creating timeline!`);
    console.log(`[MOCKDATA-DEBUG]   Path: ${path.resolve(audioFilePath)}`);
  }
  
  const id = nextTimelineId++;
  const now = new Date().toISOString();
  const timeline = {
    id,
    device_id: null,
    date_generated: now,
    created_at: now,
    updated_at: now
  };
  
  const baseTime = recordingStartTime != null
    ? (recordingStartTime instanceof Date ? recordingStartTime : new Date(recordingStartTime))
    : null;
  
  const segs = segments || [];
  const fullTranscript = segs.map(s => s.text || '').join(' ').trim() || '';
  const totalDurationSec = segs.length ? Math.max(...segs.map(s => s.end != null ? s.end : 0)) : 0;
  const timeStr = baseTime
    ? formatRecordedTime(baseTime)
    : '00:00';
  
  const eventId = id * 1000;
  const events = [{
    id: eventId,
    timeline_id: id,
    event_number: 1,
    time: timeStr,
    transcript: fullTranscript,
    latitude: null,
    longitude: null,
    audio_file_path: audioFilePath,
    audio_duration: Math.round(totalDurationSec * 1000),
    created_at: now,
    updated_at: now
  }];
  
  if (baseTime) {
    timeline.recording_start_time = baseTime.toISOString();
  }
  
  transcriptionTimelines[id] = { timeline, events };
  
  console.log(`[MOCKDATA-DEBUG] ✅ Timeline created:`);
  console.log(`[MOCKDATA-DEBUG]   Timeline ID: ${id}`);
  console.log(`[MOCKDATA-DEBUG]   Event ID: ${eventId}`);
  console.log(`[MOCKDATA-DEBUG]   Audio path stored: ${audioFilePath}`);
  console.log(`[MOCKDATA-DEBUG]   Audio path exists: ${fileExists}`);
  
  // Log updated state
  logState();
  
  return id;
}

/**
 * Append a new event to an existing transcription timeline.
 * @param {number} timelineId - Existing timeline ID
 * @param {Array} segments - Transcription segments from Whisper
 * @param {string} audioFilePath - Path to the filtered audio file
 * @param {Date} recordingStartTime - When the recording started
 * @returns {Array} Updated events array
 */
function appendTranscriptionEvent(timelineId, segments, audioFilePath, recordingStartTime) {
  const timestamp = new Date().toISOString();
  console.log(`[MOCKDATA-DEBUG] ➕ appendTranscriptionEvent called [${timestamp}]`);
  console.log(`[MOCKDATA-DEBUG]   Timeline ID: ${timelineId}`);
  console.log(`[MOCKDATA-DEBUG]   Audio file path: ${audioFilePath}`);
  
  const entry = transcriptionTimelines[timelineId];
  if (!entry) {
    console.log(`[MOCKDATA-DEBUG] ❌ Timeline ${timelineId} not found`);
    throw new Error('Timeline not found');
  }
  
  // Verify audio file exists before storing reference
  const fs = require('fs');
  const path = require('path');
  const fileExists = fs.existsSync(audioFilePath);
  console.log(`[MOCKDATA-DEBUG]   Audio file exists: ${fileExists}`);
  if (!fileExists) {
    console.log(`[MOCKDATA-DEBUG] ⚠️⚠️⚠️ WARNING: Audio file does not exist when appending event!`);
    console.log(`[MOCKDATA-DEBUG]   Path: ${path.resolve(audioFilePath)}`);
  }
  
  const now = new Date().toISOString();
  const baseTime = recordingStartTime != null
    ? (recordingStartTime instanceof Date ? recordingStartTime : new Date(recordingStartTime))
    : null;
  
  const segs = segments || [];
  const fullTranscript = segs.map(s => s.text || '').join(' ').trim() || '';
  const totalDurationSec = segs.length ? Math.max(...segs.map(s => s.end != null ? s.end : 0)) : 0;
  const timeStr = baseTime
    ? formatRecordedTime(baseTime)
    : '00:00';
  
  const nextEventNumber = (entry.events[entry.events.length - 1]?.event_number || 0) + 1;
  const eventId = timelineId * 1000 + (nextEventNumber - 1);
  
  const ev = {
    id: eventId,
    timeline_id: timelineId,
    event_number: nextEventNumber,
    time: timeStr,
    transcript: fullTranscript,
    latitude: null,
    longitude: null,
    audio_file_path: audioFilePath,
    audio_duration: Math.round(totalDurationSec * 1000),
    created_at: now,
    updated_at: now
  };
  
  entry.events.push(ev);
  
  if (baseTime && !entry.timeline.recording_start_time) {
    entry.timeline.recording_start_time = baseTime.toISOString();
  }
  
  transcriptionTimelines[timelineId] = entry;
  
  console.log(`[MOCKDATA-DEBUG] ✅ Event appended:`);
  console.log(`[MOCKDATA-DEBUG]   Event ID: ${eventId}`);
  console.log(`[MOCKDATA-DEBUG]   Event number: ${nextEventNumber}`);
  console.log(`[MOCKDATA-DEBUG]   Audio path stored: ${audioFilePath}`);
  console.log(`[MOCKDATA-DEBUG]   Audio path exists: ${fileExists}`);
  console.log(`[MOCKDATA-DEBUG]   Total events in timeline: ${entry.events.length}`);
  
  return entry.events;
}

/**
 * Get a timeline by ID.
 * @param {number} id - Timeline ID
 * @returns {Object|null} Timeline object or null
 */
function getTimeline(id) {
  // Check transcription timelines first
  if (transcriptionTimelines[id]) {
    return transcriptionTimelines[id].timeline;
  }
  // Check regular timelines
  return timelines[id] || null;
}

/**
 * Get all events for a timeline.
 * @param {number} timelineId - Timeline ID
 * @returns {Array} Array of event objects
 */
function getEvents(timelineId) {
  // Check transcription timelines first
  if (transcriptionTimelines[timelineId]) {
    return transcriptionTimelines[timelineId].events || [];
  }
  // Check regular events
  return Object.values(events).filter(e => e.timeline_id === timelineId) || [];
}

/**
 * Get an event by ID.
 * @param {number} eventId - Event ID
 * @returns {Object|null} Event object or null
 */
function getEventById(eventId) {
  const timestamp = new Date().toISOString();
  console.log(`[MOCKDATA-DEBUG] 🔍 getEventById called [${timestamp}]`);
  console.log(`[MOCKDATA-DEBUG]   Event ID: ${eventId}`);
  
  // Log current state for debugging
  const transcriptionTimelineIds = Object.keys(transcriptionTimelines);
  const totalEvents = Object.values(transcriptionTimelines).reduce((sum, entry) => sum + (entry.events?.length || 0), 0);
  console.log(`[MOCKDATA-DEBUG] 📊 Current mockData state:`);
  console.log(`[MOCKDATA-DEBUG]   Transcription timelines: ${transcriptionTimelineIds.length} (IDs: ${transcriptionTimelineIds.join(', ') || 'none'})`);
  console.log(`[MOCKDATA-DEBUG]   Total events in transcription timelines: ${totalEvents}`);
  console.log(`[MOCKDATA-DEBUG]   Regular events: ${Object.keys(events).length}`);
  
  // Search transcription timelines
  for (const entry of Object.values(transcriptionTimelines)) {
    const event = entry.events.find(e => e.id === eventId);
    if (event) {
      console.log(`[MOCKDATA-DEBUG] ✅ Event found in transcriptionTimelines`);
      console.log(`[MOCKDATA-DEBUG]   Timeline ID: ${event.timeline_id}`);
      console.log(`[MOCKDATA-DEBUG]   Audio path: ${event.audio_file_path || 'MISSING'}`);
      
      // Verify audio file exists
      if (event.audio_file_path) {
        const fs = require('fs');
        const path = require('path');
        const fileExists = fs.existsSync(event.audio_file_path);
        console.log(`[MOCKDATA-DEBUG]   Audio file exists: ${fileExists}`);
        if (!fileExists) {
          console.log(`[MOCKDATA-DEBUG] ⚠️⚠️⚠️ CRITICAL: Audio file missing for event ${eventId}!`);
          console.log(`[MOCKDATA-DEBUG]   Expected path: ${path.resolve(event.audio_file_path)}`);
          console.log(`[MOCKDATA-DEBUG]   Event created: ${event.created_at || 'unknown'}`);
        }
      } else {
        console.log(`[MOCKDATA-DEBUG] ⚠️ Event has no audio_file_path property`);
      }
      
      return event;
    }
  }
  // Check regular events
  const regularEvent = events[eventId] || null;
  if (regularEvent) {
    console.log(`[MOCKDATA-DEBUG] ✅ Event found in regular events`);
    console.log(`[MOCKDATA-DEBUG]   Audio path: ${regularEvent.audio_file_path || 'MISSING'}`);
  } else {
    console.log(`[MOCKDATA-DEBUG] ❌ Event not found in any source`);
    console.log(`[MOCKDATA-DEBUG] ⚠️⚠️⚠️ POSSIBLE CAUSES:`);
    console.log(`[MOCKDATA-DEBUG]   1. Server was restarted (nodemon/file change) - in-memory data lost`);
    console.log(`[MOCKDATA-DEBUG]   2. Event was never created`);
    console.log(`[MOCKDATA-DEBUG]   3. Event ID mismatch`);
    console.log(`[MOCKDATA-DEBUG]   📝 Check server logs for when event ${eventId} was created`);
    console.log(`[MOCKDATA-DEBUG]   💡 Solution: Use database (SQLite) instead of mockData for persistence`);
  }
  return regularEvent;
}

/**
 * Update an event.
 * @param {number} eventId - Event ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated event or null
 */
function updateEvent(eventId, updates) {
  // Search transcription timelines
  for (const entry of Object.values(transcriptionTimelines)) {
    const event = entry.events.find(e => e.id === eventId);
    if (event) {
      Object.assign(event, updates, { updated_at: new Date().toISOString() });
      return event;
    }
  }
  // Check regular events
  if (events[eventId]) {
    Object.assign(events[eventId], updates, { updated_at: new Date().toISOString() });
    return events[eventId];
  }
  return null;
}

/**
 * Log current state of mockData (for debugging).
 */
function logState() {
  const transcriptionTimelineIds = Object.keys(transcriptionTimelines);
  const totalEvents = Object.values(transcriptionTimelines).reduce((sum, entry) => sum + (entry.events?.length || 0), 0);
  const eventIds = [];
  Object.values(transcriptionTimelines).forEach(entry => {
    if (entry.events) {
      entry.events.forEach(ev => eventIds.push(ev.id));
    }
  });
  
  console.log(`[MOCKDATA-DEBUG] 📊 Current mockData state:`);
  console.log(`[MOCKDATA-DEBUG]   Transcription timelines: ${transcriptionTimelineIds.length}`);
  console.log(`[MOCKDATA-DEBUG]   Timeline IDs: ${transcriptionTimelineIds.join(', ') || 'none'}`);
  console.log(`[MOCKDATA-DEBUG]   Total events: ${totalEvents}`);
  console.log(`[MOCKDATA-DEBUG]   Event IDs: ${eventIds.join(', ') || 'none'}`);
  console.log(`[MOCKDATA-DEBUG]   Regular timelines: ${Object.keys(timelines).length}`);
  console.log(`[MOCKDATA-DEBUG]   Regular events: ${Object.keys(events).length}`);
  console.log(`[MOCKDATA-DEBUG]   Next timeline ID: ${nextTimelineId}`);
  console.log(`[MOCKDATA-DEBUG]   Next event ID: ${nextEventId}`);
}

module.exports = {
  getTimeline,
  getEvents,
  getEventById,
  updateEvent,
  addTranscriptionTimeline,
  appendTranscriptionEvent,
  logState
};
