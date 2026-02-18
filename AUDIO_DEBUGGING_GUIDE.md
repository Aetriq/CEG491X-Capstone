# Audio Transcription Debugging Guide

## Overview

Comprehensive debugging messages have been added to track audio file lifecycle throughout the transcription process. These messages help identify when and why audio files go missing or become detached from transcriptions.

## Debug Message Format

All debug messages are prefixed with `[AUDIO-DEBUG]` or `[MOCKDATA-DEBUG]` and include:
- **Emoji indicators** for quick visual scanning:
  - ✅ Success/Found
  - ❌ Error/Missing
  - ⚠️ Warning
  - 🔄 Process start
  - 📁 File operations
  - 🎵 Audio streaming
  - 💾 Database operations
  - 🔍 Lookup operations
- **Timestamps** for tracking when events occur
- **Detailed context** including file paths, sizes, and states

## Key Debugging Points

### 1. File Upload Tracking
- **Location**: `audio.js` - Multer storage configuration
- **Tracks**:
  - Upload destination directory
  - Generated filenames
  - Full file paths
  - File sizes and MIME types

### 2. Pipeline Processing
- **Location**: `audio.js` - `runFilterAndTranscribePipeline()`
- **Tracks**:
  - Input file existence before processing
  - Filter script execution and output file creation
  - Filtered audio file existence
  - Transcription script execution
  - Final audio path verification
  - **Critical**: Checks if audio file still exists at pipeline end

### 3. File Attachment to Events
- **Location**: `mockData.js` - `addTranscriptionTimeline()` and `appendTranscriptionEvent()`
- **Tracks**:
  - Audio file existence **before** storing reference in event
  - Audio path stored in event object
  - Verification after event creation
- **Critical**: Warns if file is missing when creating/updating events

### 4. Event Retrieval
- **Location**: `mockData.js` - `getEventById()`
- **Tracks**:
  - Event lookup operations
  - Audio file path from event
  - **Critical**: Verifies audio file exists when event is retrieved
  - Logs missing file warnings with event creation timestamps

### 5. Audio File Access
- **Location**: `audio.js` - `GET /:eventId` route
- **Tracks**:
  - Event lookup (mockData vs database)
  - Audio file path resolution
  - File existence checks with detailed diagnostics
  - File streaming operations (open, error, end, close)
  - **Critical**: Comprehensive file existence check with parent directory listing if missing

### 6. Database Operations
- **Location**: `audio.js` - Transcription and append routes
- **Tracks**:
  - File existence before saving to database
  - Event creation with audio path
  - File existence after database save
  - Error handling with file state logging

## Debug Helper Function

### `debugFileExists(filePath, context)`

A comprehensive file existence checker that:
- Checks if file exists
- Logs file size and modification time if exists
- If missing:
  - Logs expected absolute and relative paths
  - Checks if parent directory exists
  - Lists files in parent directory (first 10)
  - Provides detailed diagnostics

**Usage Example**:
```javascript
debugFileExists('/path/to/audio.wav', 'PIPELINE-END');
```

## Common Scenarios Tracked

### Scenario 1: File Missing During Transcription
**What to look for**:
```
[AUDIO-DEBUG] ❌ FILE MISSING [PIPELINE-END]
[AUDIO-DEBUG] ⚠️⚠️⚠️ CRITICAL: Audio file missing at pipeline end!
```

**Diagnosis**: File was deleted or moved during processing, or never created successfully.

### Scenario 2: File Missing When Accessing Event
**What to look for**:
```
[AUDIO-DEBUG] 🎵 AUDIO ACCESS REQUEST
[MOCKDATA-DEBUG] ⚠️⚠️⚠️ CRITICAL: Audio file missing for event X!
[AUDIO-DEBUG] ❌ FILE MISSING [AUDIO-ACCESS-X]
```

**Diagnosis**: File was deleted after event creation, or path was incorrect when event was created.

### Scenario 3: File Missing Before Saving Reference
**What to look for**:
```
[MOCKDATA-DEBUG] ⚠️⚠️⚠️ WARNING: Audio file does not exist when creating timeline!
[AUDIO-DEBUG] ⚠️⚠️⚠️ WARNING: Audio file missing before saving to mockData!
```

**Diagnosis**: File was deleted between pipeline completion and event creation, or path is incorrect.

### Scenario 4: File Stream Errors
**What to look for**:
```
[AUDIO-DEBUG] ❌ Error streaming audio file for event X
[AUDIO-DEBUG]   Error code: ENOENT
[AUDIO-DEBUG] ❌ FILE MISSING [STREAM-ERROR-X]
```

**Diagnosis**: File was deleted between existence check and stream start, or permissions issue.

## Debugging Workflow

1. **Start backend server** and watch console output
2. **Perform transcription** - watch for pipeline messages
3. **Check file attachment** - verify `BEFORE-MOCK-SAVE` or `BEFORE-DB-SAVE` messages
4. **Access audio** - check `AUDIO-ACCESS` messages for file existence
5. **Review timestamps** - compare file creation vs. access times
6. **Check parent directories** - if file missing, review parent directory listings

## Key Files Modified

1. **`webapp/backend/routes/audio.js`**
   - Added `debugFileExists()` helper function
   - Added debugging throughout all routes
   - Enhanced error handling with file state logging

2. **`webapp/backend/data/mockData.js`**
   - Added debugging to `addTranscriptionTimeline()`
   - Added debugging to `appendTranscriptionEvent()`
   - Added debugging to `getEventById()`
   - File existence checks before storing references

## Interpreting Debug Output

### Healthy Flow Example:
```
[AUDIO-DEBUG] 🎤 TRANSCRIPTION REQUEST START
[AUDIO-DEBUG] ✅ FILE EXISTS [UPLOAD-RECEIVED]
[AUDIO-DEBUG] 🔄 PIPELINE START
[AUDIO-DEBUG] ✅ FILE EXISTS [FILTERED-OUTPUT]
[AUDIO-DEBUG] ✅ FILE EXISTS [PIPELINE-END]
[MOCKDATA-DEBUG] ✅ FILE EXISTS [BEFORE-MOCK-SAVE]
[MOCKDATA-DEBUG] ✅ Timeline created
[AUDIO-DEBUG] 🎵 AUDIO ACCESS REQUEST
[AUDIO-DEBUG] ✅ FILE EXISTS [AUDIO-ACCESS-1000]
[AUDIO-DEBUG] ✅ File stream opened
```

### Problem Flow Example:
```
[AUDIO-DEBUG] ✅ FILE EXISTS [PIPELINE-END]
[MOCKDATA-DEBUG] ⚠️⚠️⚠️ WARNING: Audio file does not exist when creating timeline!
[AUDIO-DEBUG] 🎵 AUDIO ACCESS REQUEST
[MOCKDATA-DEBUG] ⚠️⚠️⚠️ CRITICAL: Audio file missing for event 1000!
[AUDIO-DEBUG] ❌ FILE MISSING [AUDIO-ACCESS-1000]
```

## Next Steps

When debugging:
1. **Check timestamps** - identify when file went missing
2. **Review file paths** - verify absolute vs. relative paths
3. **Check parent directories** - see what files exist
4. **Review error messages** - look for file system errors
5. **Check file permissions** - ensure read access
6. **Verify cleanup code** - check if files are being deleted unintentionally

## Disabling Debug Messages

To reduce verbosity, you can:
1. Comment out `console.log` statements with `[AUDIO-DEBUG]` prefix
2. Use environment variable to control logging level (future enhancement)
3. Filter console output using grep: `npm start 2>&1 | grep AUDIO-DEBUG`
