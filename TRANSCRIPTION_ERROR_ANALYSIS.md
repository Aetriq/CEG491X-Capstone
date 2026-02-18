# Transcription 500 Internal Server Error - Issue Analysis

## Error Details
- **Frontend Error**: `Local transcribe error: Error: Internal Server Error`
- **Location**: `Home.jsx:52` in `onLocalTranscribe` function
- **Backend Route**: `POST /api/audio/filter-and-transcribe`
- **HTTP Status**: 500 (Internal Server Error)

## Root Cause: Missing Files

### ✅ FIXED: Missing `webapp/backend/routes/audio.js`
**Problem**: The file didn't exist, causing the server to crash when trying to `require('./routes/audio')`.

**Impact**: 
- Server fails to start or crashes on route access
- All `/api/audio/*` routes return 500 errors
- Frontend cannot transcribe audio files

**Solution**: Created the file with all required routes and functionality.

---

### ✅ FIXED: Missing `webapp/backend/data/mockData.js`
**Problem**: The file didn't exist, causing `require('../data/mockData')` to fail.

**Impact**:
- Backend crashes when trying to use mock data
- Transcription fails even if audio.js exists
- Error: `Cannot find module '../data/mockData'`

**Solution**: Created the file with all required mock data functions.

---

## Other Potential Issues (After Files Are Created)

### 1. **Python Not Available** ⚠️ HIGH
**Problem**: Python command not found or not in PATH.

**Error Message**: `Python not available. Set ECHOLOG_PYTHON or install Python.`

**Check**:
```bash
python --version
python3 --version
py -3 --version
```

**Solution**:
- Install Python 3.x
- Set `ECHOLOG_PYTHON` environment variable to your Python path
- Ensure Python is in system PATH

---

### 2. **Python Scripts Missing** ⚠️ HIGH
**Problem**: `filter_audio.py` or `transcribe_audio.py` scripts don't exist.

**Error Message**: `Transcription script not found.`

**Check**:
```bash
ls webapp/backend/scripts/filter_audio.py
ls webapp/backend/scripts/transcribe_audio.py
```

**Solution**:
- Create the Python scripts if they don't exist
- Or ensure they're in the correct location: `webapp/backend/scripts/`

---

### 3. **Python Dependencies Missing** ⚠️ HIGH
**Problem**: Required Python packages not installed (e.g., `whisper`, `numpy`, `scipy`).

**Error Message**: Python subprocess fails with import errors.

**Check**: Look at backend console logs for Python import errors.

**Solution**:
```bash
pip install openai-whisper numpy scipy
# or
pip3 install openai-whisper numpy scipy
```

---

### 4. **File Upload Directory Permissions** ⚠️ MEDIUM
**Problem**: Cannot write to `webapp/backend/uploads/` directory.

**Error Message**: `EACCES: permission denied` or similar file system errors.

**Check**: Backend console logs for file system errors.

**Solution**:
- Ensure `webapp/backend/uploads/` directory exists and is writable
- Check file permissions: `chmod 755 webapp/backend/uploads/`
- On Windows: Ensure directory is not read-only

---

### 5. **File Size Too Large** ⚠️ MEDIUM
**Problem**: Audio file exceeds 100MB limit.

**Error Message**: `File too large (max 100MB)`

**Solution**:
- Reduce file size
- Or increase limit in `audio.js`: `limits: { fileSize: 200 * 1024 * 1024 }`

---

### 6. **Invalid Audio Format** ⚠️ LOW
**Problem**: File is not a valid audio format.

**Error Message**: `Invalid file type. Only audio files are allowed.`

**Solution**:
- Use supported formats: `.wav`, `.mp3`, `.ogg`, `.m4a`
- Ensure file has correct MIME type

---

### 7. **Transcription Timeout** ⚠️ LOW
**Problem**: Transcription takes longer than 10 minutes (600 seconds).

**Error Message**: Request timeout.

**Solution**:
- Increase timeout in `audio.js`: `req.setTimeout(1200000)` (20 min)
- Or use a faster Whisper model (e.g., `tiny` instead of `base`)

---

### 8. **Whisper Model Not Available** ⚠️ MEDIUM
**Problem**: Specified Whisper model not downloaded.

**Error Message**: Python script fails with model download errors.

**Solution**:
- Let Whisper download the model automatically on first use
- Or manually download: `whisper --model base`
- Use a smaller model: Set `WHISPER_MODEL=tiny` in `.env`

---

### 9. **Memory Issues** ⚠️ LOW
**Problem**: Server runs out of memory during transcription.

**Error Message**: Process killed or crashes.

**Solution**:
- Use smaller Whisper model
- Process smaller audio files
- Increase server memory

---

### 10. **Server Not Running** ⚠️ CRITICAL
**Problem**: Backend server is not running.

**Error Message**: `ECONNREFUSED` or network errors.

**Solution**:
- Start backend server: `cd webapp/backend && npm start`
- Check if server is running on port 3001
- Verify proxy configuration in `vite.config.js`

---

## Debugging Steps

1. **Check Backend Console Logs**:
   ```
   Look for:
   - Python command errors
   - File system errors
   - Transcription script errors
   - Stack traces
   ```

2. **Verify Files Exist**:
   ```bash
   # Backend routes
   ls webapp/backend/routes/audio.js
   ls webapp/backend/data/mockData.js
   
   # Python scripts
   ls webapp/backend/scripts/filter_audio.py
   ls webapp/backend/scripts/transcribe_audio.py
   ```

3. **Test Python Availability**:
   ```bash
   python --version
   python3 --version
   ```

4. **Check Server Status**:
   ```bash
   curl http://localhost:3001/api/health
   ```

5. **Test Audio Route Directly**:
   ```bash
   curl -X POST http://localhost:3001/api/audio/filter-and-transcribe \
     -F "audio=@test.wav"
   ```

6. **Check Environment Variables**:
   ```bash
   # In backend directory
   cat .env
   # Look for: ECHOLOG_PYTHON, WHISPER_MODEL, USE_MOCK_DATA
   ```

---

## Most Likely Causes (After Files Created)

1. **Python not installed or not in PATH** (Most Common)
2. **Python scripts missing** (`filter_audio.py` or `transcribe_audio.py`)
3. **Python dependencies missing** (Whisper, numpy, scipy)
4. **File permissions** (cannot write to uploads directory)
5. **Server not running** or wrong port

---

## Quick Fix Checklist

- [x] Created `webapp/backend/routes/audio.js`
- [x] Created `webapp/backend/data/mockData.js`
- [ ] Verify Python is installed: `python --version`
- [ ] Verify Python scripts exist: `ls webapp/backend/scripts/*.py`
- [ ] Install Python dependencies: `pip install openai-whisper numpy scipy`
- [ ] Check uploads directory exists: `ls webapp/backend/uploads/`
- [ ] Restart backend server: `cd webapp/backend && npm start`
- [ ] Check backend console for detailed error messages

---

## Next Steps

1. **Restart your backend server** to load the new files
2. **Check backend console** for detailed error messages
3. **Verify Python is available** and scripts exist
4. **Test with a small audio file** first
5. **Check backend logs** for specific error details

The 500 error should now be resolved if the files were the only issue. If errors persist, check the backend console logs for the specific error message.
