import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the built site works from any subdirectory
  // of a personal site (e.g. example.com/golf/).
  base: './',
  build: {
    target: 'es2022',
  },
  server: {
    host: true,
  },
});
