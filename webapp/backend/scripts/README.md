# EchoLog Python Scripts

The Node backend runs these scripts by calling Python. It tries, in order: `python`, `python3`, then on Windows `py -3`. If your packages (numpy, scipy, openai-whisper) are installed in a different interpreter (e.g. the one used when you run `pip install`), set:

```bash
# Windows (PowerShell) – use the Python that has the packages, e.g. from py -3 -0p or where python
$env:ECHOLOG_PYTHON = "py -3"

# Or full path to the interpreter that has numpy/whisper
$env:ECHOLOG_PYTHON = "C:\Users\YourName\AppData\Local\Programs\Python\Python313\python.exe"
```

Restart the backend after setting `ECHOLOG_PYTHON`.

## filter_audio.py

Applies a Butterworth lowpass/highpass filter to WAV audio.

**Dependencies:** `numpy`, `scipy`

```bash
pip install numpy scipy
python filter_audio.py input.wav output.wav [cutoff] [order] [lowpass|highpass]
```

## transcribe_audio.py

Transcribes audio using **ElevenLabs** (if `ELEVENLABS_API_KEY` is set), then **OpenAI API**, then **local Whisper**.

**ElevenLabs (tried first):** Set `ELEVENLABS_API_KEY` in the backend `.env` file. Uses `scribe_v2` model. Install: `pip install elevenlabs`.

**OpenAI API:** Set `OPENAI_API_KEY` in `.env` to use Whisper API if ElevenLabs is not set or fails. Install: `pip install openai`.

**Local Whisper:** If no API key is set or both APIs fail, uses local `openai-whisper`. Dependencies: `openai-whisper`, `torch`.

```bash
# ElevenLabs: add ELEVENLABS_API_KEY=... to webapp/backend/.env
pip install elevenlabs
python transcribe_audio.py audio.wav --output_json out.json

# Or OpenAI: add OPENAI_API_KEY=sk-... to .env
pip install openai

# Or local Whisper (no API):
pip install openai-whisper torch
python transcribe_audio.py audio.wav --model base --output_json out.json
```

- **--model**: `tiny`, `base`, `small`, `medium`, `large-v2` (default: base)
- **--language**: e.g. `en` for English, or omit for auto-detect

Output JSON format:

```json
{
  "text": "full transcript",
  "language": "en",
  "segments": [{ "start": 0.0, "end": 1.5, "text": "Hello" }]
}
```

## Backend API (audio routes)

- **POST /api/audio/transcribe** – Upload audio → filter → transcribe. Returns JSON only: `{ success, transcription, segments, language, duration }`. No file downloads.
- **POST /api/audio/filter-and-transcribe** – Upload → filter → transcribe → create timeline. Returns `{ timelineId, events }`.
- **POST /api/audio/from-local** – Same pipeline using a **local file path** (no upload). Body: `{ "filePath": "relative/path/within/base.wav" }`. The path must be under `LOCAL_AUDIO_BASE` (default: backend `uploads` folder). Returns `{ timelineId, events }`.

Optional env: `LOCAL_AUDIO_BASE` – directory under which from-local `filePath` is resolved (default: `uploads` next to backend).
