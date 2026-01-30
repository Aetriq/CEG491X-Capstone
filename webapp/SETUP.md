# EchoLog Web Application Setup Guide

## Prerequisites

- Node.js (v16 or higher)
- npm (comes with Node.js)

## Initial Setup

### 1. Copy Assets

Copy the following files to the frontend public directory:

```bash
# Copy font file
cp "webapp/Demo/Frontend - Concept/FrutigerLTStd55Roman.woff" webapp/frontend/public/

# Copy boat image (if needed for login page)
cp webapp/boat.png webapp/frontend/public/
```

### 2. Backend Setup

```bash
cd webapp/backend
npm install
cp .env.example .env
# Edit .env and set your JWT_SECRET
npm start
```

The backend will run on `http://localhost:3001`

### 3. Frontend Setup

```bash
cd webapp/frontend
npm install
npm run dev
```

The frontend will run on `http://localhost:3000`

## First Run

1. Start the backend server first
2. Start the frontend development server
3. Navigate to `http://localhost:3000`
4. Create an account or login
5. Start using the application!

## Default Test Account

You can create a new account through the registration page, or use:
- Username: `admin`
- Password: `admin` (after creating the account)

## Troubleshooting

### Database Issues
- The database is created automatically on first run
- If you need to reset, delete `webapp/backend/database/echolog.db`

### Port Conflicts
- Backend default port: 3001 (change in `.env`)
- Frontend default port: 3000 (change in `vite.config.js`)

### CORS Issues
- Make sure backend is running before frontend
- Check that API_URL in frontend matches backend port

### Font Not Loading
- Ensure `FrutigerLTStd55Roman.woff` is in `webapp/frontend/public/`
- Check browser console for 404 errors

## Development

### Backend Development
```bash
cd webapp/backend
npm run dev  # Uses nodemon for auto-reload
```

### Frontend Development
```bash
cd webapp/frontend
npm run dev  # Vite dev server with hot reload
```

### Production Build

Frontend:
```bash
cd webapp/frontend
npm run build
# Output in dist/ directory
```

Backend:
```bash
cd webapp/backend
npm start
```

## Project Structure

```
webapp/
├── backend/              # Node.js/Express API
│   ├── database/         # SQLite database files
│   ├── models/          # Data models
│   ├── routes/          # API routes
│   ├── middleware/      # Auth middleware
│   └── uploads/         # Audio file uploads
│
└── frontend/            # React application
    ├── src/
    │   ├── components/  # React components
    │   ├── contexts/    # React contexts
    │   └── pages/       # Page components
    └── public/          # Static assets
```

## API Endpoints

All API endpoints are prefixed with `/api`:

- Authentication: `/api/auth/*`
- Timelines: `/api/timelines/*`
- Audio: `/api/audio/*`

See `webapp/backend/README.md` for detailed API documentation.
