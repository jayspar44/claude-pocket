import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The connection layer is plain JS with injected socket and clock, so it
    // needs no DOM. Keep the default node environment - it is faster and it
    // proves the layer is testable without a browser.
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.js'],
  },
});
