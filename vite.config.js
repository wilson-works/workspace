import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The office is a local page - it always talks to the office server on this
// machine, so the dev server is pinned to loopback only. npm run build uses
// tools/build.mjs; this file is for `npm run dev` while working on the page.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4317,
  },
  build: {
    outDir: 'dist',
  },
});
