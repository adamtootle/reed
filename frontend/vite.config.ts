// We import defineConfig from vitest/config so the `test:` block typechecks.
// `@tailwindcss/vite`'s plugin export uses Vite's Plugin type directly, which is
// slightly broader than vitest/config's re-exported Plugin. The `as any` cast
// silences the structural mismatch — it's a known cost of co-configuring vite
// and vitest in the same file.
import { defineConfig } from 'vitest/config';
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
