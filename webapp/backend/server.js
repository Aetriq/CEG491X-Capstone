const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const timelineRoutes = require('./routes/timelines');
const audioRoutes = require('./routes/audio');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/timelines', timelineRoutes);
app.use('/api/audio', audioRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'EchoLog API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`EchoLog Backend API running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  const { closeDatabase } = require('./database/db');
  await closeDatabase();
  process.exit(0);
});

module.exports = app;
