# EchoLog Frontend

React-based frontend application for EchoLog.

## Features

- User authentication (Login, Register)
- Timeline viewing and management
- Event editing
- Audio playback
- CSV export
- Responsive design matching the original mockup

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

3. Build for production:
```bash
npm build
```

## Project Structure

```
src/
  ├── components/      # Reusable components (AudioPlayer, etc.)
  ├── contexts/       # React contexts (AuthContext)
  ├── pages/          # Page components (Login, Menu, TimelineView)
  └── App.jsx         # Main app component with routing
```

## Pages

- **Login** (`/login`) - User sign-in
- **Register** (`/register`) - Create account
- **Menu** (`/menu`) - Main menu with timeline list
- **Timeline View** (`/timeline/:id`) - View and edit timeline events

## Styling

Uses CSS modules and custom properties matching the original HTML mockup design. The Frutiger font is expected to be in `/public/fonts/`.
