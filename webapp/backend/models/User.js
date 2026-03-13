const { db } = require('../database/db');
const bcrypt = require('bcryptjs');

class User {
  static async create(username, email, password, options = {}) {
    const passwordHash = await bcrypt.hash(password, 10);
    const isAdmin = options.isAdmin ? 1 : 0;

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, ?)`,
        [username, email, passwordHash, isAdmin],
        function(err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint')) {
              reject(new Error('Username or email already exists'));
            } else {
              reject(err);
            }
          } else {
            resolve({ id: this.lastID, username, email, is_admin: isAdmin });
          }
        }
      );
    });
  }

  static async findByUsername(username) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM users WHERE username = ?`,
        [username],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  static async findByEmail(email) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM users WHERE email = ?`,
        [email],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  static async findById(id) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT id, username, email, is_admin, created_at FROM users WHERE id = ?`,
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  static async verifyPassword(user, password) {
    return await bcrypt.compare(password, user.password_hash);
  }

  static async logSignInAttempt(userId, username, success, req) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent') || '';

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO sign_in_attempts (user_id, username, success, ip_address, user_agent) 
         VALUES (?, ?, ?, ?, ?)`,
        [userId, username, success ? 1 : 0, ipAddress, userAgent],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  static async allBasic() {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT id, username, email, is_admin, created_at FROM users ORDER BY id ASC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  static async timelinesBasicByUserId(userId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT id, user_id, device_id, date_generated, created_at, updated_at FROM timelines WHERE user_id = ? ORDER BY id DESC`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }
}

module.exports = User;
