// CEG491X-Capstone/echolog-webapp/backend/src/jobs/transcriptionQueue.js
// UPDATED: Replaced process.env with config for Redis
const Bull = require('bull');
const path = require('path');
const fs = require('fs');
const { runFilterAndTranscribePipeline } = require('../routes/audio'); // reuse helper functions
const config = require('../config'); // NEW: import config

// Create a Bull queue – use Redis config from config
const transcriptionQueue = new Bull('transcription', {
  redis: { host: config.redisHost, port: config.redisPort }
});

// Process jobs – this runs in a separate thread
transcriptionQueue.process(async (job) => {
  const { inputPath, originalFilename, userId, pythonCmd, model } = job.data;
  console.log(`[QUEUE] Processing job ${job.id} for file ${originalFilename}`);

  try {
    // Run the pipeline (filter + transcribe)
    const { segments, text, language, filteredAudioPath } = await runFilterAndTranscribePipeline(
      inputPath,
      pythonCmd,
      model
    );

    // Return the result so it can be stored in the job completion handler
    return {
      segments,
      text,
      language,
      filteredAudioPath,
      originalFilename,
      userId
    };
  } catch (error) {
    console.error(`[QUEUE] Job ${job.id} failed:`, error);
    throw error; // Bull will mark the job as failed
  }
});

// Optional: listen to events for logging
transcriptionQueue.on('completed', (job, result) => {
  console.log(`[QUEUE] Job ${job.id} completed. Filtered audio: ${result.filteredAudioPath}`);
});

transcriptionQueue.on('failed', (job, err) => {
  console.error(`[QUEUE] Job ${job.id} failed:`, err);
});

module.exports = transcriptionQueue;