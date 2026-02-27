// backend/src/server.js
// UPDATED: Added Swagger UI, config usage, and job queue integration
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// NEW: Import config
const config = require('./config');

// Friend's routes
const authRoutes = require('./routes/auth');
const timelineRoutes = require('./routes/timelines');
const audioRoutes = require('./routes/audio');

// Your custom file routes (optional)
const fileRoutes = require('./routes/file.routes');

// NEW: Swagger
const swaggerUi = require('swagger-ui-express');
const specs = require('./swagger');

const app = express();
const PORT = config.port; // use config

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', true);

// Prevent connection resets on long-running requests
app.use((req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=600');
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/timelines', timelineRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/files', fileRoutes);

// NEW: Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'EchoLog API is running' });
});

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Express Error Handler:', err);
  console.error('Error stack:', err.stack);
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error',
      ...(config.nodeEnv === 'development' && { stack: err.stack })
    });
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`EchoLog Backend API running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  server.close(async () => {
    const { closeDatabase } = require('./database/db');
    await closeDatabase();
    process.exit(0);
  });
});

module.exports = app;