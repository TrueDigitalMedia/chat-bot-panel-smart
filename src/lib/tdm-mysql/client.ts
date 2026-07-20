import mysql from 'mysql2/promise'
import { env, isClientMysqlConfigured, isClientMysqlSyncEnabled } from '@/lib/env'

let pool: mysql.Pool | null = null

/**
 * Lazy singleton pool. connectionLimit: 1 — a traditional MySQL server behind many
 * independent, ephemeral Vercel serverless processes; each process caps itself at one
 * connection to bound worst-case load without an external connection proxy we don't
 * control. See specs/010-tdm-lead-sync/research.md R2.
 */
export function getClientMysqlPool(): mysql.Pool {
  if (pool) return pool

  pool = mysql.createPool({
    host: env.CLIENT_MYSQL_HOST,
    port: env.CLIENT_MYSQL_PORT,
    user: env.CLIENT_MYSQL_USER,
    password: env.CLIENT_MYSQL_PASSWORD,
    database: env.CLIENT_MYSQL_DATABASE,
    connectionLimit: 1,
    waitForConnections: true,
    connectTimeout: 5000,
    enableKeepAlive: false,
    ssl: env.CLIENT_MYSQL_SSL_CA ? { ca: env.CLIENT_MYSQL_SSL_CA } : undefined,
  })

  return pool
}

export { isClientMysqlConfigured, isClientMysqlSyncEnabled }
