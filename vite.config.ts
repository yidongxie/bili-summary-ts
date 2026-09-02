import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite is the *frontend* build tool only. The Node/Express server still
// builds via `tsc` (see tsconfig.json + `npm run build`). Frontend output
// lands in public/dist/, which Express serves as static assets at runtime
// (see src/index.ts).
export default defineConfig({
  root: path.resolve(__dirname, 'web'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'web/src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'public/dist'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split heavy vendor deps into their own chunks so the app shell loads
        // fast and markmap/d3 is only fetched when needed.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]react(-dom)?[\\/]|[\\/]scheduler[\\/]/.test(id)) return 'react-vendor';
          if (/lucide-react/.test(id)) return 'icons';
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    // During `npm run dev:web`, proxy /api/* to the Express server so the
    // frontend can talk to the same routes it talks to in production.
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
