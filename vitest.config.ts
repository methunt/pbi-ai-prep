import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Acceptance for this task: `npm test` is green with 0 tests until Phase 1 adds them.
    passWithNoTests: true,
  },
})
