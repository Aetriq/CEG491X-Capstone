// webapp/Backend/database/pg.js

const { Pool } = require('pg');

// Connection string, e.g. from Supabase or local Postgres
// DATABASE_URL=postgres://user:password@host:5432/dbname
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  // Supabase and many hosted providers require SSL
  ssl: process.env.PGSSLMODE === 'disable'
    ? false
    : { rejectUnauthorized: false }
});

async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

async function closeDatabase() {
  await pool.end();
}

module.exports = { pool, query, closeDatabase };

