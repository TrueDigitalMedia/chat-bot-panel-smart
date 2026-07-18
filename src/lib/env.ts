import { z } from 'zod'

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  POSTGRES_URL: z.string().url(),
  QSTASH_TOKEN: z.string().min(1),
  QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
  QSTASH_NEXT_SIGNING_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  SUPPORT_CONTACT: z.string().default('555555555'),
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
  FORCE_EXTRACTION_ERROR: z.string().optional(),
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
