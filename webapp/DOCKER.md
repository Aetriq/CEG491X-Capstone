# Docker â€“ database and backend

The backend uses **SQLite**. In Docker, the DB file is stored at `/data/echolog.db` inside the container and persisted with a **named volume** (`sqlite_data`).

## Port

Compose maps **host port 3001** to container 3001.

- **API from host:** http://localhost:3001  
- **Health:** http://localhost:3001/api/health  

**âš ï¸ If port 3001 is already in use** (e.g., local nodemon/server), stop it first:
```bash
# Windows: find process using 3001
netstat -ano | findstr :3001
# Kill PID if needed, or stop your local backend
```

Then restart Docker:
```bash
docker compose down
docker compose up -d --build
```

## Run

```bash
cd webapp
docker compose up -d --build
```

## Environment

| Variable      | Default           | Description                          |
|---------------|-------------------|--------------------------------------|
| `SQLITE_PATH` | `/data/echolog.db` | Path to SQLite file (persisted in volume) |
| `PORT`        | `3001` (inside container) | HTTP port inside container     |
| `USE_MOCK_DATA` | `false` | Disables in-memory MockData so timelines persist to SQLite |

## Frontend

Point Vite proxy or API base URL to **http://localhost:3001** when using Docker backend.

## Stop / remove

```bash
docker compose down
```

Data in volume `sqlite_data` is kept. To wipe DB:

```bash
docker compose down -v
```
