import serial
import struct

COM_PORT = 'COM5'
BAUD_RATE = 921600
OUT_FILENAME = 'received.wav'

ser = serial.Serial(COM_PORT, BAUD_RATE, timeout=10)

print("Waiting for AUD0 header...")
while True:
    header = ser.read(4)
    if header == b'AUD0':
        break

print("Header found, reading format info...")
fmt_bytes = ser.read(2)
fmt = struct.unpack('<H', fmt_bytes)[0]

sr_bytes = ser.read(4)
sample_rate = struct.unpack('<I', sr_bytes)[0]

sc_bytes = ser.read(4)
sample_count = struct.unpack('<I', sc_bytes)[0]

print(f"Format: {fmt}, Sample rate: {sample_rate}, Samples: {sample_count}")

# Read the PCM16 payload
with open(OUT_FILENAME, 'wb') as f:
    # Write WAV header
    f.write(b'RIFF')
    f.write(struct.pack('<I', 36 + sample_count*2))  # File size minus 8
    f.write(b'WAVEfmt ')
    f.write(struct.pack('<I', 16))  # PCM chunk size
    f.write(struct.pack('<H', 1))   # Audio format = PCM
    f.write(struct.pack('<H', 1))   # Mono
    f.write(struct.pack('<I', sample_rate))
    f.write(struct.pack('<I', sample_rate*2))  # Byte rate
    f.write(struct.pack('<H', 2))  # Block align
    f.write(struct.pack('<H', 16)) # Bits per sample
    f.write(b'data')
    f.write(struct.pack('<I', sample_count*2)) # Data chunk size

    bytes_to_read = sample_count * 2
    read = 0
    while read < bytes_to_read:
        chunk = ser.read(min(1024, bytes_to_read - read))
        if not chunk:
            continue
        f.write(chunk)
        read += len(chunk)

ser.close()
print("Audio saved to", OUT_FILENAME)
