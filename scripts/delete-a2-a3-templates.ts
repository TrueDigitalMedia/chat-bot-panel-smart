/**
 * Borra de Twilio Content (y por lo tanto de la WABA en Meta) las 18 plantillas de
 * reenganche de intento 2 y 3 — auditoría 2026-09-16 §6.3.
 *
 * Por qué: `MAX_REENGAGEMENT_ATTEMPTS = 1` hace que solo `a1_*` sea alcanzable, así que
 * estas 18 no se envían desde el 2026-09-01. Pero siguen aprobadas y visibles en Meta
 * Business Manager, donde se leen como una cadena de 3 toques de marketing con lenguaje
 * de urgencia ("Último recordatorio", "¿Lo dejamos?") — que es exactamente la lectura que
 * hizo el análisis de la consola de Meta. Borrarlas hace legible la remediación y evita
 * que subir la constante las reactive en silencio.
 *
 * IRREVERSIBLE: volver a tenerlas exige recrearlas y pasar de nuevo por revisión de Meta
 * (el precedente de `registration_instructions_confirm` fue de días, no de minutos).
 *
 * Uso:
 *   npx tsx scripts/delete-a2-a3-templates.ts            # dry-run, no borra nada
 *   npx tsx scripts/delete-a2-a3-templates.ts --confirm  # borra de verdad
 *
 * Deja las filas de `whatsapp_templates` intactas salvo que pases --purge-db.
 *
 * Ojo con el modo de falla si alguien sube MAX_REENGAGEMENT_ATTEMPTS después de borrar:
 * `sendWhatsAppTemplateOrText` NO lanza cuando la plantilla no está — cae al envío de
 * texto libre (src/lib/whatsapp/send.ts:120-132). Como un nudge de reenganche sale
 * después de silencio, casi siempre fuera de la ventana de 24 h, ese texto libre lo
 * rebota WhatsApp con 63016. O sea: falla, pero del lado del proveedor, no del nuestro.
 * Con --purge-db el SID muerto ni siquiera se intenta; sin él, se intenta y rebota.
 */
import { and, eq } from 'drizzle-orm'

for (const file of ['.env', '.env.local']) {
  try {
    process.loadEnvFile(file)
  } catch {
    // opcional
  }
}

const CONFIRM = process.argv.includes('--confirm')
const PURGE_DB = process.argv.includes('--purge-db')

async function main(): Promise<void> {
  const { db } = await import('@/lib/db/client')
  const { whatsappTemplates } = await import('@/lib/db/schema')
  const { sql } = await import('drizzle-orm')

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    console.error('Falta TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN en el entorno')
    process.exit(1)
  }
  const auth = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`

  // Solo intentos 2 y 3, de cualquier pool. a1_* nunca entra acá.
  const rows = await db
    .select({
      logicalId: whatsappTemplates.logicalId,
      contentSid: whatsappTemplates.contentSid,
    })
    .from(whatsappTemplates)
    .where(
      and(
        eq(whatsappTemplates.provider, 'twilio'),
        sql`${whatsappTemplates.logicalId} ~ '_a[23]_v[0-9]+$'`,
      ),
    )

  if (rows.length === 0) {
    console.log('No hay plantillas a2/a3 para borrar — nada que hacer.')
    return
  }

  console.log(`Plantillas a2/a3 encontradas: ${rows.length}`)
  for (const r of rows) console.log(`  ${r.logicalId.padEnd(28)} ${r.contentSid}`)

  if (!CONFIRM) {
    console.log('\n[DRY-RUN] No se borró nada. Volvé a correr con --confirm para ejecutar.')
    return
  }

  let ok = 0
  const failed: Array<{ logicalId: string; status: number; body: string }> = []

  for (const r of rows) {
    if (!r.contentSid) {
      console.warn(`  ${r.logicalId}: sin content_sid, se omite`)
      continue
    }
    const res = await fetch(`https://content.twilio.com/v1/Content/${r.contentSid}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    })
    // 204 = borrada. 404 = ya no existía (idempotente, lo contamos como éxito).
    if (res.status === 204 || res.status === 404) {
      ok++
      console.log(`  ✓ ${r.logicalId} (${res.status})`)
    } else {
      const body = await res.text().catch(() => '')
      failed.push({ logicalId: r.logicalId, status: res.status, body: body.slice(0, 200) })
      console.error(`  ✗ ${r.logicalId} → HTTP ${res.status} ${body.slice(0, 200)}`)
    }
  }

  console.log(`\nBorradas en Twilio: ${ok}/${rows.length}`)
  if (failed.length > 0) {
    console.error(`Fallaron ${failed.length}. No se toca la DB mientras haya fallos.`)
    process.exit(1)
  }

  if (PURGE_DB) {
    const deleted = await db
      .delete(whatsappTemplates)
      .where(
        and(
          eq(whatsappTemplates.provider, 'twilio'),
          sql`${whatsappTemplates.logicalId} ~ '_a[23]_v[0-9]+$'`,
        ),
      )
      .returning({ logicalId: whatsappTemplates.logicalId })
    console.log(`Filas borradas de whatsapp_templates: ${deleted.length}`)
  } else {
    console.log('Filas de whatsapp_templates intactas (pasá --purge-db si las querés borrar).')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
