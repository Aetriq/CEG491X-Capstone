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

Transcribes audio using OpenAI Whisper and outputs JSON segments for the timeline.

**Dependencies:** `openai-whisper`, `torch`

```bash
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
  "segments": [
    { "start": 0.0, "end": 1.5, "text": "Hello" }
  ]
}
```

The backend pipeline runs: **upload → filter_audio.py → transcribe_audio.py → create timeline → redirect to timeline page.**
