import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  server: {
    // The backend listens on 127.0.0.1:3000 (see docs/ARCHITECTURE.md).
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  test: {
    name: 'frontend',
    environment: 'jsdom',
  },
});
