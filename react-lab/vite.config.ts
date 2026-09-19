/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react({ compiler: true }), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },   // Part 16, file 02
  },
  server: {
    host: true,             // listen on 0.0.0.0 so the sandbox preview proxy can reach it
    allowedHosts: true,     // the preview is served under a *.e2b.app hostname
    port: 5199,
    strictPort: true,
    proxy: {
      // Part 16, file 02: the dev server forwards /api to the backend, so the app uses relative URLs
      '/api': { target: 'http://localhost:8098', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Part 16, file 03: put framework code in its own long-lived chunk
        manualChunks: (id: string) => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    env: {
      // Part 16, file 04: tests get a deterministic API base URL, whatever .env says.
      // Relative, so it matches MSW handlers written as '/api/...' (Part 13, file 05).
      VITE_API_URL: '/api',
      VITE_APP_NAME: 'React Lab (test)',
    },
    css: false,
  },
});
