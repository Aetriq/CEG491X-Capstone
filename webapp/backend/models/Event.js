const { db } = require('../database/db');

class Event {
  static async create(timelineId, eventData) {
    const { eventNumber, time, transcript, latitude, longitude, audioFilePath, audioDuration } = eventData;

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO events (timeline_id, event_number, time, transcript, latitude, longitude, audio_file_path, audio_duration)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [timelineId, eventNumber, time, transcript, latitude, longitude, audioFilePath, audioDuration],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, timelineId, ...eventData });
        }
      );
    });
  }

  static async findByTimelineId(timelineId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM events WHERE timeline_id = ? ORDER BY event_number ASC`,
        [timelineId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  static async findById(id) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM events WHERE id = ?`,
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  static async update(id, updates) {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE events SET ${fields}, updated_at = datetime('now') WHERE id = ?`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve({ id, changes: this.changes });
        }
      );
    });
  }

  static async delete(id) {
    return new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM events WHERE id = ?`,
        [id],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }
}

module.exports = Event;
