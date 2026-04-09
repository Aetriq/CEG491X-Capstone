// CEG491X-Capstone/echolog-webapp/backend/src/config.js
// NEW: Central configuration file – replaces direct process.env usage
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 104857600,
  uploadPath: process.env.UPLOAD_PATH || './uploads',
  pythonCmd: process.env.ECHOLOG_PYTHON || 'python3',
  whisperModel: process.env.WHISPER_MODEL || 'base',
  useMockData: process.env.USE_MOCK_DATA !== 'false',
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
  openAiApiKey: process.env.OPENAI_API_KEY,
  // Redis config for Bull
  redisHost: process.env.REDIS_HOST || '127.0.0.1',
  redisPort: parseInt(process.env.REDIS_PORT) || 6379,
};