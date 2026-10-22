import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' }, // the speech-to-text Web Worker is an ES module
  server: { port: 5173, open: true },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], globals: false }
});
