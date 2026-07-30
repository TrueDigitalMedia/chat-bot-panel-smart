import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'

// Local dev keeps POSTGRES_URL in .env/.env.local, which nothing auto-loads for a
// standalone tsx script (unlike `next dev`/`next build`). Vercel's build has no such
// file — env vars are injected straight into process.env — so each load is wrapped to
// no-op when the file is absent rather than crashing the whole migration.
for (const file of ['.env', '.env.local']) {
  try {
    process.loadEnvFile(file)
  } catch {
    // File doesn't exist — fine, rely on already-set process.env (Vercel's case).
  }
}

/**
 * Runs migrations over Neon's HTTP driver (plain HTTPS, no WebSocket) — unlike
 * `drizzle-kit migrate`, which auto-detects neon.tech hosts and switches to the
 * websocket-based `@neondatabase/serverless` driver. That websocket handshake hangs
 * indefinitely in some networks/CI sandboxes (this repo's Vercel builds included),
 * so this bypasses drizzle-kit's CLI entirely in favor of the same HTTP client the
 * app itself already uses at runtime (db/client.ts) — same protocol, so if the app
 * can reach Neon, migrations can too.
 */
async function main(): Promise<void> {
  const url = process.env.POSTGRES_URL
  if (!url) {
    console.error('POSTGRES_URL is not set')
    process.exit(1)
  }

  const sql = neon(url)
  const db = drizzle(sql)

  console.log('Applying migrations...')
  await migrate(db, { migrationsFolder: './src/lib/db/migrations' })
  console.log('Migrations applied successfully')
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
