import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 600000, // 10 min – filter + Whisper can take a long time
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setTimeout?.(600000);
          });
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.setTimeout?.(600000);
          });
        }
      }
    }
  }
});
