#!/usr/bin/env python3
"""
Simple USB receiver for framed audio from the ESP32-S3.
Saves the most recent block to capture.wav (mono PCM16).

Usage: python tools/esp_usb_receiver.py COM5

"""
import serial
import struct
import wave
import sys
import time
from serial.tools import list_ports

if len(sys.argv) < 2:
    print("Usage: python esp_usb_receiver.py <COM_PORT>")
    print("Available ports:")
    for p in list_ports.comports():
        print(f"  {p.device} - {p.description}")
    sys.exit(1)

PORT = sys.argv[1]
BAUD = 115200
OUTFILE = 'capture.wav'

try:
    ser = serial.Serial(PORT, BAUD, timeout=1)
    print('Opened', PORT)
except serial.SerialException as e:
    print(f"Could not open port {PORT}: {e}")
    print("Available ports:")
    for p in list_ports.comports():
        print(f"  {p.device} - {p.description}")
    sys.exit(2)

def read_exact(ser, n, timeout=10):
    buf = bytearray()
    start = time.time()
    while len(buf) < n:
        chunk = ser.read(n - len(buf))
        if not chunk:
            # timeout
            if time.time() - start > timeout:
                raise EOFError('Timeout reading from serial')
            continue
        buf.extend(chunk)
    return bytes(buf)

print('Waiting for audio frames... (press Ctrl-C to quit)')
try:
    # simple sliding-window search for magic so we don't block forever
    window = bytearray()
    while True:
        b = ser.read(1)
        if not b:
            continue
        window += b
        # keep window at most 4 bytes
        if len(window) > 4:
            window = window[-4:]
        if bytes(window) != b'AUD0':
            continue

        # header found; read remaining header fields
        fmt_bytes = read_exact(ser, 2)
        fmt, = struct.unpack('<H', fmt_bytes)
        sr_bytes = read_exact(ser, 4)
        sample_rate, = struct.unpack('<I', sr_bytes)
        sc_bytes = read_exact(ser, 4)
        sample_count, = struct.unpack('<I', sc_bytes)
        print(f'Got block: format={fmt}, rate={sample_rate}, samples={sample_count}')
        payload = read_exact(ser, sample_count * 2)
        # write WAV (overwrite with most recent block)
        try:
            with wave.open(OUTFILE, 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sample_rate)
                wf.writeframes(payload)
            print('Saved', OUTFILE)
        except Exception as e:
            print('Failed to write WAV:', e)
        # continue listening for more blocks
except KeyboardInterrupt:
    print('\nInterrupted by user, exiting')
    try:
        ser.close()
    except Exception:
        pass

