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
    exclude: ['**/node_modules/**', '.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
