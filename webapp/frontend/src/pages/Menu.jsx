import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import './Menu.css';

const API_URL = '/api';

function normalizeTimelines(data) {
  const raw = data && data.timelines;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t) => t != null && t.id != null);
}

function sortTimelines(list, order) {
  if (!Array.isArray(list)) return [];
  const copy = [...list];
  copy.sort((a, b) => {
    const aTime = new Date(a.date_generated || a.created_at || 0).getTime();
    const bTime = new Date(b.date_generated || b.created_at || 0).getTime();
    return order === 'asc' ? aTime - bTime : bTime - aTime;
  });
  return copy;
}

function Menu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [timelines, setTimelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchDate, setSearchDate] = useState('');
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' = newest → oldest

  useEffect(() => {
    loadTimelines();
  }, []);

  const loadTimelines = async () => {
    try {
      const response = await axios.get(`${API_URL}/timelines`);
      setTimelines(sortTimelines(normalizeTimelines(response.data), sortOrder));
    } catch (error) {
      console.error('Error loading timelines:', error);
      setTimelines([]);
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
      setTimelines(sortTimelines(normalizeTimelines(response.data), sortOrder));
    } catch (error) {
      console.error('Error searching timelines:', error);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleViewTimeline = (timelineId) => {
    navigate(`/timeline/${timelineId}`);
  };

  const safeList = timelines.filter((t) => t != null && t.id != null);

  return (
    <div className="menu-container">
      <div className="sidebar">
        <div className="logo">EchoLog</div>
        <div className="status-panel">
          Device: Disconnected<br />
          Status: === / ===
        </div>
        <div className="nav">
          <div className="menu-item active" onClick={() => navigate('/home')}>Home</div>
          <div className="menu-item" onClick={() => navigate('/home')}>EchoLog Device</div>
          <div className="menu-item" onClick={() => navigate('/settings')}>Config Settings</div>
          <div className="menu-item" onClick={() => navigate('/account')}>Account</div>
        </div>
        <div className="user-panel">
          <div className="avatar-circle">
            {user?.username ? user.username.charAt(0).toUpperCase() : '👤'}
          </div>
          <div className="username">{user?.username || 'guest'}</div>
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
          <select
            className="search-input"
            value={sortOrder}
            onChange={(e) => {
              const order = e.target.value;
              setSortOrder(order);
              setTimelines((prev) => sortTimelines(prev, order));
            }}
          >
            <option value="desc">Newest → Oldest</option>
            <option value="asc">Oldest → Newest</option>
          </select>
        </div>

        <div className="timelines-section">
          <h2>Your Timelines</h2>
          {loading ? (
            <div>Loading timelines...</div>
          ) : safeList.length === 0 ? (
            <div className="empty-state">No timelines found. Connect a device on <Link to="/home">Home</Link> to generate one.</div>
          ) : (
            <div className="timelines-grid">
              {safeList.map((timeline) => (
                <div key={timeline.id} className="timeline-card" onClick={() => handleViewTimeline(timeline.id)}>
                  <div className="timeline-header">
                    <h3>Timeline #{timeline.id}</h3>
                    <span className="timeline-date">
                      {timeline.date_generated ? new Date(timeline.date_generated).toLocaleDateString() : 'â€”'}
                    </span>
                  </div>
                  <div className="timeline-info">
                    <p>Device: {timeline.device_id || 'N/A'}</p>
                    <p>Created: {timeline.created_at ? new Date(timeline.created_at).toLocaleString() : 'â€”'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Menu;
