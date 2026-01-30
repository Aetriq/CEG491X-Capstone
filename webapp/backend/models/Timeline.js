const { db } = require('../database/db');

class Timeline {
  static async create(userId, deviceId = null) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO timelines (user_id, device_id, date_generated) VALUES (?, ?, datetime('now'))`,
        [userId, deviceId],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, userId, deviceId });
        }
      );
    });
  }

  static async findById(id) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM timelines WHERE id = ?`,
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  static async findByUserId(userId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM timelines WHERE user_id = ? ORDER BY date_generated DESC`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  static async searchByDate(userId, date) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM timelines 
         WHERE user_id = ? AND date(date_generated) = date(?) 
         ORDER BY date_generated DESC`,
        [userId, date],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
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
        `UPDATE timelines SET ${fields}, updated_at = datetime('now') WHERE id = ?`,
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
        `DELETE FROM timelines WHERE id = ?`,
        [id],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }
}

module.exports = Timeline;
