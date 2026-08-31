import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      // jsdom's Request cannot resolve a relative URL, so tests exercise the
      // client against an absolute origin. Production still uses '/api'.
      env: { VITE_API_BASE_URL: 'http://localhost/api' },
    },
  }),
);
