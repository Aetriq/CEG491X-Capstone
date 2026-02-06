// frontend/src/components/screens/EventLogPage.tsx
import React, { useState } from 'react';
import './EventLogPage.css';

interface EventLogPageProps {
  onBack: () => void;
}

interface Event {
  id: number;
  time: string;
  transcript: string;
  position: string;
  audioDuration: string;
  audioProgress: number;
}

const EventLogPage: React.FC<EventLogPageProps> = ({ onBack }) => {
  const [events] = useState<Event[]>([
    { id: 1, time: '12:24', transcript: 'Leaving the base now.', position: "45°32'22.95\" N\n073°30'59.28\" W", audioDuration: '0:23', audioProgress: 30 },
    { id: 2, time: '12:52', transcript: 'Arriving on scene. No other units in sight.', position: "45°49'41.16\" N\n073°17'42.99\" W", audioDuration: '0:15', audioProgress: 60 },
    { id: 3, time: '12:57', transcript: 'Two victims located. Loaded them into the boat.', position: "45°49'49.34\" N\n73°17'29.86\" W", audioDuration: '0:22', audioProgress: 40 },
    { id: 4, time: '13:05', transcript: 'Administering oxygen now. Saturation at 93 percent.', position: "45°49'49.34\" N\n73°17'29.86\" W", audioDuration: '0:19', audioProgress: 80 },
    { id: 5, time: '13:21', transcript: 'No one else found. Evacuating the victims.', position: "45°49'49.34\" N\n73°17'29.86\" W", audioDuration: '0:17', audioProgress: 50 },
    { id: 6, time: '13:40', transcript: 'Arriving at the Port now. Ambulance already on site.', position: "45°30'23.45\" N\n73°33'0.13\" W", audioDuration: '0:17', audioProgress: 70 },
    { id: 7, time: '13:56', transcript: 'Transfer to paramedics complete.', position: "45°30'24.55\" N\n73°33'4.68\" W", audioDuration: '0:13', audioProgress: 90 },
    { id: 8, time: '14:23', transcript: 'Back at the base. End of mission 2468.', position: "45°32'22.95\" N\n073°30'59.28\" W", audioDuration: '0:07', audioProgress: 100 },
  ]);

  const [deviceInfo] = useState({
    id: 'ECHLG-01',
    date: '10.27.25',
    status: 'Connected (USB)',
    battery: '87% (5h30m)',
    storage: '12% full (1.9/16G)'
  });

  const [playingAudio, setPlayingAudio] = useState<number | null>(null);

  const handlePlayAudio = (eventId: number) => {
    setPlayingAudio(eventId);
    // Mock audio playback
    console.log(`Playing audio for event ${eventId}`);
  };

  const handleDownloadCSV = () => {
    // Create CSV content
    const csvContent = [
      ['Event', 'Time', 'Transcript', 'Position', 'Duration'],
      ...events.map(event => [
        event.id,
        event.time,
        `"${event.transcript}"`,
        `"${event.position.replace('\n', ' ')}"`,
        event.audioDuration
      ])
    ].map(row => row.join(',')).join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'echolog-events.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="eventlog-container">
      {/* Top Navigation Bar */}
      <div className="eventlog-topbar">
        <button className="back-btn" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18l-6-6 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Main Menu
        </button>
        
        <button className="download-btn" onClick={handleDownloadCSV}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3v9" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 11l4 4 4-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M21 21H3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Download CSV
        </button>
      </div>

      <div className="eventlog-content">
        {/* Sidebar */}
        <div className="eventlog-sidebar">
          <div className="sidebar-logo">EchoLog</div>
          
          <div className="device-card">
            <div className="device-info-row">
              <div className="device-label">Device-ID:</div>
              <div className="device-value">{deviceInfo.id}</div>
            </div>
            
            <div className="device-info-row">
              <div className="device-label">Day:</div>
              <div className="device-value">{deviceInfo.date}</div>
            </div>
            
            <div className="device-info-row">
              <div className="status-icon connected"></div>
              <div className="device-value">{deviceInfo.status}</div>
            </div>
            
            <div className="device-info-row">
              <div className="status-icon battery"></div>
              <div className="device-value">{deviceInfo.battery}</div>
            </div>
            
            <div className="device-info-row">
              <div className="status-icon storage"></div>
              <div className="device-value">{deviceInfo.storage}</div>
            </div>
          </div>

          <div className="sidebar-actions">
            <button className="sidebar-btn">
              Change Day
            </button>
            <button className="sidebar-btn">
              Save data to computer
            </button>
            <button className="sidebar-btn">
              Synchronise clock
            </button>
            <button className="sidebar-btn danger">
              Clear Local Memory
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="eventlog-main">
          <div className="eventlog-header">
            <div>
              <h1>Event Log</h1>
              <p className="subtitle">View device's storage.</p>
            </div>
            <div className="event-count">
              {events.length} events recorded
            </div>
          </div>

          <div className="events-table-container">
            <table className="events-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Event</th>
                  <th style={{ width: '80px' }}>Time</th>
                  <th style={{ width: '40%' }}>Transcript</th>
                  <th style={{ width: '200px' }}>Position</th>
                  <th style={{ width: '160px', textAlign: 'right' }}>Audio</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <span className="event-number">{event.id}</span>
                    </td>
                    <td className="event-time">{event.time}</td>
                    <td className="event-transcript">{event.transcript}</td>
                    <td className="event-position">
                      {event.position.split('\n').map((line, i) => (
                        <React.Fragment key={i}>
                          {line}
                          {i < event.position.split('\n').length - 1 && <br />}
                        </React.Fragment>
                      ))}
                    </td>
                    <td className="event-audio">
                      <div className="audio-player">
                        <div className="progress-bar">
                          <div 
                            className="progress-fill" 
                            style={{ width: `${event.audioProgress}%` }}
                            title={event.audioDuration}
                          ></div>
                        </div>
                        <button 
                          className={`play-button ${playingAudio === event.id ? 'playing' : ''}`}
                          onClick={() => handlePlayAudio(event.id)}
                        >
                          {playingAudio === event.id ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <rect x="6" y="5" width="4" height="14" fill="#fff"/>
                              <rect x="14" y="5" width="4" height="14" fill="#fff"/>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M5 3v18l15-9L5 3z" fill="#fff"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pagination">
            <button className="pagination-btn" disabled>
              ◀ Previous
            </button>
            <span className="pagination-info">Page 1 of 1</span>
            <button className="pagination-btn" disabled>
              Next ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventLogPage;