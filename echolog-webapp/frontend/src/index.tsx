import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css'; // Connects to the global.css file
import App from './App';

// The "as HTMLElement" bit is the TypeScript way of saying "I promise this element exists"
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);