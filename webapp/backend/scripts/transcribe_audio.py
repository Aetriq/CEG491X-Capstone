#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EchoLog transcription script: ElevenLabs (if ELEVENLABS_API_KEY set), then OpenAI, then local Whisper.
Outputs JSON with segments for timeline creation.
Usage: python transcribe_audio.py <audio_file> [--model small] [--output_json path]
Set ELEVENLABS_API_KEY or OPENAI_API_KEY in .env to use an API; otherwise uses local Whisper.
"""

import argparse
import json
import os
import sys

# Language code mapping: our "en" / "eng" -> ElevenLabs expects ISO-639-1 or ISO-639-3
def _normalize_lang_for_elevenlabs(language):
    if not language:
        return None
    lang = (language.strip() or "")[:3].lower()
    if lang in ("en", "eng"):
        return "en"
    if lang:
        return lang
    return None

def transcribe_with_elevenlabs(audio_path, language=None):
    """Use ElevenLabs speech-to-text when ELEVENLABS_API_KEY is set. Returns same shape as local Whisper.
    On API errors, returns None so caller can fall back to next provider."""
    api_key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from elevenlabs.client import ElevenLabs
    except ImportError:
        print("elevenlabs package required. Run: pip install elevenlabs", file=sys.stderr)
        return None
    try:
        client = ElevenLabs(api_key=api_key)
        with open(audio_path, "rb") as f:
            transcription = client.speech_to_text.convert(
                file=f,
                model_id="scribe_v2",
                tag_audio_events=True,
                language_code=_normalize_lang_for_elevenlabs(language),
                diarize=False,
            )
        # API returns: language_code, language_probability, text, words [{text, start, end, type, speaker_id?, logprob}]
        text = getattr(transcription, "text", None) or ""
        if isinstance(text, str):
            text = text.strip()
        lang = getattr(transcription, "language_code", None) or ""
        raw_words = getattr(transcription, "words", None) or []
        # Build segments from words: group into ~6 second or ~100 char chunks for timeline
        segments = []
        if raw_words:
            chunk_start = None
            chunk_end = None
            chunk_text = []
            for w in raw_words:
                word_text = w.get("text", "") if isinstance(w, dict) else getattr(w, "text", "")
                start = w.get("start", 0) if isinstance(w, dict) else getattr(w, "start", 0)
                end = w.get("end", 0) if isinstance(w, dict) else getattr(w, "end", 0)
                word_str = str(word_text).strip()
                # Flush current chunk if adding this word would exceed ~6s or ~100 chars
                would_duration = (end or 0) - (chunk_start or 0) if chunk_start is not None else 0
                would_text = " ".join(chunk_text + [word_str]) if word_str else " ".join(chunk_text)
                if chunk_start is not None and (would_duration >= 6.0 or len(would_text) >= 100):
                    seg_text = " ".join(chunk_text).strip()
                    if seg_text:
                        segments.append({"start": chunk_start, "end": chunk_end or chunk_start, "text": seg_text})
                    chunk_start = start
                    chunk_end = end
                    chunk_text = [word_str] if word_str else []
                else:
                    if chunk_start is None:
                        chunk_start = start
                    chunk_end = end
                    if word_str:
                        chunk_text.append(word_str)
            seg_text = " ".join(chunk_text).strip()
            if seg_text:
                segments.append({"start": chunk_start or 0, "end": chunk_end or 0, "text": seg_text})
        if text and not segments:
            segments = [{"start": 0, "end": 0, "text": text}]
        return {"text": text, "language": lang, "segments": segments}
    except Exception as e:
        msg = getattr(e, "message", str(e))
        print(f"ElevenLabs API failed ({type(e).__name__}), trying next provider: {msg}", file=sys.stderr)
        return None

def transcribe_with_openai_api(audio_path, language=None):
    """Use OpenAI API (whisper-1) when OPENAI_API_KEY is set. Returns same shape as local Whisper.
    On API errors (quota, rate limit, auth), returns None so caller can fall back to local Whisper."""
    api_key = os.environ.get('OPENAI_API_KEY', '').strip()
    if not api_key:
        return None
    try:
        from openai import OpenAI
    except ImportError:
        return None
    try:
        client = OpenAI(api_key=api_key)
        with open(audio_path, 'rb') as f:
            transcript = client.audio.transcriptions.create(
                model='whisper-1',
                file=f,
                response_format='verbose_json',
                language=(language[:2] if language else None),
            )
    except Exception as e:
        # Rate limit (429), quota, auth errors, etc. -> fall back to local Whisper
        msg = getattr(e, 'message', str(e))
        print(f"OpenAI API failed ({type(e).__name__}), using local Whisper: {msg}", file=sys.stderr)
        return None
    # verbose_json returns: text, language, duration, segments (list of {start, end, text})
    raw_segments = getattr(transcript, 'segments', None) or []
    segments = []
    for seg in raw_segments:
        start = seg.get('start', 0) if isinstance(seg, dict) else getattr(seg, 'start', 0)
        end = seg.get('end', 0) if isinstance(seg, dict) else getattr(seg, 'end', 0)
        text = (seg.get('text', '') if isinstance(seg, dict) else getattr(seg, 'text', '')) or ''
        text = str(text).strip()
        if text:
            segments.append({'start': float(start or 0), 'end': float(end or 0), 'text': text})
    text = (getattr(transcript, 'text', None) or '').strip()
    lang = getattr(transcript, 'language', None) or ''
    if text and not segments:
        segments = [{'start': 0, 'end': 0, 'text': text}]
    return {'text': text, 'language': lang, 'segments': segments}


def main():
    parser = argparse.ArgumentParser(description='Transcribe audio with Whisper, output JSON segments.')
    parser.add_argument('audio_file', help='Path to audio file (wav, mp3, etc.)')
    parser.add_argument('--model', default='base', choices=['tiny', 'base', 'small', 'medium', 'large-v2'],
                        help='Whisper model (default: base) - used only for local Whisper')
    parser.add_argument('--output_json', default=None, help='Output JSON path (default: <audio_file>.transcription.json)')
    parser.add_argument('--language', default=None, help='Language code (e.g. en) or None for auto-detect')
    args = parser.parse_args()

    if not os.path.isfile(args.audio_file):
        print(json.dumps({'error': f'File not found: {args.audio_file}'}), file=sys.stderr)
        sys.exit(1)

    # Try ElevenLabs first, then OpenAI, then local Whisper
    result = transcribe_with_elevenlabs(args.audio_file, args.language)
    if result is None:
        result = transcribe_with_openai_api(args.audio_file, args.language)
    if result is not None:
        out = result
    else:
        # Local Whisper
        try:
            import whisper
        except ImportError:
            print(json.dumps({'error': 'whisper not installed. Run: pip install openai-whisper'}), file=sys.stderr)
            sys.exit(1)
        try:
            import torch
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
        except ImportError:
            device = 'cpu'
        model = whisper.load_model(args.model, device=device)
        options = {'task': 'transcribe', 'verbose': False, 'fp16': (device == 'cuda')}
        if args.language:
            options['language'] = args.language
        result = whisper.transcribe(model, args.audio_file, **options)
        segments = []
        for seg in result.get('segments', []):
            start = seg.get('start', 0)
            end = seg.get('end', 0)
            text = (seg.get('text') or '').strip()
            if text:
                segments.append({'start': start, 'end': end, 'text': text})
        out = {
            'text': result.get('text', '').strip(),
            'language': result.get('language', ''),
            'segments': segments
        }

    output_path = args.output_json or (args.audio_file.rsplit('.', 1)[0] + '.transcription.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(json.dumps(out))


if __name__ == '__main__':
    main()
