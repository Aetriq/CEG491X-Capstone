// CEG491X-Capstone/webapp/Backend/scripts/seed-admin.js

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, closeDatabase } = require('../database/db');

const username = process.env.ADMIN_USER || 'admin';
const email = process.env.ADMIN_EMAIL || 'admin@localhost';
const password = process.env.ADMIN_PASSWORD || 'admin123';

function finish(code) {
  closeDatabase().then(() => process.exit(code)).catch(() => process.exit(code));
}

setTimeout(() => {
  db.serialize(() => {
    db.run('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0', () => {});
    db.get('SELECT id, username FROM users WHERE username = ? OR email = ?', [username, email], (err, row) => {
      if (err) { console.error(err); return finish(1); }
      if (row) {
        db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [row.id], (e) => {
          if (e) console.error(e);
          else console.log('Existing user marked admin:', row.username, 'id=' + row.id);
          finish(0);
        });
        return;
      }
      bcrypt.hash(password, 10, (hashErr, passwordHash) => {
        if (hashErr) { console.error(hashErr); return finish(1); }
        db.run(
          'INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, 1)',
          [username, email, passwordHash],
          function (insertErr) {
            if (insertErr) {
              if (insertErr.message && insertErr.message.includes('no column')) {
                console.error('Add is_admin column first: restart backend once, or run ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
              }
              console.error(insertErr);
              return finish(1);
            }
            console.log('Admin user created.');
            console.log('  Username:', username);
            console.log('  Email:   ', email);
            console.log('  Password:', password, '(change after first login)');
            finish(0);
          }
        );
      });
    });
  });
}, 800);
