// echolog-webapp/frontend/src/components/screens/Menu.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import './Menu.css';

interface Timeline {
  id: number;
  device_id: string | null;
  date_generated: string;
  created_at: string;
  updated_at: string;
}

const API_URL = '/api';

const Menu: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchDate, setSearchDate] = useState('');

  useEffect(() => {
    loadTimelines();
  }, []);

  const loadTimelines = async () => {
    try {
      const response = await axios.get(`${API_URL}/timelines`);
      setTimelines(response.data.timelines);
    } catch (error) {
      console.error('Error loading timelines:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchDate) {
      loadTimelines();
      return;
    }
    try {
      const response = await axios.get(`${API_URL}/timelines/search/date?date=${searchDate}`);
      setTimelines(response.data.timelines);
    } catch (error) {
      console.error('Error searching timelines:', error);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleViewTimeline = (timelineId: number) => {
    navigate(`/timeline/${timelineId}`);
  };

  return (
    <div className="menu-container">
      <div className="sidebar">
        <div className="logo">EchoLog</div>
        <div className="status-panel">
          Device: Disconnected<br />
          Status: === / ===
        </div>
        <div className="nav">
          <div className="menu-item active">Home</div>
          <div className="menu-item">EchoLog Device →</div>
          <div className="menu-item">Config Settings</div>
          <div className="menu-item">Account</div>
        </div>
        <div className="user-panel">
          <div className="avatar-circle">👤</div>
          <div className="username">{user?.username || 'username'}</div>
          <div className="logout" onClick={handleLogout}>Logout</div>
        </div>
      </div>

      <div className="main-content">
        <div className="welcome-hero">
          <h1>Welcome {user?.username || 'User'}</h1>
          <p>Manage your timelines and recordings</p>
        </div>

        <div className="search-section">
          <input
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            className="search-input"
          />
          <button onClick={handleSearch} className="btn btn-blue">Search by Date</button>
          <button onClick={loadTimelines} className="btn btn-green">Show All</button>
        </div>

        <div className="timelines-section">
          <h2>Your Timelines</h2>
          {loading ? (
            <div>Loading timelines...</div>
          ) : timelines.length === 0 ? (
            <div className="empty-state">No timelines found. Connect a device to generate one.</div>
          ) : (
            <div className="timelines-grid">
              {timelines.map((timeline) => (
                <div key={timeline.id} className="timeline-card" onClick={() => handleViewTimeline(timeline.id)}>
                  <div className="timeline-header">
                    <h3>Timeline #{timeline.id}</h3>
                    <span className="timeline-date">
                      {new Date(timeline.date_generated).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="timeline-info">
                    <p>Device: {timeline.device_id || 'N/A'}</p>
                    <p>Created: {new Date(timeline.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Menu;