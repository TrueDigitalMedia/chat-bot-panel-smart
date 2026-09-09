import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * CAM golden-master regression suite — see specs/regression/cam-regression-analysis.md.
 * Separate from vitest.config.ts (which excludes tests/regression/**) because this suite
 * needs a real POSTGRES_URL and is run explicitly:
 *   npm run test:regression          (assert — must be zero snapshot diffs)
 *   npm run test:regression:update   (capture baseline, pre-014/015)
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/regression/**/*.test.ts'],
    // Journeys share one DB — run serially so resetLeadTables() can't race.
    fileParallelism: false,
    sequence: { concurrent: false },
    // Each journey turn does several sequential real Neon HTTP round-trips (no local DB) —
    // a ~20-turn journey like C1 legitimately takes 30-40s, not a hang. 90s gives headroom.
    hookTimeout: 90_000,
    testTimeout: 90_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
