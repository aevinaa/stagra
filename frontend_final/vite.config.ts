import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// FastAPI backend (see `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`).
// 127.0.0.1 is used instead of "localhost" because on Windows "localhost" can resolve
// to IPv6 (::1) while uvicorn listens on IPv4 only.
const BACKEND_URL = 'http://127.0.0.1:8000';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Forward /api/* from the dev server to FastAPI. The browser only talks to the
      // dev-server origin, so the backend needs no CORS configuration.
      // This applies to `npm run dev` only (not to a production build).
      proxy: {
        '/api': {
          target: BACKEND_URL,
        },
      },
    },
  };
});