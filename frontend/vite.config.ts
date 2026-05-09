import { defineConfig } from 'vitest/config';
// Cast plugin to any to avoid Vite version mismatch between vitest's bundled
// vite and the top-level vite package (@tailwindcss/vite is built against vite@6).
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [tailwindcss() as any],
  build: {
    outDir: '../Sources/reed/Resources',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8765',
      '/events': {
        target: 'http://localhost:8765',
        changeOrigin: true,
        ws: false,
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
