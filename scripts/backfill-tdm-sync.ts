/**
 * One-off backfill: force a full Panel Smart / TDM answers sync for existing leads, so
 * fields that are only pushed "whenever a sync fires" — `telefono`, `fecha_primer_mensaje`,
 * `fecha_ultimo_mensaje` (added 2026-09-02), plus `lead_status`, `nse_region`, `score`,
 * `quota_segment` — land in TDM for conversations that have since gone quiet and would
 * never trigger another sync on their own.
 *
 * The normal sweep (jobs/panel-smart-abandoned-sync, the admin "sync now" batch) only
 * looks at leads with a pending *diff* (never synced, or synced before their last
 * activity), so an already-synced quiet lead is skipped. This script instead runs the
 * per-lead `force: true` path (same as the conversation page's "Sincronizar a TDM"
 * button) across many leads under a single sync run.
 *
 * Usage:
 *   npx tsx scripts/backfill-tdm-sync.ts               # leads already synced at least once
 *   npx tsx scripts/backfill-tdm-sync.ts --all         # every lead (creates TDM records for
 *                                                       # leads that never synced — use with care)
 *   npx tsx scripts/backfill-tdm-sync.ts --dry-run     # print what would be sent, send nothing
 *   npx tsx scripts/backfill-tdm-sync.ts --limit 50    # cap the number of leads
 *   npx tsx scripts/backfill-tdm-sync.ts --delay 500   # ms between leads (default 250)
 *
 * Needs the prod env (DATABASE_URL, PANEL_SMART_SYNC_URL, PANEL_SMART_SYNC_ENABLED,
 * TDM_OAUTH_*). Reads .env / .env.local automatically.
 */
import { isNotNull } from 'drizzle-orm'

for (const file of ['.env', '.env.local']) {
  try {
    process.loadEnvFile(file)
  } catch {
    // optional
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const dryRun = args.includes('--dry-run')
  const limitArg = args.find((a) => a.startsWith('--limit'))
  const delayArg = args.find((a) => a.startsWith('--delay'))
  const limit = limitArg ? Number(limitArg.split(/[=\s]/)[1] ?? args[args.indexOf(limitArg) + 1]) : undefined
  const delayMs = delayArg ? Number(delayArg.split(/[=\s]/)[1] ?? args[args.indexOf(delayArg) + 1]) : 250

  // Imported after loadEnvFile so env.ts reads the populated process.env.
  const { db } = await import('../src/lib/db/client')
  const { leads } = await import('../src/lib/db/schema')
  const { isPanelSmartSyncEnabled } = await import('../src/lib/env')
  const { generateCorrelationId } = await import('../src/lib/correlation')
  const {
    syncPendingPanelSmartAnswers,
    previewPanelSmartSync,
    createPanelSmartSyncRun,
    finishPanelSmartSyncRun,
  } = await import('../src/lib/panel-smart/sync')

  if (!dryRun && !isPanelSmartSyncEnabled()) {
    console.error(
      'Panel Smart sync is not enabled/configured in this environment ' +
        '(PANEL_SMART_SYNC_ENABLED / PANEL_SMART_SYNC_URL / TDM_OAUTH_*). Aborting.',
    )
    process.exit(1)
  }

  const rows = await db
    .select({ id: leads.id, lastSyncAt: leads.panelSmartLastSyncAt })
    .from(leads)
    .where(all ? undefined : isNotNull(leads.panelSmartLastSyncAt))

  const targets = (limit && limit > 0 ? rows.slice(0, limit) : rows).map((r) => r.id)

  console.log(
    `[backfill-tdm-sync] mode=${all ? 'all' : 'already-synced'} dryRun=${dryRun} ` +
      `delayMs=${delayMs} targets=${targets.length}`,
  )
  if (targets.length === 0) {
    console.log('Nothing to do.')
    process.exit(0)
  }

  if (dryRun) {
    let ok = 0
    let nothing = 0
    for (const id of targets) {
      const preview = await previewPanelSmartSync(id, { force: true })
      if (preview.status === 'ok') {
        ok++
        console.log(`  ${id}: ${preview.payload?.responses.length ?? 0} responses`)
      } else {
        nothing++
        console.log(`  ${id}: ${preview.status}`)
      }
    }
    console.log(`[backfill-tdm-sync] dry-run done — ok=${ok} skipped=${nothing}`)
    process.exit(0)
  }

  const runId = await createPanelSmartSyncRun('manual', targets.length)
  console.log(`[backfill-tdm-sync] run ${runId}`)

  let synced = 0
  let failed = 0
  for (let i = 0; i < targets.length; i++) {
    const id = targets[i]
    const ok = await syncPendingPanelSmartAnswers(id, generateCorrelationId(), {
      trigger: 'manual',
      runId,
      force: true,
    })
    if (ok) synced++
    else failed++
    if ((i + 1) % 25 === 0 || i === targets.length - 1) {
      console.log(`  ${i + 1}/${targets.length} (ok=${synced} failed=${failed})`)
    }
    if (delayMs > 0 && i < targets.length - 1) {
      await new Promise((res) => setTimeout(res, delayMs))
    }
  }

  await finishPanelSmartSyncRun(runId)
  console.log(`[backfill-tdm-sync] done — run ${runId}: synced=${synced} failed=${failed}`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
