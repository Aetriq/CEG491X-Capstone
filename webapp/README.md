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

## User Interaction Flow

1. **Home page**
   - Guests land on the `Home` page, which shows:
     - **Local Upload** card to pick an audio file from the computer.
     - **Download Files** and **Upload Files** cards for interacting with the EchoLog device over BLE.
     - **Connect Device** card to scan for and connect to the EchoLog device via Web Bluetooth.
   - From here, a user can:
     - Connect to the device, list files, download a recording, and trigger **TRANSCRIBE** on that downloaded file.
     - Or select a local audio file and click **TRANSCRIBE & OPEN TIMELINE**.

2. **Transcription (local or device file)**
   - The frontend posts the selected audio to `POST /api/audio/filter-and-transcribe`.
   - The backend:
     - Saves the raw upload under `backend/uploads/`.
     - Optionally filters the audio and writes a filtered copy under `backend/uploads/filtered/`.
     - Runs Whisper via Python to produce segments and full transcript text.
     - Builds a **single event per recording** with:
       - Event time equal to the start of the recording.
       - Transcript equal to the full text of the recording.
       - A duration and an `audio_file_path` pointing at the filtered file.
   - If the user is **not logged in**, the backend returns a **draft timeline** response which the frontend caches in `localStorage` under a key like `echolog_timeline_<id>`.

3. **Timeline view (draft from transcription)**
   - After transcription, the app navigates to `/timeline/:id`.
   - `TimelineView`:
     - First looks for `echolog_timeline_<id>` in `localStorage`.
     - If found, loads that cached timeline and events, normalizes their fields, and marks the view as **“Unsaved (from transcription)”**.
     - If not cached, it falls back to fetching from `GET /api/timelines/:id`.
   - The user can:
     - See each event’s **time**, **transcript**, **GPS position** (if present), and **audio**.
     - Play audio for an event via the `AudioPlayer` component, which streams from `GET /api/audio/:eventId`.
     - Inline edit event transcripts.

4. **Saving and exporting**
   - **Download CSV** (top-right) calls `GET /api/timelines/:id/export` to download a CSV of all events.
   - **Save to database** (bottom-right):
     - Available when the timeline came from transcription (cache).
     - If the user is **not logged in**, they are redirected to log in.
     - If logged in, `TimelineView` posts the current events to `POST /api/timelines/generate`, which:
       - Creates a persistent timeline row in SQLite.
       - Creates event rows (including audio file path & duration if present).
       - Returns the new timeline ID; the frontend clears the cache and navigates to the new persistent timeline.
   - **Save Timeline** (for existing DB timelines) calls `POST /api/timelines/:id/save` to confirm persistence / update timestamps.

5. **Authentication & navigation**
   - From the Home / Menu pages, users can:
     - Register, sign in, and sign out.
     - Once authenticated, their timelines are stored under their user account in SQLite.
   - The **Main Menu** button in `TimelineView` (top-right) routes back to `/home` for logged-in users or `/menu` for guests.

## Use Cases Implemented

### Authentication

- ✅ **Create Account**: Users can register with username, email, and password
- ✅ **Sign-In**: Users can sign in with username/password (attempts are logged)
- ✅ **Sign-Out**: Users can sign out (token removed client-side)

### Timeline Management

- ✅ **Generate Timeline**: Create timeline from device data with events
- ✅ **View Timeline**: Display timeline with all events, transcripts, positions, and audio
- ✅ **Edit Timeline**: Edit event transcripts inline on the `TimelineView` page
- ✅ **Save Timeline**: Save an existing timeline to the database
- ✅ **Search Timeline**: Search timelines by date
- ✅ **Export Timeline**: Download timeline as CSV file
- ✅ **Save Draft Transcriptions to DB**: Convert a cached transcription timeline (from local upload / BLE download) into a persistent database timeline via **Save to database**.

### Audio

- ✅ **Play Recording**: Stream and play audio files associated with events
- ✅ **Filter & Transcribe**: `POST /api/audio/filter-and-transcribe` filters uploaded audio, runs Whisper, and creates a single consolidated event per recording.
- ✅ **Append Recording**: `POST /api/audio/append/:timelineId` filters & transcribes another recording and appends a new event to an existing timeline (mock data or database).
- ✅ **Draft Timelines from Transcription**: Transcription responses are cached client-side (via `localStorage`) so users can review and optionally save them to the database later.
- ✅ **Resilient Playback for Drafts**: The audio API supports a `filePath` query parameter so cached timelines can still play audio even if in-memory mock data is lost after a server restart.

### Device Connectivity & BLE (Home Page)

- ✅ **Connect via Web Bluetooth**: Scan for and connect to an EchoLog device over BLE (Chrome/Edge on HTTPS or localhost).
- ✅ **List & Download Device Files**: Request a directory listing from the device and download raw files over the BLE data channel.
- ✅ **Upload Files to Device**: Stream selected local files to the device in chunks via BLE.
- ✅ **Transcribe Downloaded Recordings**: After a successful download, the UI exposes a **TRANSCRIBE** button that sends the downloaded blob to the `filter-and-transcribe` backend pipeline and opens a timeline.

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

- Harden and expand device connection functionality (e.g., additional BLE services, error recovery).
- Improve transcription UX (progress indicators, model selection, multi-file batch processing).
- Add richer event editing (time adjustment, merge/split events, GPS editing UI).
- Enhance error handling and validation across backend routes (especially audio and BLE paths).
- Add unit and integration tests for audio pipeline, timeline persistence, and BLE flows.
