import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import AudioPlayer from '../components/AudioPlayer';
import InteractiveMap from "../components/InteractiveMap"
import './TimelineView.css';

const API_URL = '/api';
const CACHE_KEY_PREFIX = 'echolog_timeline_';

/** Parse event.time (e.g. "14:30" or "14:30:00") to minutes-from-midnight for sorting. */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.trim().split(':').map(Number);
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const hours = parts[0];
    const mins = parts[1];
    const secs = parts[2] || 0;
    return hours * 60 + mins + secs / 60;
  }
  return 0;
}

/** Sort events from earliest to latest by time, then renumber so Event column follows time order. */
function sortEventsEarliestToLatest(events) {
  if (!Array.isArray(events) || events.length === 0) return events;
  if (events.length === 1) {
    return [{ ...events[0], event_number: 1 }];
  }
  const sorted = [...events].sort((a, b) => {
    const minA = parseTimeToMinutes(a.time);
    const minB = parseTimeToMinutes(b.time);
    if (minA !== minB) return minA - minB;
    const numA = a.event_number != null ? a.event_number : 0;
    const numB = b.event_number != null ? b.event_number : 0;
    return numA - numB;
  });
  return sorted.map((ev, i) => ({ ...ev, event_number: i + 1 }));
}

/** Format a Day/Month label from an ISO datetime string. */
function formatDayMonth(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = d.toLocaleString(undefined, { month: 'short' });
  return `${day} ${month}`;
}

function TimelineView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [timeline, setTimeline] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isFromCache, setIsFromCache] = useState(false);

  useEffect(() => {
    loadTimeline();
  }, [id]);

  const loadTimeline = async () => {
    setLoading(true);
    try {
      const cacheKey = `${CACHE_KEY_PREFIX}${id}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { timeline: t, events: e } = JSON.parse(cached);
        setTimeline(t);
        const raw = e || [];
        const recordingStart = t?.recording_start_time ? new Date(t.recording_start_time).getTime() : null;
        const formatRecordedTime = (ms) => {
          const d = new Date(ms);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };
        const normalized = raw.map((ev, i) => {
          if (ev.event_number != null && ev.time != null) return ev;
          const start = ev.start != null ? ev.start : 0;
          const timeStr = ev.time ?? (recordingStart != null
            ? formatRecordedTime(recordingStart + start * 1000)
            : `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(Math.floor(start % 60)).padStart(2, '0')}`);
          return {
            ...ev,
            id: ev.id ?? i,
            event_number: ev.event_number ?? i + 1,
            time: timeStr,
            transcript: ev.transcript ?? ev.text ?? ''
          };
        });
        const sorted = sortEventsEarliestToLatest(normalized);
        setEvents(sorted);
        setIsFromCache(true);
        setLoading(false);
        return;
      }
      const response = await axios.get(`${API_URL}/timelines/${id}`);
      setTimeline(response.data.timeline);
      const apiEvents = response.data.timeline.events || [];
      setEvents(sortEventsEarliestToLatest(apiEvents));
      setIsFromCache(false);
    } catch (error) {
      console.error('Error loading timeline:', error);
      if (error.response?.status === 404) {
        setLoading(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await axios.get(`${API_URL}/timelines/${id}/export`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `timeline-${id}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting timeline:', error);
      alert('Error exporting timeline: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleSave = async () => {
    try {
      const response = await axios.post(`${API_URL}/timelines/${id}/save`);
      alert(response.data.message || 'Timeline saved successfully');
    } catch (error) {
      console.error('Error saving timeline:', error);
      alert('Error saving timeline: ' + (error.response?.data?.error || error.message));
    }
  };

  // Legacy /draft/ flows used a manual "Save to database" button.
  // With authenticated transcription, timelines are saved automatically,
  // so we no longer expose a separate save-to-DB action in the UI.

  const handleEdit = (event) => {
    setEditingEvent(event.id);
    setEditForm({
      transcript: event.transcript || ''
    });
  };

  const handleMainMenu = () => {
    if (user) {
      navigate('/home');
    } else {
      navigate('/menu');
    }
  };

  const handleSaveEdit = async (eventId) => {
    try {
      await axios.put(`${API_URL}/timelines/${id}/events/${eventId}`, editForm);
      await loadTimeline();
      setEditingEvent(null);
      setEditForm({});
    } catch (error) {
      console.error('Error updating event:', error);
      alert('Error updating event');
    }
  };

  const handleCancelEdit = () => {
    setEditingEvent(null);
    setEditForm({});
  };

  const formatCoordinates = (lat, lon) => {
    if (!lat || !lon) return 'N/A';
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(2)}° ${latDir}\n${Math.abs(lon).toFixed(2)}° ${lonDir}`;
  };

  //Returns JSON with format {place_name, coordinates, type}
  //WIP update to accept language
  const reverseGeocode = async (lat, long) =>{
    const response = await axios.get(`${API_URL}/reverseGeocode/${lat}&${long}`);
    return response;
  }

  const getLocation = (lat, lon) => {
    const searchResponse = reverseGeocode(lat, lon, "en");

    //WIP get location estimates
    return searchResponse.place_name;
  }

  if (loading) {
    return <div className="loading">Loading timeline...</div>;
  }

  if (!timeline) {
    return <div className="error">Timeline not found</div>;
  }

  return (
    <div className="timeline-view-container">
      <div className="top-right-buttons">
        <button onClick={handleMainMenu} className="back-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18l-6-6 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Main Menu
        </button>
        <button onClick={handleExport} className="download-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3v9" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 11l4 4 4-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M21 21H3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Download CSV
        </button>
      </div>

      <div className="timeline-layout">
        <main className="content">
          <div className="header-row">
            <div>
              <div className="title">Event Log</div>
            </div>
          </div>

          <div className="table-wrap">
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th style={{width: '56px'}}>Event</th>
                    <th style={{width: '88px'}}>Time</th>
                    <th>Transcript</th>
                    <th style={{width: '220px'}}>Location</th>
                    <th style={{width: '220px', textAlign: 'right'}}>Audio</th>
                    <th style={{width: '100px'}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event, index) => (
                    <tr key={event.id != null ? event.id : `event-${index}`}>
                      <td><span className="rownum">{event.event_number}</span></td>
                      <td className="time">
                        <div>{event.time}</div>
                        <div className="time-date">
                          {formatDayMonth(timeline.recording_start_time || timeline.date_generated)}
                        </div>
                      </td>
                      <td className="transcript">
                        {editingEvent === event.id ? (
                          <textarea
                            value={editForm.transcript}
                            onChange={(e) => setEditForm({...editForm, transcript: e.target.value})}
                            className="edit-textarea"
                            rows="2"
                          />
                        ) : (
                          event.transcript || 'No transcript'
                        )}
                      </td>
                      <td className="position">
                        {<div>{getLocation(event.latitude, event.longitude)}</div>
                        
                        }
                      </td>
                      <td className="audio-cell">
                        {event.audio_file_path ? (
                          <AudioPlayer 
                            eventId={event.id} 
                            audioFilePath={event.audio_file_path || event.audioFilePath}
                          />
                        ) : (
                          <span className="no-audio">No audio</span>
                        )}
                      </td>
                      <td>
                        {editingEvent === event.id ? (
                          <div className="edit-actions">
                            <button onClick={() => handleSaveEdit(event.id)} className="btn-save">Save</button>
                            <button onClick={handleCancelEdit} className="btn-cancel">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => handleEdit(event)} className="btn-edit">Edit</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <InteractiveMap longitude = {-75.6876174} latitude = {45.4189231} ></InteractiveMap>
            </div>
          </div>
        </main>
      </div>
      
      {/* Timelines created while logged in are saved into the database automatically.
          The old explicit "Save to database" / "Save Timeline" buttons have been removed
          to simplify the UX. */}
    </div>
  );
}

export default TimelineView;
