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
    print("Usage: python esp_usb_receiver.py <COM_PORT> [continuous]")
    print("Available ports:")
    for p in list_ports.comports():
        print(f"  {p.device} - {p.description}")
    sys.exit(1)

PORT = sys.argv[1]
BAUD = 115200
OUTFILE_BASE = 'capture'
CONTINUOUS = False
if len(sys.argv) >= 3 and sys.argv[2].lower() in ('continuous', '--continuous', '-c'):
    CONTINUOUS = True

try:
    ser = serial.Serial(PORT, BAUD, timeout=1)
    print('Opened', PORT)
except serial.SerialException as e:
    print(f"Could not open port {PORT}: {e}")
    print("Available ports:")
    for p in list_ports.comports():
        print(f"  {p.device} - {p.description}")
    sys.exit(2)

def reopen_serial(retries=60, delay=1.0):
    """Try to reopen the serial port for a number of retries (seconds)."""
    global ser
    try:
        ser.close()
    except Exception:
        pass
    attempt = 0
    while attempt < retries:
        try:
            ser = serial.Serial(PORT, BAUD, timeout=1)
            print(f"Reopened {PORT} after {attempt} retries")
            return ser
        except Exception as e:
            attempt += 1
            print(f"Reopen attempt {attempt} failed: {e}")
            time.sleep(delay)
    print(f"Failed to reopen port {PORT} after {retries} attempts, exiting")
    sys.exit(3)

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
    wf = None
    continuous_filename = None
    while True:
        try:
            b = ser.read(1)
        except serial.SerialException as e:
            print('Serial read error:', e)
            print('Attempting to reopen serial port...')
            ser = reopen_serial()
            # reset window buffer and continue
            window = bytearray()
            continue
        if not b:
            continue
        window += b
        # keep window at most 4 bytes
        if len(window) > 4:
            window = window[-4:]
        if bytes(window) != b'AUD0':
            continue

        # header found; read remaining header fields
        try:
            fmt_bytes = read_exact(ser, 2)
            fmt, = struct.unpack('<H', fmt_bytes)
            sr_bytes = read_exact(ser, 4)
            sample_rate, = struct.unpack('<I', sr_bytes)
            sc_bytes = read_exact(ser, 4)
            sample_count, = struct.unpack('<I', sc_bytes)
        except serial.SerialException as e:
            print('Serial error while reading header:', e)
            print('Attempting to reopen serial port...')
            ser = reopen_serial()
            window = bytearray()
            continue
        except EOFError as e:
            # timeout reading header — skip and continue
            print('Timeout while reading header, skipping block')
            window = bytearray()
            continue
        print(f'Got block: format={fmt}, rate={sample_rate}, samples={sample_count}')
        try:
            payload = read_exact(ser, sample_count * 2)
        except serial.SerialException as e:
            print('Serial error while reading payload:', e)
            print('Attempting to reopen serial port...')
            ser = reopen_serial()
            window = bytearray()
            continue
        except EOFError as e:
            print('Timeout while reading payload, skipping block')
            window = bytearray()
            continue

        if CONTINUOUS:
            # open continuous file on first block so we can set the header correctly
            if wf is None:
                continuous_filename = f"{OUTFILE_BASE}_continuous.wav"
                try:
                    wf = wave.open(continuous_filename, 'wb')
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(sample_rate)
                    print('Opened continuous file', continuous_filename)
                except Exception as e:
                    print('Failed to open continuous WAV:', e)
                    wf = None
            # append frames
            if wf is not None:
                try:
                    wf.writeframes(payload)
                    print('Appended', len(payload), 'bytes to', continuous_filename)
                except Exception as e:
                    print('Failed to write to continuous WAV:', e)
        else:
            # write WAV to a timestamped file so we don't overwrite previous captures
            try:
                timestamp = int(time.time())
                outfile = f"{OUTFILE_BASE}_{timestamp}.wav"
                with wave.open(outfile, 'wb') as wfw:
                    wfw.setnchannels(1)
                    wfw.setsampwidth(2)
                    wfw.setframerate(sample_rate)
                    wfw.writeframes(payload)
                print('Saved', outfile)
            except Exception as e:
                print('Failed to write WAV:', e)
        # continue listening for more blocks
except KeyboardInterrupt:
    print('\nInterrupted by user, exiting')
    try:
        if wf is not None:
            wf.close()
    except Exception:
        pass
    try:
        ser.close()
    except Exception:
        pass

