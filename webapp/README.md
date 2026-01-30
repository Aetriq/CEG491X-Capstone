# EchoLog Web Application

Full-stack web application for managing EchoLog device data, timelines, and recordings.

## Architecture

- **Frontend**: React application with Vite
- **Backend**: Node.js/Express API with SQLite database
- **Authentication**: JWT-based authentication
- **File Storage**: Local file system for audio uploads

## Quick Start

### Backend Setup

1. Navigate to backend directory:
```bash
cd webapp/backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
PORT=3001
JWT_SECRET=your-secret-key-change-this-in-production
NODE_ENV=development
```

4. Start backend server:
```bash
npm start
```

Backend will run on `http://localhost:3001`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd webapp/frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm run dev
```

Frontend will run on `http://localhost:3000`

## Use Cases Implemented

### Authentication
- ✅ **Create Account**: Users can register with username, email, and password
- ✅ **Sign-In**: Users can sign in with username/password (attempts are logged)
- ✅ **Sign-Out**: Users can sign out (token removed client-side)

### Timeline Management
- ✅ **Generate Timeline**: Create timeline from device data with events
- ✅ **View Timeline**: Display timeline with all events, transcripts, positions, and audio
- ✅ **Edit Timeline**: Edit event transcripts, times, and coordinates
- ✅ **Save Timeline**: Save timeline to database
- ✅ **Search Timeline**: Search timelines by date
- ✅ **Export Timeline**: Download timeline as CSV file

### Audio
- ✅ **Play Recording**: Stream and play audio files associated with events

## Project Structure

```
webapp/
  ├── backend/
  │   ├── database/        # Database initialization
  │   ├── models/          # Data models (User, Timeline, Event)
  │   ├── routes/          # API routes
  │   ├── middleware/      # Auth middleware
  │   └── server.js        # Express server
  │
  └── frontend/
      ├── src/
      │   ├── components/  # React components
      │   ├── contexts/    # React contexts
      │   ├── pages/       # Page components
      │   └── App.jsx      # Main app
      └── public/          # Static assets
```

## API Documentation

See `backend/README.md` for detailed API endpoint documentation.

## Development Notes

- Backend uses SQLite for simplicity (can be upgraded to PostgreSQL)
- Audio files are stored in `backend/uploads/`
- Database file is created automatically at `backend/database/echolog.db`
- Frontend proxies API requests to backend during development
- JWT tokens are stored in localStorage

## Next Steps

- Add device connection functionality (USB/Bluetooth)
- Implement real-time transcription integration
- Add file upload for device data
- Enhance error handling and validation
- Add unit and integration tests
