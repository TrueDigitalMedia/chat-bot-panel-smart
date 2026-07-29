# QStash Recurring Schedule Setup

The Panel Smart abandoned-conversation sync sweep runs **every 3 hours** via QStash recurring schedules (not Vercel Cron, because Vercel Hobby tier is limited to once per day).

## Prerequisites

- Upstash CLI: https://upstash.com/docs/qstash/quickstart
- `QSTASH_TOKEN` already configured in `.env` (it's in the main project `.env`)
- App deployed to Vercel so the endpoint is reachable at a public URL

## Setup (run once)

```bash
upstash qstash schedule create \
  --cron "0 */3 * * *" \
  --url "https://<your-vercel-app-url>/api/jobs/panel-smart-abandoned-sync" \
  --header "Authorization: Bearer $CRON_SECRET"
```

### Parameters explained:
- `--cron "0 */3 * * *"` — every 3 hours (at :00 minutes of hours 0, 3, 6, 9, 12, 15, 18, 21)
- `--url` — your deployed app's endpoint (must be public, e.g., `https://chat-ai-panel.vercel.app/api/jobs/panel-smart-abandoned-sync`)
- `--header "Authorization: Bearer ..."` — Vercel Cron replacement; QStash will pass this Bearer token on each call, and your route validates it against `CRON_SECRET`

### Example for production:

```bash
# Assuming your prod URL is https://chat-ai-panel.vercel.app
upstash qstash schedule create \
  --cron "0 */3 * * *" \
  --url "https://chat-ai-panel.vercel.app/api/jobs/panel-smart-abandoned-sync" \
  --header "Authorization: Bearer your-cron-secret-value-here"
```

## Verify it's running

```bash
upstash qstash schedule list
```

Should show your schedule with schedule ID, cron expression, and next execution time.

## View recent executions

```bash
upstash qstash log list --schedule-id <schedule-id>
```

## Cancel if needed

```bash
upstash qstash schedule delete <schedule-id>
```

## Why QStash instead of Vercel Cron?

Vercel Hobby tier allows **at most one cron job per day**. The abandoned-conversation sweep needs to run every 3 hours to catch leads that go inactive for 1h+ before the next sync window. QStash offers:
- Unrestricted recurring schedules on any tier
- Signature verification (Bearer token auth)
- Execution logs and monitoring
- Already integrated into this project for re-engagement jobs
