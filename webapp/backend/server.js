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

// Prevent connection resets on long-running requests
app.use((req, res, next) => {
  // Set keep-alive headers for all requests
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=600');
  next();
});

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
  console.error('❌ Express Error Handler:', err);
  console.error('Error stack:', err.stack);
  
  // Ensure response is sent
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  } else {
    console.error('⚠️ Response already sent, cannot send error response');
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`EchoLog Backend API running on port ${PORT}`);
});

// Handle uncaught exceptions to prevent server crashes
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION - Server will continue running:', error);
  console.error('Stack:', error.stack);
  // Don't exit - let the server continue running
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
  // Don't exit - let the server continue running
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
  });
  const { closeDatabase } = require('./database/db');
  await closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nSIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
  });
  const { closeDatabase } = require('./database/db');
  await closeDatabase();
  process.exit(0);
});

module.exports = app;
