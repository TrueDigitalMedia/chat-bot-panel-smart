import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    // Exclude nested worktrees (.claude/worktrees/*) — their test files would otherwise
    // be collected too, but the '@' alias below always resolves against this repo's own
    // src, not the worktree's, so they'd run against the wrong source tree.
    // tests/regression/** is the CAM golden-master suite — it needs a real POSTGRES_URL and
    // is run explicitly via `npm run test:regression`, never as part of the default unit run.
    exclude: ['**/node_modules/**', '.claude/**', 'tests/regression/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
