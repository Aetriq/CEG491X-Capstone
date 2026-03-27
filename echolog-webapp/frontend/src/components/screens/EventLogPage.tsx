/* frontend/src/components/screens/EventLogPage.tsx */
import React from 'react';
import './EventLogPage.css';

interface EventLogPageProps {
  onBack: () => void;
}

const EventLogPage: React.FC<EventLogPageProps> = ({ onBack }) => {
  return (
    <div className="eventlog-container">
      <div className="eventlog-topbar">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <button className="download-btn">Download</button>
      </div>
      <div className="eventlog-content">
        <div className="eventlog-sidebar">
          <div className="sidebar-logo">EchoLog</div>
          <div className="device-card">
            <div className="device-info-row">
              <span className="device-label">Device:</span>
              <span className="device-value">EchoLog-01</span>
            </div>
            <div className="device-info-row">
              <span className="device-label">Status:</span>
              <span className="device-value">Connected</span>
            </div>
          </div>
        </div>
        <div className="eventlog-main">
          <div className="eventlog-header">
            <h1>Event Log</h1>
            <span className="event-count">0 events</span>
          </div>
          <div className="events-table-container">
            <p style={{ padding: '20px', textAlign: 'center' }}>No events to display.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventLogPage;