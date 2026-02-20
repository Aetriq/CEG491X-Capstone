#!/usr/bin/env python3
"""
Audio filtering script for EchoLog
Applies lowpass/highpass filter to audio files
"""

import sys
import os
import numpy as np
from scipy.signal import butter, lfilter
from scipy.io import wavfile

def filter_audio(input_file, output_file, cutoff=400, order=3, filter_type='lowpass'):
    """
    Filter audio file using Butterworth filter
    
    Args:
        input_file: Path to input audio file
        output_file: Path to output filtered audio file
        cutoff: Cutoff frequency in Hz (default: 400)
        order: Filter order (default: 3)
        filter_type: 'lowpass' or 'highpass' (default: 'lowpass')
    """
    try:
        # Read audio file
        fs, data = wavfile.read(input_file)
        
        # Convert stereo to mono if needed
        if len(data.shape) > 1:
            data = np.mean(data, axis=1)
        
        # Design and apply filter
        b, a = butter(N=order, Wn=cutoff, btype=filter_type, analog=False, fs=fs)
        filtered_signal = lfilter(b, a, data)
        
        # Normalize and save
        filtered_signal = filtered_signal.astype(np.int16)
        wavfile.write(output_file, fs, filtered_signal)
        
        print(f"Filtered audio saved to {output_file}")
        return True
    except Exception as e:
        print(f"Error filtering audio: {e}", file=sys.stderr)
        return False

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python filter_audio.py <input_file> <output_file> [cutoff] [order] [filter_type]")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    cutoff = int(sys.argv[3]) if len(sys.argv) > 3 else 400
    order = int(sys.argv[4]) if len(sys.argv) > 4 else 3
    filter_type = sys.argv[5] if len(sys.argv) > 5 else 'lowpass'
    
    success = filter_audio(input_file, output_file, cutoff, order, filter_type)
    sys.exit(0 if success else 1)
