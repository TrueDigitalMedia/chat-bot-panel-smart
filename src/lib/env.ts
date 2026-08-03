import { z } from 'zod'
import { boolEnv } from './env-bool'

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  POSTGRES_URL: z.string().url(),
  QSTASH_TOKEN: z.string().min(1),
  QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
  QSTASH_NEXT_SIGNING_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  SUPPORT_CONTACT: z.string().default('555555555'),

  /** Single shared admin credential (login form + legacy Basic Auth predecessor). */
  ADMIN_PASSWORD: z.string().min(1).optional(),
  /** HMAC key for the admin session cookie — deliberately separate from ADMIN_PASSWORD (research.md R1). */
  SESSION_SECRET: z.string().min(1).optional(),
  /** Secret for local mock registration webhook. Defaults for local/dev. */
  REGISTRATION_WEBHOOK_SECRET: z.string().default('dev-registration-secret'),
  APP_BASE_URL: z.string().url().optional(),

  /** WhatsApp transport: `meta` (WhatsApp Business Cloud API, default) | `twilio` */
  WHATSAPP_PROVIDER: z.enum(['meta', 'twilio']).optional(),

  // Meta WhatsApp Cloud API (primary)
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_GRAPH_VERSION: z.string().min(1).optional(),

  // Twilio WhatsApp (alternative)
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_WHATSAPP_FROM: z.string().min(1).optional(),
  /** Absolute webhook URL for signature validation if behind proxy */
  TWILIO_WEBHOOK_URL: z.string().url().optional(),

  // Test overrides
  RE_ENGAGEMENT_TIMEOUT_OVERRIDE_SECONDS: z.coerce.number().optional(),
  RE_ENGAGEMENT_CADENCE_OVERRIDE_SECONDS: z.string().optional(),
  LINK_SENT_REMINDER_DELAY_SECONDS_OVERRIDE: z.coerce.number().optional(),
  FORCE_EXTRACTION_ERROR: z.string().optional(),

  /** REGISTRATION_CODE_MOCK_ENABLED=true bypasses the TDM request entirely and delivers
   *  a mock code — the only way to test this flow locally without a real TDM endpoint. */
  REGISTRATION_CODE_MOCK_ENABLED: boolEnv(false),

  // TDM registration-code request+webhook (replaces the old MySQL poll — see
  // specs/001-panelsmart-recruitment-bot/contracts/client-mysql-integration.md §2b).
  /** TDM's /api/ai-lead endpoint — we POST the registration-code request JSON here. */
  TDM_REGISTRATION_REQUEST_URL: z.string().url().optional(),
  /** Azure AD (Microsoft Entra ID) token endpoint for TDM's tenant — client_credentials grant. */
  TDM_OAUTH_TOKEN_URL: z.string().url().optional(),
  TDM_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  TDM_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  /** e.g. "api://<app-id>/.default" — TDM's Azure AD app registration scope. */
  TDM_OAUTH_SCOPE: z.string().min(1).optional(),
  /** How long we wait for TDM's webhook before giving up (→ abandono). */
  TDM_REGISTRATION_CODE_TIMEOUT_SECONDS: z.coerce.number().default(1800),
  /** Ours — auth secret for the inbound POST /api/webhooks/tdm-registration-code. */
  TDM_REGISTRATION_WEBHOOK_SECRET: z.string().default('dev-tdm-registration-secret'),
  /** TDM has no sandbox environment — while true, every outbound request overrides
   *  telefono/correo_electronico with fixed test values so TDM can identify and discard
   *  test records (src/lib/tdm-registration/test-mode.ts). Turn off before real launch. */
  TDM_TEST_MODE_ENABLED: boolEnv(false),

  // Panel Smart / Kantar ai-lead-responses — same Azure Function App + OAuth tenant as
  // TDM_REGISTRATION_REQUEST_URL, different endpoint: pushes per-question survey/ficha-hogar
  // answers instead of requesting a registration code. See src/lib/panel-smart/.
  /** Kantar's /api/ai-lead-responses endpoint. */
  PANEL_SMART_SYNC_URL: z.string().url().optional(),
  /** Kill switch for the Panel Smart sync. */
  PANEL_SMART_SYNC_ENABLED: boolEnv(false),
  /** Auth secret for Vercel Cron's callback to the hourly abandoned-conversation sweep
   *  (jobs/panel-smart-abandoned-sync) — Vercel sends this as `Authorization: Bearer <value>`. */
  CRON_SECRET: z.string().min(1).optional(),
})

function validateEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.flatten().fieldErrors)
    throw new Error('Invalid environment variables')
  }
  return result.data
}

export const env = validateEnv()
export type Env = z.infer<typeof envSchema>

export function isMetaWhatsAppConfigured(): boolean {
  return Boolean(
    env.WHATSAPP_ACCESS_TOKEN &&
      env.WHATSAPP_PHONE_NUMBER_ID &&
      env.WHATSAPP_VERIFY_TOKEN &&
      env.WHATSAPP_APP_SECRET,
  )
}

export function isTwilioConfigured(): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM)
}

/** False until every piece (endpoint + OAuth creds) is set — callers fall back to abandono. */
export function isTdmRegistrationRequestConfigured(): boolean {
  return Boolean(
    env.TDM_REGISTRATION_REQUEST_URL &&
      env.TDM_OAUTH_TOKEN_URL &&
      env.TDM_OAUTH_CLIENT_ID &&
      env.TDM_OAUTH_CLIENT_SECRET &&
      env.TDM_OAUTH_SCOPE,
  )
}

/** Reuses the same OAuth-configured check as TDM registration — same Azure AD tenant/app. */
export function isPanelSmartSyncConfigured(): boolean {
  return Boolean(env.PANEL_SMART_SYNC_URL && isTdmRegistrationRequestConfigured())
}

export function isPanelSmartSyncEnabled(): boolean {
  return env.PANEL_SMART_SYNC_ENABLED && isPanelSmartSyncConfigured()
}

/**
 * Publicly-reachable base URL for building absolute links (mock app download links,
 * QStash job callback URLs) — must resolve the same way everywhere it's used. A caller
 * that only checks `NEXT_PUBLIC_BASE_URL`/`VERCEL_URL` and skips `APP_BASE_URL` will
 * silently fall back to `localhost`, which QStash cannot call back into.
 */
export function appBaseUrl(): string {
  if (env.APP_BASE_URL) return env.APP_BASE_URL.replace(/\/$/, '')
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
