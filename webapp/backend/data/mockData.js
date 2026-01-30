// Mock data matching the original HTML mockup
// This data is used when database is not available

const mockTimeline = {
  id: 1,
  device_id: 'ECHLG-01',
  date_generated: '2025-10-27T00:00:00.000Z',
  created_at: '2025-10-27T00:00:00.000Z',
  updated_at: '2025-10-27T00:00:00.000Z'
};

const mockEvents = [
  {
    id: 1,
    timeline_id: 1,
    event_number: 1,
    time: '12:24',
    transcript: 'Leaving the base now.',
    latitude: 45.539708,
    longitude: -73.516467,
    audio_file_path: null,
    audio_duration: 23,
    created_at: '2025-10-27T12:24:00.000Z',
    updated_at: '2025-10-27T12:24:00.000Z'
  },
  {
    id: 2,
    timeline_id: 1,
    event_number: 2,
    time: '12:52',
    transcript: 'Arriving on scene. No other units in sight.',
    latitude: 45.828100,
    longitude: -73.295275,
    audio_file_path: null,
    audio_duration: 15,
    created_at: '2025-10-27T12:52:00.000Z',
    updated_at: '2025-10-27T12:52:00.000Z'
  },
  {
    id: 3,
    timeline_id: 1,
    event_number: 3,
    time: '12:57',
    transcript: 'Two victims located. Loaded them into the boat.',
    latitude: 45.830372,
    longitude: -73.291628,
    audio_file_path: null,
    audio_duration: 22,
    created_at: '2025-10-27T12:57:00.000Z',
    updated_at: '2025-10-27T12:57:00.000Z'
  },
  {
    id: 4,
    timeline_id: 1,
    event_number: 4,
    time: '13:05',
    transcript: 'Administering oxygen now. Saturation at 93 percent.',
    latitude: 45.830372,
    longitude: -73.291628,
    audio_file_path: null,
    audio_duration: 19,
    created_at: '2025-10-27T13:05:00.000Z',
    updated_at: '2025-10-27T13:05:00.000Z'
  },
  {
    id: 5,
    timeline_id: 1,
    event_number: 5,
    time: '13:21',
    transcript: 'No one else found. Evacuating the victims.',
    latitude: 45.830372,
    longitude: -73.291628,
    audio_file_path: null,
    audio_duration: 17,
    created_at: '2025-10-27T13:21:00.000Z',
    updated_at: '2025-10-27T13:21:00.000Z'
  },
  {
    id: 6,
    timeline_id: 1,
    event_number: 6,
    time: '13:40',
    transcript: 'Arriving at the Port now. Ambulance already on site.',
    latitude: 45.506514,
    longitude: -73.550036,
    audio_file_path: null,
    audio_duration: 17,
    created_at: '2025-10-27T13:40:00.000Z',
    updated_at: '2025-10-27T13:40:00.000Z'
  },
  {
    id: 7,
    timeline_id: 1,
    event_number: 7,
    time: '13:56',
    transcript: 'Transfer to paramedics complete.',
    latitude: 45.506793,
    longitude: -73.551300,
    audio_file_path: null,
    audio_duration: 13,
    created_at: '2025-10-27T13:56:00.000Z',
    updated_at: '2025-10-27T13:56:00.000Z'
  },
  {
    id: 8,
    timeline_id: 1,
    event_number: 8,
    time: '14:23',
    transcript: 'Back at the base. End of mission 2468.',
    latitude: 45.539708,
    longitude: -73.516467,
    audio_file_path: null,
    audio_duration: 7,
    created_at: '2025-10-27T14:23:00.000Z',
    updated_at: '2025-10-27T14:23:00.000Z'
  }
];

// In-memory storage for edits (temporary, lost on server restart)
let editedEvents = {};

// Dynamic timelines from transcription (id >= 2)
let nextTimelineId = 2;
const transcriptionTimelines = {}; // id -> { timeline, events }

function getTimeline(id) {
  const idNum = parseInt(id) || 1;
  if (transcriptionTimelines[idNum]) {
    return { ...transcriptionTimelines[idNum].timeline };
  }
  const timeline = { ...mockTimeline };
  timeline.id = idNum;
  return timeline;
}

function getEvents(timelineId) {
  const timelineIdNum = parseInt(timelineId) || 1;
  if (transcriptionTimelines[timelineIdNum]) {
    return transcriptionTimelines[timelineIdNum].events.map(e => ({
      ...e,
      ...(editedEvents[e.id] || {})
    }));
  }
  return mockEvents
    .filter(e => e.timeline_id === timelineIdNum)
    .map(event => {
      if (editedEvents[event.id]) {
        return { ...event, ...editedEvents[event.id] };
      }
      return event;
    });
}

function addTranscriptionTimeline(segments, audioFilePath) {
  const id = nextTimelineId++;
  const now = new Date().toISOString();
  const timeline = {
    id,
    device_id: null,
    date_generated: now,
    created_at: now,
    updated_at: now
  };
  const events = (segments || []).map((seg, i) => {
    const start = seg.start != null ? seg.start : 0;
    const end = seg.end != null ? seg.end : start + 1;
    const mins = Math.floor(start / 60);
    const secs = Math.floor(start % 60);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return {
      id: id * 1000 + i,
      timeline_id: id,
      event_number: i + 1,
      time: timeStr,
      transcript: seg.text || '',
      latitude: null,
      longitude: null,
      audio_file_path: audioFilePath,
      audio_duration: Math.round((end - start) * 1000),
      created_at: now,
      updated_at: now
    };
  });
  transcriptionTimelines[id] = { timeline, events };
  return id;
}

function updateEvent(eventId, updates) {
  const idNum = parseInt(eventId, 10);
  if (!editedEvents[idNum]) {
    editedEvents[idNum] = {};
  }
  editedEvents[idNum] = { ...editedEvents[idNum], ...updates };
  for (const key of Object.keys(transcriptionTimelines)) {
    const ev = transcriptionTimelines[key].events.find(e => e.id === idNum);
    if (ev) return { ...ev, ...editedEvents[idNum] };
  }
  const event = mockEvents.find(e => e.id === idNum);
  return event ? { ...event, ...editedEvents[idNum] } : null;
}

function getEventById(eventId) {
  const idNum = parseInt(eventId, 10);
  for (const key of Object.keys(transcriptionTimelines)) {
    const ev = transcriptionTimelines[key].events.find(e => e.id === idNum);
    if (ev) {
      return editedEvents[ev.id] ? { ...ev, ...editedEvents[ev.id] } : ev;
    }
  }
  const event = mockEvents.find(e => e.id === idNum);
  if (!event) return null;
  return editedEvents[event.id] ? { ...event, ...editedEvents[event.id] } : event;
}

module.exports = {
  getTimeline,
  getEvents,
  updateEvent,
  getEventById,
  addTranscriptionTimeline
};
