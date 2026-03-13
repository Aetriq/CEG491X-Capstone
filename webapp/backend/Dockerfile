FROM node:20-bookworm-slim
WORKDIR /app

# System deps:
# - python3/pip: run transcription scripts
# - ffmpeg: required by openai-whisper to decode audio
# - make/g++: build native node modules (sqlite3)
# - sqlite3: CLI for debugging inside container
RUN apt-get update && apt-get install -y \
  python3 python3-pip ffmpeg \
  make g++ sqlite3 \
  && rm -rf /var/lib/apt/lists/*

# Python deps (Docker-only)
# Debian/PEP668: allow installing into system site-packages inside container
RUN pip3 install --no-cache-dir --upgrade pip --break-system-packages \
  && pip3 install --no-cache-dir openai-whisper --break-system-packages

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
RUN npm rebuild sqlite3 --build-from-source

ENV NODE_ENV=production
ENV PORT=3001
ENV SQLITE_PATH=/data/echolog.db
EXPOSE 3001
RUN mkdir -p /data
CMD ["node", "server.js"]
