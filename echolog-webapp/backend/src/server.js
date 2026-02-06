// backend/src/server.js

// This is the MAIN server file. It starts everything.
const express = require('express');
const cors = require('cors');
const path = require('path'); // ADDED: Missing path import
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Add to your server.js file after other imports:
const authRoutes = require('./routes/auth.routes');
const fileRoutes = require('./routes/file.routes');

// Middleware (software that processes requests)
app.use(cors());  // Allows frontend to talk to backend
app.use(express.json());  // Understands JSON data

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);

// Add to serve uploaded files:
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Simple test route
app.get('/', (req, res) => {
  res.json({ message: 'EchoLog Backend is running!' });
});

// REMOVED: Duplicate auth routes registration
// app.use('/api/auth', require('./routes/auth.routes'));

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
  console.log(`📁 Frontend should be at http://localhost:3000`);
});