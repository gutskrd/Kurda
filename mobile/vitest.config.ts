import { defineConfig } from 'vitest/config';

// everything else is vitest's default; the setup only gives screens time to draw (src/testing/setup.ts)
export default defineConfig({
  test: {
    setupFiles: ['./src/testing/setup.ts'],
  },
});
