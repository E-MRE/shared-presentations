import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: process.env.REQUIRE_BACKEND_EMULATORS === 'true' ? ['./tests/backend-setup.ts'] : [],
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
