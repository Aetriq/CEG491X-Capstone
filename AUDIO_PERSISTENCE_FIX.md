# Audio Persistence Fix - Server Restart Issue

## Problem

When transcription completes:
1. ✅ Timeline and events are saved to **localStorage** (frontend cache)
2. ✅ Audio files are saved to disk in `uploads/filtered/`
3. ❌ Server restarts (nodemon detects file changes)
4. ❌ **mockData is cleared** (in-memory storage lost)
5. ✅ Frontend loads timeline from **localStorage** (transcription visible)
6. ❌ Audio playback fails - backend can't find event (404 error)

## Root Cause

- **Frontend**: Has cached timeline data with transcription text
- **Backend**: Lost event metadata due to mockData being in-memory only
- **Audio files**: Still exist on disk, but backend doesn't know which file belongs to which event

## Solution Implemented

### 1. File Path Query Parameter Route

Added support for serving audio files directly by path:

```
GET /api/audio/:eventId?filePath=<path>
```

**Security**: Validates that file path is within `uploads/` directory to prevent path traversal attacks.

**Usage**: When frontend has cached audio file path, it can pass it directly to backend.

### 2. AudioPlayer Component Update

Updated `AudioPlayer.jsx` to:
- Accept `audioFilePath` prop
- Pass file path as query parameter when available
- Fallback to event-based lookup if no path provided

```jsx
<AudioPlayer 
  eventId={event.id} 
  audioFilePath={event.audio_file_path}
/>
```

### 3. TimelineView Update

Updated `TimelineView.jsx` to pass `audio_file_path` to `AudioPlayer` component:

```jsx
<AudioPlayer 
  eventId={event.id} 
  audioFilePath={event.audio_file_path || event.audioFilePath}
/>
```

### 4. Fallback File Search

When event is not found, backend now:
1. Tries to find audio file using filePath query parameter (preferred)
2. Falls back to searching `uploads/filtered/` directory
3. Uses most recent file as best-effort match
4. Logs detailed debugging information

## How It Works Now

### Scenario 1: Event Found (Normal Case)
```
Frontend → GET /api/audio/1000
Backend → Finds event in mockData/database
Backend → Serves audio file from event.audio_file_path
✅ Audio plays
```

### Scenario 2: Event Lost, Path Provided (Fixed Case)
```
Frontend → GET /api/audio/1000?filePath=uploads/filtered/filtered-123.wav
Backend → Event not found, but filePath provided
Backend → Validates path is in uploads directory
Backend → Serves audio file directly
✅ Audio plays
```

### Scenario 3: Event Lost, No Path (Fallback)
```
Frontend → GET /api/audio/1000
Backend → Event not found, no filePath
Backend → Searches uploads/filtered/ for most recent file
Backend → Serves best-match file
⚠️ May serve wrong file (best-effort)
```

## Files Modified

1. **`webapp/backend/routes/audio.js`**
   - Added filePath query parameter handling
   - Added fallback file search
   - Enhanced security checks

2. **`webapp/frontend/src/components/AudioPlayer.jsx`**
   - Added `audioFilePath` prop
   - Updated URL construction to include filePath parameter

3. **`webapp/frontend/src/pages/TimelineView.jsx`**
   - Passes `audio_file_path` to AudioPlayer component

## Testing

To test the fix:

1. **Transcribe audio** - creates timeline with event
2. **Check localStorage** - verify timeline cached with `audio_file_path`
3. **Restart server** - nodemon restarts, mockData cleared
4. **Load timeline** - frontend loads from cache
5. **Play audio** - should work via filePath parameter

## Debugging

Check backend logs for:
```
[AUDIO-DEBUG] 🎵 AUDIO ACCESS via filePath parameter
[AUDIO-DEBUG]   Requested file path: ...
[AUDIO-DEBUG] ✅ FILE EXISTS [FILEPATH-PARAM]
```

Or if fallback is used:
```
[AUDIO-DEBUG] 🔍 FALLBACK: Searching for audio file...
[AUDIO-DEBUG]   Found X audio files in filtered directory
[AUDIO-DEBUG] ✅ Found fallback audio file
```

## Long-Term Solution

For production, use **database** instead of mockData:

1. Set `USE_MOCK_DATA=false`
2. Ensure database models are available
3. Events persist across server restarts
4. No need for filePath fallback

## Notes

- **Security**: File path validation prevents directory traversal attacks
- **Performance**: Direct file path access is faster than event lookup
- **Reliability**: filePath parameter is more reliable than fallback search
- **Compatibility**: Works with both mockData and database storage
