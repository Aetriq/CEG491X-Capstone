import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import AudioPlayer from '../components/AudioPlayer';
import './TimelineView.css';

const API_URL = '/api';
const CACHE_KEY_PREFIX = 'echolog_timeline_';

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
  const [savingToDb, setSavingToDb] = useState(false);

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
        setEvents(normalized);
        setIsFromCache(true);
        setLoading(false);
        return;
      }
      const response = await axios.get(`${API_URL}/timelines/${id}`);
      setTimeline(response.data.timeline);
      setEvents(response.data.timeline.events || []);
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

  const handleSaveToDatabase = async () => {
    if (!user) {
      alert('Please log in to save this timeline to the database.');
      navigate('/login');
      return;
    }
    setSavingToDb(true);
    try {
      const payload = {
        deviceId: timeline?.device_id || null,
        events: events.map((e) => ({
          eventNumber: e.event_number ?? e.eventNumber,
          time: e.time,
          transcript: e.transcript || '',
          latitude: e.latitude ?? null,
          longitude: e.longitude ?? null,
          audioFilePath: e.audio_file_path ?? e.audioFilePath ?? null,
          audioDuration: e.audio_duration ?? e.audioDuration ?? null
        }))
      };
      const response = await axios.post(`${API_URL}/timelines/generate`, payload);
      const newTimeline = response.data.timeline;
      const newId = newTimeline?.id;
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${id}`);
      setIsFromCache(false);
      if (newId != null && newId !== id) {
        navigate(`/timeline/${newId}`, { replace: true });
      } else {
        setTimeline(newTimeline);
        setEvents(newTimeline?.events || events);
      }
      alert(response.data.message || 'Timeline saved to database.');
    } catch (error) {
      console.error('Error saving to database:', error);
      alert('Error saving to database: ' + (error.response?.data?.error || error.message));
    } finally {
      setSavingToDb(false);
    }
  };

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

  if (loading) {
    return <div className="loading">Loading timeline...</div>;
  }

  if (!timeline) {
    return <div className="error">Timeline not found</div>;
  }

  return (
    <div className="timeline-view-container">
      <div className="top-buttons">
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
        {isFromCache ? (
          <div className="save-db-wrap">
            <button
              onClick={handleSaveToDatabase}
              disabled={savingToDb}
              className="save-btn save-db-btn"
            >
              {savingToDb ? 'Saving…' : 'Save to database'}
            </button>
            <span className="cache-hint">Unsaved (from transcription).</span>
            <span className="cache-hint">Log in and save to store in database.</span>
          </div>
        ) : (
          <button onClick={handleSave} className="save-btn">
            Save Timeline
          </button>
        )}
      </div>

      <div className="timeline-layout">
        <aside className="sidebar">
          <div className="logo">EchoLog</div>
          <div className="device-card">
            <div className="status-row">
              <div className="status-label">Device-ID: {timeline.device_id || 'N/A'}</div>
            </div>
            <div className="status-row">
              <div className="status-label">
                Day: {new Date(timeline.date_generated).toLocaleDateString()}
              </div>
            </div>
            <div className="device-actions">
              <div className="btn">Change Day</div>
              <div className="btn">Save data to computer</div>
              <div className="btn">Synchronise clock</div>
              <div className="btn">Clear Local Memory</div>
            </div>
          </div>
        </aside>

        <main className="content">
          <div className="header-row">
            <div>
              <div className="title">Event Log</div>
              <div className="subtitle">View device's storage.</div>
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
                    <th style={{width: '220px'}}>Position</th>
                    <th style={{width: '170px', textAlign: 'right'}}>Audio</th>
                    <th style={{width: '100px'}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event, index) => (
                    <tr key={event.id != null ? event.id : `event-${index}`}>
                      <td><span className="rownum">{event.event_number}</span></td>
                      <td className="time">{event.time}</td>
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
                        {formatCoordinates(event.latitude, event.longitude).split('\n').map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
                      </td>
                      <td className="audio-cell">
                        {event.audio_file_path ? (
                          <AudioPlayer eventId={event.id} />
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
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default TimelineView;
