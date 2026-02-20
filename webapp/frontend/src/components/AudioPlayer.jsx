import React, { useState, useRef, useEffect } from 'react';
import './AudioPlayer.css';

const API_URL = '/api';

function AudioPlayer({ eventId, audioFilePath }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);
  const progressBarRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
    };
  }, []);

  useEffect(() => {
    if (progressBarRef.current) {
      const percentage = duration > 0 ? (currentTime / duration) * 100 : 0;
      progressBarRef.current.style.setProperty('--progress', `${percentage}%`);
    }
  }, [currentTime, duration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      setLoading(true);
      // Build audio URL: use filePath query parameter if available (for cached timelines)
      let audioUrl = `${API_URL}/audio/${eventId}`;
      if (audioFilePath) {
        // Extract relative path from absolute path if needed
        // Backend expects path relative to uploads directory or absolute path
        audioUrl += `?filePath=${encodeURIComponent(audioFilePath)}`;
      }
      audio.src = audioUrl;
      audio.play().catch(err => {
        console.error('Error playing audio:', err);
        console.error('Audio URL attempted:', audioUrl);
        setLoading(false);
      });
    }
    setIsPlaying(!isPlaying);
  };

  const handleLoadedData = () => {
    setLoading(false);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (seconds) => {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        onLoadedData={handleLoadedData}
        onEnded={handleEnded}
        preload="none"
      />
      <div className="audio-controls">
        <div className="progress-bar" ref={progressBarRef}>
          <div className="progress-fill"></div>
        </div>
        <button
          className="play-button"
          onClick={togglePlay}
          disabled={loading}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {loading ? (
            <span className="loading-spinner">⏳</span>
          ) : isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" fill="#fff"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M5 3v18l15-9L5 3z" fill="#fff"/>
            </svg>
          )}
        </button>
        <span className="time-display">{formatTime(currentTime)}</span>
      </div>
    </div>
  );
}

export default AudioPlayer;
