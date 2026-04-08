# EchoLog Web Application

Full-stack web application for managing EchoLog device data, timelines, and recordings.

## Architecture

- **Frontend**: React application with Vite
- **Backend**: Node.js/Express API with SQLite database
- **Authentication**: JWT-based authentication
- **File Storage**: Local file system for audio uploads

## How the Frontend and Backend Connect

- **Ports**
  - **Frontend** runs on **port 3000** (Vite dev server). Users open `http://localhost:3000` in the browser.
  - **Backend** runs on **port 3001** (Express). It serves the REST API only; the browser does not open the backend URL directly during normal use.

- **API base path**
  - The frontend uses the path prefix **`/api`** for all backend calls (e.g. `/api/health`, `/api/audio/filter-and-transcribe`, `/api/timelines/:id`). There is no per-environment API base URL in code; everything is relative to the same origin.

- **Proxy in development**
  - In development, the **Vite dev server proxies** requests that start with `/api` to the backend:
    - **Target**: `http://localhost:3001`
    - **Timeout**: 600 seconds (10 minutes) so long-running transcription requests do not time out.
  - So when the frontend does `fetch('/api/audio/filter-and-transcribe', ...)`, the request is sent to the Vite server on port 3000, and Vite forwards it to the Express server on port 3001. The browser only talks to port 3000.

- **What runs where**
  - **Browser (port 3000)**: React app, routing, Web Bluetooth (BLE), `localStorage` (cache, JWT). All user interaction and UI logic run here.
  - **Node (port 3001)**: REST API, SQLite, file uploads (Multer), audio filter/transcribe pipeline (Python/Whisper), in-memory mock data when DB is not used. No static frontend files are served by the backend in development.

- **Authentication**
  - After login or register, the backend returns a JWT. The frontend stores it (e.g. in `localStorage`) and sends it on requests that require auth (e.g. `Authorization: Bearer <token>`). The backend verifies the token and attaches `req.user` for protected routes.

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
   - Guests land on the **Home** page, which shows:
     - **Local Upload** card: pick one or more audio files from the computer, then transcribe (single or batch).
     - **Download Files** and **Upload Files** cards: interact with the EchoLog device over BLE (list, download, upload).
     - **Connect Device** card: scan for and connect to the EchoLog device via Web Bluetooth.
   - From here, a user can:
     - **Local**: Select one or more local audio files and click **TRANSCRIBE**; the first file creates a timeline, the rest are appended. When done, the app navigates to the timeline view.
     - **Device**: Connect to the device, list files, download one or more recordings; then click **TRANSCRIBE** (or **TRANSCRIBE N FILES**) to run the same pipeline on all downloaded audio and open a single timeline.

2. **Transcription (local or device)**
   - The frontend sends audio to the backend via:
     - **First file**: `POST /api/audio/filter-and-transcribe` (creates a new timeline and first event).
     - **Additional files**: `POST /api/audio/append/:timelineId` (appends one event per file to that timeline).
   - Before each request, the frontend may call `GET /api/health` to ensure the backend is up; transcription requests use a long timeout (e.g. 10 minutes).
   - For **local** uploads, the frontend can send **`recording_start_time`** (e.g. from the file’s `lastModified`) so the timeline **Time** column reflects the recording time from file metadata.
   - The backend: saves the upload, optionally filters audio, runs Whisper (Python), and returns a timeline with one event per recording (time, transcript, `audio_file_path`). If the user is not logged in or the app uses mock data, the response is a **draft**; the frontend caches it in `localStorage` under `echolog_timeline_<id>`.

3. **Timeline view**
   - After transcription, the app navigates to **`/timeline/:id`**.
   - **TimelineView**:
     - First tries **cache**: `echolog_timeline_<id>` in `localStorage`. If found, it loads that timeline and events, normalizes fields (time, transcript), **sorts events from earliest to latest by time**, and **renumbers events** (1, 2, 3, …) to match that order.
     - If not in cache, it fetches **`GET /api/timelines/:id`** and applies the same sort and renumbering.
   - The user sees: **Event** (number), **Time**, **Transcript**, **Position**, **Audio**, **Actions**. Audio is played via **AudioPlayer**, which streams from **`GET /api/audio/:eventId`** (optionally with **`?filePath=...`** for cached drafts so playback works even if backend mock data was lost).
   - The user can inline-edit event transcripts (saved via **`PUT /api/timelines/:id/events/:eventId`** when using the database).

4. **Saving and exporting**
   - **Download CSV** (top-right): **`GET /api/timelines/:id/export`** — downloads a CSV of all events.
   - **Save to database** (bottom-right): Shown when the timeline is from cache (transcription draft). If not logged in, the user is sent to log in. If logged in, **`POST /api/timelines/generate`** creates the timeline and events in SQLite and returns the new ID; the frontend clears cache and navigates to that timeline.
   - **Save Timeline**: For timelines already in the database, **`POST /api/timelines/:id/save`** updates persistence/timestamps.

5. **Authentication and navigation**
   - **Menu / Home**: Register, sign in, sign out. JWT is stored client-side and sent on protected API requests.
   - **Main Menu** (top-right on timeline): goes to **/home** (logged in) or **/menu** (guest).

---

## Use Cases Accounted For

### Authentication

- **Create account**: Register with username, email, and password (`POST /api/auth/register`).
- **Sign in**: Sign in with username/password; JWT returned and stored (`POST /api/auth/login`).
- **Sign out**: Sign out; token removed client-side (`POST /api/auth/logout`).
- **Verify session**: Check if the current token is valid (`GET /api/auth/verify`).

### Timeline management

- **Generate timeline**: Create a new timeline (from device data or from **Save to database** after transcription) via `POST /api/timelines/generate`.
- **View timeline**: Load a timeline by ID from cache or `GET /api/timelines/:id`; display events in **time order** with **event numbers 1, 2, 3, …** following that order.
- **Edit event transcript**: Inline edit on TimelineView; persist via `PUT /api/timelines/:id/events/:eventId` when using the database.
- **Save timeline**: Persist or refresh an existing DB timeline with `POST /api/timelines/:id/save`.
- **Search timelines by date**: `GET /api/timelines/search/date?date=...` (authenticated).
- **List user timelines**: `GET /api/timelines` (authenticated).
- **Export timeline**: Download CSV via `GET /api/timelines/:id/export`.
- **Save draft to DB**: Convert a cached transcription timeline (local or BLE) into a persistent timeline via the **Save to database** button and `POST /api/timelines/generate`.

### Audio (local and device)

- **Transcribe one file**: Upload one audio file to `POST /api/audio/filter-and-transcribe`; get back a new timeline and one event.
- **Transcribe multiple files (local card)**: Select multiple files; first file creates the timeline, each following file is sent to `POST /api/audio/append/:timelineId` so all events appear on one timeline. Optional **`recording_start_time`** (from file `lastModified`) is sent so event times match file metadata.
- **Transcribe multiple files (download card)**: After downloading multiple audio files from the device, user clicks **TRANSCRIBE N FILES**; same flow: first file creates timeline, rest append; all events on one timeline.
- **Play recording**: Stream audio with `GET /api/audio/:eventId`; for cached drafts, `GET /api/audio/:eventId?filePath=...` so playback works even if backend lost in-memory event data (e.g. after restart).
- **Append recording**: Add another recording to an existing timeline with `POST /api/audio/append/:timelineId` (filter + transcribe + one new event).
- **Recording time from metadata**: For local uploads, backend uses client-provided **`recording_start_time`** when present (e.g. file last-modified) so the **Time** column in the timeline view shows the correct recording time.

### Device connectivity (BLE)

- **Connect via Web Bluetooth**: Scan and connect to EchoLog device (Home page); requires HTTPS or localhost in supported browsers (e.g. Chrome/Edge).
- **List device files**: Request directory listing from device over BLE; show list in **Download Files** card.
- **Download file(s)**: Download one or more files from the device; each is added to a list and can be transcribed in one batch (earliest creates timeline, rest append).
- **Upload file to device**: Stream a selected local file to the device in chunks over BLE (**Upload Files** card).

### Timeline view behavior

- **Sort by time**: Events are sorted from **earliest to latest** using the **Time** column value (e.g. HH:MM).
- **Event numbering**: After sorting, **Event** column shows **1, 2, 3, …** in that time order.
- **Larger audio controls**: Audio player on the timeline has a larger progress bar and play button; playback volume is at full (1.0) for that view.

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

- Backend uses SQLite for simplicity (can be upgraded to PostgreSQL).
- Audio files are stored in `backend/uploads/` and `backend/uploads/filtered/`.
- Database file is created automatically at `backend/database/echolog.db`.
- **Frontend–backend connection**: In development, the Vite dev server proxies `/api` to the backend (see [How the Frontend and Backend Connect](#how-the-frontend-and-backend-connect)).
- JWT tokens are stored in `localStorage` and sent in the `Authorization` header for protected routes.

## Next Steps

- Harden and expand device connection functionality (e.g., additional BLE services, error recovery).
- Improve transcription UX (progress indicators, model selection, multi-file batch processing).
- Add richer event editing (time adjustment, merge/split events, GPS editing UI).
- Enhance error handling and validation across backend routes (especially audio and BLE paths).
- Add unit and integration tests for audio pipeline, timeline persistence, and BLE flows.
