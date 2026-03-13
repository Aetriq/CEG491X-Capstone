# How to Verify Timelines Are Saved in the Database

EchoLog stores timelines and events in **SQLite**. This guide explains where the data lives and how to confirm it was persisted after transcribing or using **Save to database**.

---

## 0. âš ï¸ IMPORTANT: Disable MockData to Use Database

**By default, MockData (in-memory storage) is enabled.** This means timelines may be saved to memory instead of SQLite, and **data is lost on server restart**.

**To use the database:**

1. **Docker:** Set `USE_MOCK_DATA=false` in `docker-compose.yml` (already added below).
2. **Local backend:** Set environment variable:
   ```bash
   # Windows PowerShell
   $env:USE_MOCK_DATA="false"
   node backend/server.js
   
   # Linux/Mac
   export USE_MOCK_DATA=false
   node backend/server.js
   ```
3. **Or create `.env`** in `backend/`:
   ```
   USE_MOCK_DATA=false
   ```

**Verify MockData is disabled:** After restarting, logs should show:
- âœ… `MockData disabled (USE_MOCK_DATA=false)` or no MockData messages
- âœ… `Connected to SQLite database` + `Database tables initialized`

If you see `[MOCKDATA-DEBUG]` warnings, MockData is still active and timelines won't persist.

---

## 1. Where the database file is

| Environment | Database file |
|---------------|----------------|
| **Local backend (default)** | `backend/database/echolog.db` (created next to `db.js`) |
| **Custom path** | Set `SQLITE_PATH` (e.g. `SQLITE_PATH=C:\data\echolog.db`) |
| **Docker** | Often `/data/echolog.db` in the container when using the compose volume |

The app creates `echolog.db` on first run and initializes tables automatically.

---

## 2. Tables that store timelines

| Table | Purpose |
|-------|--------|
| **users** | Accounts. Each timeline has `user_id` referencing `users.id`. |
| **timelines** | One row per saved timeline: `id`, `user_id`, optional `device_id`, `date_generated`, `created_at`. |
| **events** | Rows per event: `timeline_id`, `event_number`, `time`, `transcript`, `audio_file_path`, etc. |

Timelines exist only in the DB after you **log in** and **save** (or transcribe with auth) so the backend can write with a real `user_id`.

---

## 3. Quick check with SQLite CLI

Install [SQLite](https://www.sqlite.org/download.html) or use **DB Browser for SQLite** and open `echolog.db`.

```bash
cd webapp/backend/database
sqlite3 echolog.db
```

**List timelines:**

```sql
SELECT id, user_id, device_id, date_generated, created_at
FROM timelines
ORDER BY id DESC;
```

**Events for one timeline** (replace `1` with a timeline id):

```sql
SELECT id, timeline_id, event_number, time,
       substr(transcript, 1, 80) AS transcript_preview,
       audio_file_path
FROM events
WHERE timeline_id = 1
ORDER BY event_number;
```

**Who owns each timeline:**

```sql
SELECT t.id AS timeline_id, u.username, t.date_generated
FROM timelines t
JOIN users u ON u.id = t.user_id
ORDER BY t.id DESC;
```

**Counts:**

```sql
SELECT COUNT(*) AS timeline_count FROM timelines;
SELECT COUNT(*) AS event_count FROM events;
```

Exit: `.quit`

---

## 4. Check via the API (logged in)

- **GET /api/timelines** with header `Authorization: Bearer <token>`  
  Returns `timelines` from the database for that user (when not mock-only).

- **GET /api/timelines/:id**  
  Returns that timeline and its events if stored in SQLite.

---

## 5. After "Save to database" in the UI

1. Success message and often redirect to `/timeline/<newId>`.
2. In SQLite, new rows appear in `timelines` and `events`.
3. Reloading the timeline by id without cache should load from the API/DB.

---

## 6. Docker

If the backend uses `SQLITE_PATH=/data/echolog.db`, exec into the container or access the mounted volume and run the same `sqlite3` commands against that path.

**To disable MockData in Docker**, ensure `docker-compose.yml` has:
```yaml
environment:
  - USE_MOCK_DATA=false
```

Then restart:
```bash
docker compose down
docker compose up -d --build
```

---

## 7. Troubleshooting

| Symptom | Check |
|--------|--------|
| No `echolog.db` | Start the backend once. |
| Empty `timelines` | Log in before save; set `USE_MOCK_DATA=false` if you need DB-only. |
| Wrong file | Confirm `SQLITE_PATH` and single backend using that path. |
| **MockData warnings in logs** | Set `USE_MOCK_DATA=false` and restart backend. |

---

## Summary

- **Default DB file:** `backend/database/echolog.db`
- **Tables:** `timelines` + `events` (and `users` for ownership)
- **Verify:** `sqlite3 echolog.db` + `SELECT` queries above, or **GET /api/timelines** while authenticated.
- **âš ï¸ Disable MockData:** Set `USE_MOCK_DATA=false` so timelines persist to SQLite.

## Docker: query DB without sqlite3 CLI

If `docker compose exec backend sqlite3 ...` fails with **executable file not found**, the image does not include the SQLite CLI yet.

### Option A â€” Rebuild after Dockerfile update

The backend Dockerfile installs the `sqlite3` package so the CLI exists in the container:

```bash
docker compose build --no-cache backend
docker compose up -d
docker compose exec backend sqlite3 /data/echolog.db "SELECT COUNT(*) FROM timelines;"
```

### Option B â€” Use Node (no rebuild)

The app already depends on `sqlite3` (Node). From the project root:

```bash
docker compose exec backend node -e "const sqlite3=require('sqlite3').verbose(); const db=new sqlite3.Database(process.env.SQLITE_PATH||'/data/echolog.db'); db.all('SELECT id,user_id,date_generated FROM timelines ORDER BY id DESC',(e,r)=>{console.log(e||r); db.close();});"
```

One-liner to count timelines:

```bash
docker compose exec backend node -e "require('sqlite3').verbose().Database('/data/echolog.db').get('SELECT COUNT(*) AS n FROM timelines',(e,r)=>console.log(e||r));"
```

### Option C â€” Copy DB to host

```bash
docker compose cp backend:/data/echolog.db ./echolog.db
# Then open echolog.db with DB Browser for SQLite or local sqlite3
```
