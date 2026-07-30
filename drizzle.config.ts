import type { Config } from 'drizzle-kit'

export default {
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Use POSTGRES_URL_MIGRATE for migrations (direct connection without pooler)
    // Falls back to POSTGRES_URL (with pooler) if not set
    url: process.env.POSTGRES_URL_MIGRATE || process.env.POSTGRES_URL!,
  },
} satisfies Config
