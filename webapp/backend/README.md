# EchoLog Backend API

Backend API server for the EchoLog application built with Node.js and Express.

## Features

- User authentication (Create Account, Sign-In, Sign-Out)
- Timeline management (Generate, View, Edit, Save, Search, Export)
- Audio file handling and playback
- SQLite database for data persistence
- JWT-based authentication
- Sign-in attempt logging

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (copy from `.env.example`):
```bash
PORT=3001
JWT_SECRET=your-secret-key-change-this-in-production
NODE_ENV=development
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Sign in
- `POST /api/auth/logout` - Sign out
- `GET /api/auth/verify` - Verify token

### Timelines
- `POST /api/timelines/generate` - Generate timeline from device data
- `GET /api/timelines` - List user's timelines
- `GET /api/timelines/:id` - View timeline
- `GET /api/timelines/search/date?date=YYYY-MM-DD` - Search timelines by date
- `POST /api/timelines/:id/save` - Save timeline
- `PUT /api/timelines/:id/events/:eventId` - Edit event
- `GET /api/timelines/:id/export` - Export timeline as CSV
- `POST /api/timelines/:id/events/:eventId/audio` - Upload audio file

### Audio
- `GET /api/audio/:eventId` - Play/stream audio recording

## Database Schema

- **users**: User accounts
- **sign_in_attempts**: Login attempt logs
- **timelines**: Timeline records
- **events**: Timeline events/entries
- **audio_recordings**: Audio file metadata

## Use Cases Implemented

✅ Create Account  
✅ Sign-In  
✅ Sign-Out  
✅ Generate Timeline  
✅ View Timeline  
✅ Edit Timeline  
✅ Save Timeline  
✅ Search Timeline  
✅ Export Timeline  
✅ Play Recording  
