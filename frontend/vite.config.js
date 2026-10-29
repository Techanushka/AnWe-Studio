import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' }, // the speech-to-text Web Worker is an ES module
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] }, // [AI] FFmpeg.wasm must not be pre-bundled
  server: {
    port: 5173,
    open: true,
    // Keep the existing /api frontend base URL while forwarding requests to FastAPI.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], globals: false }
});
