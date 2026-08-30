// Dedicated vitest config for the acceptance gates (`npm run gates`).
// Kept separate from the root vitest.config.ts so the unit-test include
// pattern (tests/**/*.test.ts) never collects gates, and gates never run
// as part of `npm test`. Gates are the build-failing acceptance, driven by
// scripts/run-gates.mjs only.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/gates/*.gate.ts'],
  },
})
