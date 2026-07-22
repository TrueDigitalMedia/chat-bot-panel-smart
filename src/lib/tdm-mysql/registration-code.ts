import type { RowDataPacket } from 'mysql2/promise'
import { getClientMysqlPool } from './client'

interface RegistrationCodeRow extends RowDataPacket {
  registration_code: string | null
}

/**
 * Reads `registration_code` for this lead's row, written by TDM's own internal
 * process once it creates the panelist — the bot never generates this value itself
 * (client-mysql-integration.md §2). Returns `null` when the column is still empty
 * (not yet written) as well as when no row exists for `tdmLeadId`.
 */
export async function fetchRegistrationCode(tdmLeadId: number): Promise<string | null> {
  const pool = getClientMysqlPool()
  const [rows] = await pool.execute<RegistrationCodeRow[]>(
    'SELECT registration_code FROM tb_leads_agente_ia WHERE id = ? LIMIT 1',
    [tdmLeadId],
  )
  const code = rows[0]?.registration_code
  return code && code.trim().length > 0 ? code.trim() : null
}
