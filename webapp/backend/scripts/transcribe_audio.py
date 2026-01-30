#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EchoLog transcription script using OpenAI Whisper.
Outputs JSON with segments for timeline creation.
Usage: python transcribe_audio.py <audio_file> [--model small] [--output_json path]
"""

import argparse
import json
import os
import sys

def main():
    parser = argparse.ArgumentParser(description='Transcribe audio with Whisper, output JSON segments.')
    parser.add_argument('audio_file', help='Path to audio file (wav, mp3, etc.)')
    parser.add_argument('--model', default='base', choices=['tiny', 'base', 'small', 'medium', 'large-v2'],
                        help='Whisper model (default: base)')
    parser.add_argument('--output_json', default=None, help='Output JSON path (default: <audio_file>.transcription.json)')
    parser.add_argument('--language', default=None, help='Language code (e.g. en) or None for auto-detect')
    args = parser.parse_args()

    if not os.path.isfile(args.audio_file):
        print(json.dumps({'error': f'File not found: {args.audio_file}'}), file=sys.stderr)
        sys.exit(1)

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

    # Build segments for timeline: start (seconds), end (seconds), text
    segments = []
    for seg in result.get('segments', []):
        start = seg.get('start', 0)
        end = seg.get('end', 0)
        text = (seg.get('text') or '').strip()
        if text:
            segments.append({
                'start': start,
                'end': end,
                'text': text
            })

    out = {
        'text': result.get('text', '').strip(),
        'language': result.get('language', ''),
        'segments': segments
    }

    output_path = args.output_json or (args.audio_file.rsplit('.', 1)[0] + '.transcription.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    # Also print to stdout so caller can capture
    print(json.dumps(out))


if __name__ == '__main__':
    main()
