import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite is never started as a standalone dev server: `server.ts` boots Express
 * and mounts Vite in middleware mode. `appType: 'custom'` disables Vite's own
 * SPA fallback so Express stays in control of routing.
 */
export default defineConfig({
  plugins: [react()],
  appType: 'custom',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
