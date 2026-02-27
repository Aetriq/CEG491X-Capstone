// CEG491X-Capstone/echolog-webapp/backend/src/swagger.js
// NEW: Swagger configuration for API documentation
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EchoLog API',
      version: '1.0.0',
      description: 'API for managing audio timelines and transcription',
    },
    servers: [
      {
        url: 'http://localhost:3001/api',
        description: 'Development server',
      },
    ],
  },
  // Path to the API routes files – we'll add JSDoc comments there
  apis: ['./src/routes/*.js'],
};

const specs = swaggerJsdoc(options);
module.exports = specs;