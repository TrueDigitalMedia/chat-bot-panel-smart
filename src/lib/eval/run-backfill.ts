import { loadLocalEnv } from '@/lib/db/seed/load-local-env'

loadLocalEnv()

async function main(): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set. Check your .env file.')
    process.exit(1)
  }

  const onlyMissing = process.argv.includes('--only-missing')
  const leadArg = process.argv.find((a) => a.startsWith('--lead='))
  const leadIds = leadArg ? [leadArg.slice('--lead='.length)].filter(Boolean) : undefined

  const { backfillPhase1Evals, evaluateLeadManually } = await import('./persist-eval')

  if (leadIds?.length === 1) {
    console.log(`Running eval for lead ${leadIds[0]}...`)
    const out = await evaluateLeadManually(leadIds[0]!)
    console.log(JSON.stringify(out, null, 2))
    if ('skipped' in out && out.skipped) process.exit(2)
    process.exit(out.result.passed ? 0 : 1)
  }

  console.log(
    `Backfilling Phase-1 evals${onlyMissing ? ' (only missing)' : ' (all evaluable)'}...`,
  )
  const summary = await backfillPhase1Evals({ leadIds, onlyMissing })

  console.log(
    JSON.stringify(
      {
        evaluated: summary.evaluated,
        skipped: summary.skipped,
        passed: summary.passed,
        failed: summary.failed,
      },
      null,
      2,
    ),
  )

  for (const r of summary.results) {
    if ('skipped' in r && r.skipped) {
      console.log(`  skip  ${r.leadId} — ${r.skipReason}`)
    } else if ('result' in r) {
      const mark = r.result.passed ? 'PASS' : 'FAIL'
      console.log(
        `  ${mark}  ${r.leadId} — score=${r.result.overallScore} reason=${r.reason}`,
      )
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
