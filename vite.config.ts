import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
