import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': resolve('src/shared'), '@main': resolve('src/main'), '@renderer': resolve('src/renderer') } },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/renderer/**', 'jsdom']],
    globals: true
  }
});
