import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // The contract source is embedded via `?raw` and deployed byte-for-byte.
    // Inlining assets would be harmless here, but keeping the output
    // deterministic matters for the reproducibility check, so no hashed-name
    // surprises beyond Vite's own defaults.
    sourcemap: false,
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
