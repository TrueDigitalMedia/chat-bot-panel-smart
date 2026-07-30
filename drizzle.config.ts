import type { Config } from 'drizzle-kit'

export default {
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Only used by `drizzle-kit generate` (schema diffing) — actual migrations run
    // via src/lib/db/migrate.ts over HTTP, not this CLI (see that file for why).
    url: process.env.POSTGRES_URL!,
  },
} satisfies Config
