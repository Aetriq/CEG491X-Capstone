# MockData Persistence Issue - Root Cause Analysis

## Problem Identified

From your debug logs, the issue is clear:

1. **Event Created Successfully** ✅
   - Event ID 1000 was created with audio file path
   - Audio file exists and is properly attached
   - Timeline ID 1 was created

2. **Server Restart** 🔄
   - Nodemon detected file changes and restarted the server
   - `[nodemon] starting 'node server.js'` appears in logs

3. **Event Lost** ❌
   - After restart, event 1000 is not found
   - `[MOCKDATA-DEBUG] ❌ Event not found in any source`

## Root Cause

**MockData uses in-memory storage** - all data is stored in JavaScript objects (`transcriptionTimelines`, `events`, `timelines`) that are **reset to empty** when the Node.js process restarts.

### Code Location
```javascript
// webapp/backend/data/mockData.js
const transcriptionTimelines = {};  // ← Empty object, reset on restart
const events = {};                   // ← Empty object, reset on restart
const timelines = {};                // ← Empty object, reset on restart
```

When nodemon restarts the server:
1. Node.js process terminates
2. All in-memory variables are cleared
3. New process starts
4. `mockData.js` is reloaded with empty objects
5. All previously created events/timelines are gone

## Why This Happens

- **MockData is designed for development/testing** - it's meant to be temporary
- **No persistence layer** - data is never saved to disk or database
- **Server restarts clear memory** - this is expected behavior for in-memory storage

## Solutions

### Option 1: Use Database (Recommended) ✅

Your codebase already has SQLite database support! Enable it:

1. **Check if database models are available:**
   ```bash
   # Check if these files exist:
   webapp/backend/models/Event.js
   webapp/backend/models/Timeline.js
   ```

2. **Ensure database is initialized:**
   - Database should auto-initialize on server start
   - Check logs for: `Connected to SQLite database`

3. **Disable mockData:**
   ```bash
   # Set environment variable
   export USE_MOCK_DATA=false
   # Or in Windows:
   set USE_MOCK_DATA=false
   ```

4. **Use authenticated requests:**
   - Database requires user authentication
   - Events are tied to user accounts
   - Data persists across server restarts

### Option 2: Add Persistence to MockData

If you want to keep using mockData, add file-based persistence:

1. **Save to JSON file on changes:**
   ```javascript
   // Save state to file
   fs.writeFileSync('mockData.json', JSON.stringify({
     transcriptionTimelines,
     events,
     timelines,
     nextTimelineId,
     nextEventId
   }));
   ```

2. **Load from file on startup:**
   ```javascript
   // Load state from file
   if (fs.existsSync('mockData.json')) {
     const saved = JSON.parse(fs.readFileSync('mockData.json'));
     Object.assign(transcriptionTimelines, saved.transcriptionTimelines);
     // ... etc
   }
   ```

**Note:** This is not recommended for production - use the database instead.

### Option 3: Prevent Server Restarts During Development

If you're actively testing and don't want restarts:

1. **Temporarily disable nodemon:**
   ```bash
   # Use node directly instead of nodemon
   node server.js
   ```

2. **Configure nodemon to ignore certain files:**
   ```json
   // nodemon.json
   {
     "ignore": ["*.log", "uploads/**"]
   }
   ```

**Note:** This is a workaround, not a solution. Use database for real persistence.

## Debugging Enhancements Added

The debugging code now:

1. **Logs initialization:**
   - Shows when mockData is initialized
   - Warns about data loss on restart
   - Shows initial state (empty)

2. **Logs state on lookup:**
   - Shows how many timelines/events exist
   - Lists all event IDs currently in memory
   - Helps identify when data is missing

3. **Provides diagnostic messages:**
   - Suggests possible causes when events not found
   - Recommends using database for persistence
   - Shows storage availability (mockData vs database)

4. **Warns on creation:**
   - Alerts when using mockData (in-memory)
   - Suggests enabling database
   - Includes warning in API response

## Next Steps

1. **Check database availability:**
   ```bash
   # Look for these in server startup logs:
   Connected to SQLite database
   Database tables initialized
   ```

2. **If database is available:**
   - Set `USE_MOCK_DATA=false`
   - Ensure user authentication is working
   - Events will persist across restarts

3. **If database is not available:**
   - Check `webapp/backend/models/` directory
   - Verify `webapp/backend/database/db.js` exists
   - Check database initialization logs

4. **Monitor debug output:**
   - Watch for `[MOCKDATA-DEBUG] 🔄 MOCKDATA INITIALIZED` on restart
   - Check `[AUDIO-DEBUG] 📊 Storage availability` messages
   - Verify which storage is being used

## Expected Behavior After Fix

**With Database Enabled:**
```
[AUDIO-DEBUG] 📊 Storage availability:
[AUDIO-DEBUG]   MockData: ❌ Not available
[AUDIO-DEBUG]   Database (Event model): ✅ Available
[AUDIO-DEBUG]   Database (Timeline model): ✅ Available
[AUDIO-DEBUG] ✅ Event found in database
```

**With MockData (Current Issue):**
```
[MOCKDATA-DEBUG] 🔄 MOCKDATA INITIALIZED
[MOCKDATA-DEBUG] ⚠️ WARNING: In-memory storage - data will be lost on server restart!
[MOCKDATA-DEBUG] 📊 Current mockData state:
[MOCKDATA-DEBUG]   Transcription timelines: 0  ← Empty after restart!
[MOCKDATA-DEBUG] ❌ Event not found in any source
```

## Summary

- ✅ **Audio files are NOT being deleted** - they exist on disk
- ✅ **Events are created correctly** - with proper audio paths
- ❌ **Events are lost on server restart** - because mockData is in-memory only
- 💡 **Solution: Use database** - for persistent storage across restarts

The debugging messages will now clearly show this issue and guide you to the solution.
