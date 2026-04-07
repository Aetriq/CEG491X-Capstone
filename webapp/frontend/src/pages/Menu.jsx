// CEG491X-Capstone/webapp/Frontend/src/pages/Menu.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBle } from '../contexts/BleConnectionContext';
import { useDialog } from '../contexts/DialogContext';
import { useTranslation } from 'react-i18next'; // NEW: i18n
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

function getTimelineDisplayName(timeline) {
  const source = timeline?.created_at || timeline?.date_generated;
  if (!source) return `Timeline #${timeline?.id ?? ''}`.trim();
  const d = new Date(source);
  if (Number.isNaN(d.getTime())) return `Timeline #${timeline?.id ?? ''}`.trim();
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function Menu() {
  const { user, logout } = useAuth();
  const ble = useBle();
  const { showConfirm, showAlert } = useDialog();
  const { t } = useTranslation(); // NEW: i18n
  const navigate = useNavigate();
  const [timelines, setTimelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchDate, setSearchDate] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');

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

  const handleDeleteTimeline = async (e, timelineId) => {
    e.stopPropagation();
    const confirmed = await showConfirm('Delete this timeline? This cannot be undone.', {
      title: 'Delete timeline',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;
    try {
      await axios.delete(`${API_URL}/timelines/${timelineId}`);
      setTimelines((prev) => prev.filter((t) => t.id !== timelineId));
    } catch (error) {
      await showAlert(
        error.response?.data?.error || error.message || 'Failed to delete timeline',
        'Timelines'
      );
    }
  };

  const safeList = timelines.filter((t) => t != null && t.id != null);

  return (
    <div className="menu-container">
      <div className="floating-bg">
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
        <div className="square"></div>
      </div>
      <div className="sidebar">
        <div className="logo">{t('appName')}</div>
        <div className="status-panel">
          Device: <span>{ble.connectionStatus}</span><br />
          Bluetooth: <span>{ble.deviceName}</span>
        </div>
        <div className="nav">
          <div className="menu-item" onClick={() => navigate('/home')}>{t('home')}</div>
          <div className="menu-item active" onClick={() => navigate('/menu')}>Timelines</div>
          <div className="menu-item" onClick={() => navigate('/settings')}>{t('settings')}</div>
          <div className="menu-item" onClick={() => navigate('/account')}>{t('account')}</div>
        </div>
        <div className="user-panel">
          <div className="avatar-circle">
            {user?.username ? user.username.charAt(0).toUpperCase() : '👤'}
          </div>
          <div className="username">{user?.username || t('guest')}</div>
          <div className="logout" onClick={handleLogout}>{t('logout')}</div>
        </div>
      </div>

      <div className="main-content">
        <div className="welcome-hero">
          <h1>{t('welcome')} {user?.username || t('user')}</h1>
          <p>{t('manageTimelines')}</p>
        </div>

        <div className="search-section">
          <input
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            className="search-input"
          />
          <button onClick={handleSearch} className="btn btn-blue">{t('searchByDate')}</button>
          <select
            className="search-input"
            value={sortOrder}
            onChange={(e) => {
              const order = e.target.value;
              setSortOrder(order);
              setTimelines((prev) => sortTimelines(prev, order));
            }}
          >
            <option value="desc">{t('newestFirst')}</option>
            <option value="asc">{t('oldestFirst')}</option>
          </select>
          <button onClick={loadTimelines} className="btn btn-green">{t('showAll')}</button>
        </div>

        <div className="timelines-section">
          <h2>{t('yourTimelines')}</h2>
          {loading ? (
            <div>{t('loading')}</div>
          ) : safeList.length === 0 ? (
            <div className="empty-state">
              {t('noTimelinesFound')} <Link to="/home">{t('connectDevice')}</Link> {t('toGenerate')}.
            </div>
          ) : (
            <div className="timelines-grid">
              {safeList.map((timeline) => (
                <div key={timeline.id} className="timeline-card" onClick={() => handleViewTimeline(timeline.id)}>
                  <div className="timeline-header">
                    <h3>{getTimelineDisplayName(timeline)}</h3>
                    <span className="timeline-date">
                      {timeline.date_generated ? new Date(timeline.date_generated).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <div className="timeline-info">
                    <p>Events: {timeline.events_count ?? 0}</p>
                    <p>{t('created')}: {timeline.created_at ? new Date(timeline.created_at).toLocaleString() : '—'}</p>
                  </div>
                  <div className="control-group" style={{ marginTop: 8 }}>
                    <button className="btn btn-red" onClick={(e) => handleDeleteTimeline(e, timeline.id)}>Delete</button>
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