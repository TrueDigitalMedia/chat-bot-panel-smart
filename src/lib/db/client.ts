import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

/** Neon HTTP SQL client (tagged template). Returns rows as an array. */
export const sql = neon(process.env.POSTGRES_URL!)

export const db = drizzle(sql, { schema })
