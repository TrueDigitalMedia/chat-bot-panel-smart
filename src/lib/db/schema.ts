import {
  pgTable,
  uuid,
  varchar,
  smallint,
  boolean,
  text,
  jsonb,
  timestamp,
  pgEnum,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const quotaTargets = pgTable(
  'quota_targets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    country: varchar('country', { length: 50 }).notNull(),
    region: varchar('region', { length: 100 }).notNull(),
    /** 'nse' | 'edad' | 'integrantes' — see specs/011-flexible-quota-matching/data-model.md. */
    dimensionType: varchar('dimension_type', { length: 20 }).notNull(),
    dimensionValue: varchar('dimension_value', { length: 20 }).notNull(),
    targetCount: integer('target_count').notNull().default(0),
    active: boolean('active').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('quota_targets_country_region_dim_idx').on(
      t.country,
      t.region,
      t.dimensionType,
      t.dimensionValue,
    ),
  ],
)

export const quotaRegionCaps = pgTable(
  'quota_region_caps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    country: varchar('country', { length: 50 }).notNull(),
    region: varchar('region', { length: 100 }).notNull(),
    /** NULL = sin tope (no bloquea por saturación). */
    capCount: integer('cap_count'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('quota_region_caps_country_region_idx').on(t.country, t.region)],
)

export const leadStatusEnum = pgEnum('lead_status', [
  'incomplete',
  'not_qualified',
  'quota_exhausted',
  'link_sent',
  'waiting_for_code',
  'code_delivered_registered',
  'code_delivered_not_registered',
  'code_delivered_no_response',
  'ficha_hogar_completada',
  'ficha_hogar_descartado',
  'abandono',
])

export const channelEnum = pgEnum('channel', ['telegram', 'whatsapp', 'web'])

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channel: channelEnum('channel').notNull().default('telegram'),
    channelUserId: varchar('channel_user_id', { length: 128 }).notNull(),
    channelUsername: varchar('channel_username', { length: 100 }),
    phoneNumber: varchar('phone_number', { length: 32 }),
    leadStatus: leadStatusEnum('lead_status').notNull().default('incomplete'),
    /** The `reason` passed to the most recent transitionLead call — e.g.
     *  'code_request_not_configured', 're_engagement_exhausted'. Several distinct
     *  failure paths all land on the same generic leadStatus (esp. 'abandono'), so
     *  without this the admin UI can't tell "user declined" apart from "our own
     *  registration-code request failed" — both look identical as just "abandono". */
    statusReason: text('status_reason'),
    currentPhase: smallint('current_phase').notNull().default(1),
    surveyQuestionIndex: smallint('survey_question_index').notNull().default(0),
    quotaSegment: varchar('quota_segment', { length: 50 }),
    /** Qué dimensión calificó al lead: 'nse' | 'edad' | 'integrantes' | 'exception' | NULL. */
    quotaMatchedDimension: varchar('quota_matched_dimension', { length: 20 }),
    quotaMatchedValue: varchar('quota_matched_value', { length: 20 }),
    score: smallint('score'),
    optInAccepted: boolean('opt_in_accepted').notNull().default(false),
    d1Accepted: boolean('d1_accepted').notNull().default(false),
    reEngagementConsentAccepted: boolean('re_engagement_consent_accepted'),
    d3IsShopper: boolean('d3_is_shopper'),
    conversationSummary: text('conversation_summary'),
    reEngagementCount: smallint('re_engagement_count').notNull().default(0),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Stamped when the registration-code JSON request is POSTed to TDM — lets the
     * registration_code_timeout job (jobs/re-engage) tell "never asked" apart from
     * "asked, no webhook reply yet" (both would otherwise look identical from just
     * leadStatus === 'link_sent').
     */
    tdmRegistrationRequestedAt: timestamp('tdm_registration_requested_at', { withTimezone: true }),
    /** Code delivered by TDM's webhook — persisted for idempotency/audit (never stored before this). */
    tdmRegistrationCode: varchar('tdm_registration_code', { length: 64 }),
    /** 'synced' | 'failed' — Panel Smart / Kantar ai-lead-responses. */
    panelSmartSyncStatus: varchar('panel_smart_sync_status', { length: 20 }),
    panelSmartLastSyncAt: timestamp('panel_smart_last_sync_at', { withTimezone: true }),
    /** Snapshot of the last value sent per field ({ [fieldName]: value }), used to diff
     *  what's actually changed since the last successful sync — the answer to "which
     *  survey/ficha-hogar answers are still pending" is just this vs. the current profile. */
    panelSmartSyncedAnswersJson: jsonb('panel_smart_synced_answers_json').$type<Record<string, unknown>>(),
    /** The `leadStatus` value as of the last successful Panel Smart sync — compared against
     *  the live `leadStatus` independently of `panelSmartSyncedAnswersJson` so a status
     *  transition with no changed survey/ficha-hogar field still gets synced instead of being
     *  silently dropped as "nothing pending". */
    panelSmartSyncedLeadStatus: leadStatusEnum('panel_smart_synced_lead_status'),
  },
  (t) => [uniqueIndex('leads_channel_user_idx').on(t.channel, t.channelUserId)],
)

export const surveyProfiles = pgTable('survey_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id),
  fullName: varchar('full_name', { length: 200 }),
  country: varchar('country', { length: 50 }),
  stateProvince: varchar('state_province', { length: 100 }),
  municipality: varchar('municipality', { length: 100 }),
  neighborhood: varchar('neighborhood', { length: 100 }),
  nseRegion: varchar('nse_region', { length: 100 }),
  geoSource: varchar('geo_source', { length: 20 }),
  inQuotaGeo: boolean('in_quota_geo'),
  email: varchar('email', { length: 200 }),
  gender: varchar('gender', { length: 20 }),
  educationPsh: varchar('education_psh', { length: 50 }),
  cars: varchar('cars', { length: 10 }),
  domesticHelp: boolean('domestic_help'),
  householdSize: smallint('household_size'),
  bedrooms: smallint('bedrooms'),
  shoppingFrequency: varchar('shopping_frequency', { length: 30 }),
  shoppingCategories: jsonb('shopping_categories').$type<number[]>(),
  contactChannel: varchar('contact_channel', { length: 20 }),
  contactSchedule: varchar('contact_schedule', { length: 30 }),
  rawFreeTextJson: jsonb('raw_free_text_json'),
  extractionModel: varchar('extraction_model', { length: 100 }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  age: smallint('age'),
  isPregnant: boolean('is_pregnant'),
  hasBabyUnder3: boolean('has_baby_under_3'),
})

export const fichaHogarProfiles = pgTable(
  'ficha_hogar_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    questionIndex: smallint('question_index').notNull().default(0),
    conflictOfInterest: boolean('conflict_of_interest'),
    hasInternet: boolean('has_internet'),
    relationshipToHoh: varchar('relationship_to_hoh', { length: 20 }),
    dateOfBirth: varchar('date_of_birth', { length: 10 }),
    hasHealthCondition: boolean('has_health_condition'),
    unlimitedDataPlan: boolean('unlimited_data_plan'),
    petCount: smallint('pet_count'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ficha_hogar_profiles_lead_id_idx').on(t.leadId)],
)

export const flowStates = pgTable('flow_states', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id),
  currentPhase: smallint('current_phase').notNull().default(1),
  decisionPoint: varchar('decision_point', { length: 10 }),
  surveyQuestionIndex: smallint('survey_question_index').notNull().default(0),
  isInFaqDigression: boolean('is_in_faq_digression').notNull().default(false),
  digressionResumeIndex: smallint('digression_resume_index'),
  isCorrecting: boolean('is_correcting').notNull().default(false),
  correctingField: varchar('correcting_field', { length: 50 }),
  correctionResumeIndex: smallint('correction_resume_index'),
  gpsGateStatus: varchar('gps_gate_status', { length: 30 }),
  gpsProposal: jsonb('gps_proposal').$type<{
    country: string
    stateProvince: string
    municipality: string
    neighborhood: string | null
  }>(),
  /** Numbered/quick-reply map for WhatsApp button fallback: token → callback_data */
  pendingWaChoices: jsonb('pending_wa_choices').$type<Record<string, string>>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const reEngagementSchedules = pgTable(
  're_engagement_schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    phase: smallint('phase').notNull(),
    attemptNumber: smallint('attempt_number').notNull(),
    /**
     * Explicit job type — 're-engage', 'request_registration_code',
     * 'registration_code_timeout', 'freeze_registration'. Previously inferred purely
     * from attemptNumber numeric ranges (0/1-3/95/99); this column lets recontact
     * ('re-engage') jobs be found/cancelled by leadId alone, independent of which
     * phase they happened to be filed under — needed to guarantee only one live
     * recontact schedule per lead when a phase transition mid-turn leaves a stale
     * job archived under the wrong phase.
     */
    action: varchar('action', { length: 30 }).notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    outcome: varchar('outcome', { length: 20 }),
    qstashMessageId: varchar('qstash_message_id', { length: 100 }),
  },
  (t) => [
    uniqueIndex('re_engagement_unique_idx').on(t.leadId, t.phase, t.attemptNumber),
    index('re_engagement_lead_action_idx').on(t.leadId, t.action),
  ],
)

// Note: faq_entries uses a vector column added in the initial migration SQL
export const faqEntries = pgTable('faq_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  // embedding vector(1536) is added via raw SQL in migration
  category: varchar('category', { length: 50 }),
  questionHash: varchar('question_hash', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Treinta-owned panelist snapshot (JSONB). Not sent to PanelSmart. */
export const treintaPanelistRecords = pgTable(
  'treinta_panelist_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    summary: text('summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('treinta_panelist_records_lead_id_idx').on(t.leadId)],
)

/**
 * Embedding for a Treinta panelist record.
 * `embedding vector(1536)` is added via raw SQL in migration 0002.
 */
export const treintaPanelistEmbeddings = pgTable(
  'treinta_panelist_embeddings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recordId: uuid('record_id')
      .notNull()
      .references(() => treintaPanelistRecords.id),
    // embedding vector(1536) is added via raw SQL in migration
    embeddingModel: varchar('embedding_model', { length: 100 }).notNull(),
    sourceText: text('source_text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('treinta_panelist_embeddings_record_id_idx').on(t.recordId)],
)

export const systemCallLogs = pgTable(
  'system_call_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leadId: uuid('lead_id').references(() => leads.id),
    callType: varchar('call_type', { length: 50 }).notNull(),
    model: varchar('model', { length: 100 }),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    correlationId: uuid('correlation_id').notNull(),
    calledAt: timestamp('called_at', { withTimezone: true }).notNull().defaultNow(),
    error: text('error'),
  },
  (t) => [index('system_call_logs_lead_id_idx').on(t.leadId)],
)

export const messageDirectionEnum = pgEnum('message_direction', ['in', 'out'])
export const messageContentTypeEnum = pgEnum('message_content_type', [
  'text',
  'callback',
  'contact',
  'keyboard',
  'video',
  'system',
])

export const conversationMessages = pgTable(
  'conversation_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    direction: messageDirectionEnum('direction').notNull(),
    channel: channelEnum('channel').notNull(),
    contentType: messageContentTypeEnum('content_type').notNull().default('text'),
    body: text('body').notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    // WhatsApp/Twilio's message id (message.id / MessageSid) for inbound messages only —
    // lets us detect a webhook redelivery of the same message before re-running routing/
    // AI/send logic. Null for outbound messages and channels without a provider id
    // (web); Postgres unique indexes treat NULL as distinct from NULL, so those rows
    // never collide with each other.
    providerMessageId: varchar('provider_message_id', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('conversation_messages_lead_created_idx').on(t.leadId, t.createdAt),
    uniqueIndex('conversation_messages_provider_msg_idx').on(t.channel, t.providerMessageId),
  ],
)

/** Golden scenarios for qualification / quota QA (seeded examples). */
export const evalFixtures = pgTable(
  'eval_fixtures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 80 }).notNull().unique(),
    description: text('description').notNull(),
    scenarioType: varchar('scenario_type', { length: 60 }).notNull(),
    inputSnapshot: jsonb('input_snapshot').$type<Record<string, unknown>>().notNull(),
    expected: jsonb('expected').$type<Record<string, unknown>>().notNull(),
    tags: jsonb('tags').$type<string[]>(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('eval_fixtures_scenario_idx').on(t.scenarioType)],
)

/** Per-lead Phase-1 qualification eval result (QA score, not socioeconomic score). */
export const conversationEvals = pgTable(
  'conversation_evals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    fixtureId: uuid('fixture_id').references(() => evalFixtures.id),
    correlationId: uuid('correlation_id'),
    reason: varchar('reason', { length: 80 }).notNull(),
    overallScore: smallint('overall_score').notNull(),
    passed: boolean('passed').notNull(),
    checks: jsonb('checks')
      .$type<Record<string, boolean>>()
      .notNull(),
    actual: jsonb('actual').$type<Record<string, unknown>>().notNull(),
    expected: jsonb('expected').$type<Record<string, unknown>>().notNull(),
    mismatches: jsonb('mismatches')
      .$type<Array<{ field: string; expected: unknown; actual: unknown }>>()
      .notNull()
      .default([]),
    evalVersion: varchar('eval_version', { length: 20 }).notNull().default('v1'),
    ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('conversation_evals_lead_ran_idx').on(t.leadId, t.ranAt),
    index('conversation_evals_passed_idx').on(t.passed),
  ],
)

/** One row per Panel Smart sync execution — a single-lead transition/correction, or one
 *  pass of the abandoned-conversation cron sweeping many leads at once. */
export const panelSmartSyncRuns = pgTable(
  'panel_smart_sync_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** 'state_transition' | 'correction' | 'abandoned_cron' */
    trigger: varchar('trigger', { length: 30 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    totalCount: integer('total_count').notNull().default(0),
    syncedCount: integer('synced_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
  },
  (t) => [index('panel_smart_sync_runs_started_idx').on(t.startedAt)],
)

/** One row per lead synced within a run — only recorded when there were actually pending
 *  fields to send (no-op diffs aren't logged here). */
export const panelSmartSyncAttempts = pgTable(
  'panel_smart_sync_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => panelSmartSyncRuns.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    /** 'synced' | 'failed' */
    status: varchar('status', { length: 10 }).notNull(),
    fieldsSyncedJson: jsonb('fields_synced_json').$type<string[]>(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('panel_smart_sync_attempts_run_idx').on(t.runId),
    index('panel_smart_sync_attempts_lead_idx').on(t.leadId),
  ],
)

export const messageVariants = pgTable(
  'message_variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /**
     * Which recontact context this variant belongs to — 'phase1_reengage',
     * 'phase2_link_reminder', 'phase4_ficha_hogar'. Keeps each phase's message pool
     * rotating independently under the same attemptNumber values instead of sharing
     * (and colliding on) a single global attempt-number keyed pool.
     */
    pool: varchar('pool', { length: 30 }).notNull(),
    attemptNumber: smallint('attempt_number').notNull(),
    variantOrder: smallint('variant_order').notNull(),
    templateText: text('template_text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('message_variants_pool_attempt_order_idx').on(t.pool, t.attemptNumber, t.variantOrder),
    index('message_variants_pool_attempt_idx').on(t.pool, t.attemptNumber),
  ],
)

/**
 * Persisted lookup for Twilio `twilio/quick-reply` / `twilio/list-picker` Content
 * resources, keyed by a hash of (kind, body, buttons). The bot creates these on the
 * fly for in-session messages (survey questions, decision-gate buttons) — without a
 * durable cache, every serverless cold start forgot what it had already created and
 * re-created an identical Content resource in Twilio, flooding the account with
 * duplicate templates. This table is the cache that actually survives cold starts and
 * is shared across every instance.
 */
export const twilioContentCache = pgTable(
  'twilio_content_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    /** 'qr' (quick-reply) | 'lp2' (list-picker) */
    kind: varchar('kind', { length: 10 }).notNull(),
    contentSid: varchar('content_sid', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('twilio_content_cache_hash_idx').on(t.contentHash)],
)

/**
 * Approved WhatsApp templates, keyed by a stable logical id — e.g.
 * `phase1_reengage_a1_v1` (derived from message_variants' pool/attemptNumber/
 * variantOrder) or a fixed constant like `registration_code_delivered`. Only messages
 * genuinely business-initiated (a cron job or an external webhook, not a reply to a
 * fresh inbound message) need a row here. `contentSid` is Twilio's Content resource id
 * — known as soon as it's created — while `approvalStatus` tracks Meta's separate,
 * slower review of that content; sending code only uses a row once it's 'approved',
 * which is what makes the rollout gradual without any extra flag.
 */
export const whatsappTemplates = pgTable(
  'whatsapp_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    logicalId: varchar('logical_id', { length: 100 }).notNull(),
    provider: varchar('provider', { length: 10 }).notNull(), // 'twilio' | 'meta' (future)
    contentSid: varchar('content_sid', { length: 64 }),
    /** Meta template name — unused until direct-Meta template sending exists. */
    templateName: varchar('template_name', { length: 512 }),
    language: varchar('language', { length: 10 }).notNull().default('es'),
    approvalStatus: varchar('approval_status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('whatsapp_templates_logical_provider_lang_idx').on(t.logicalId, t.provider, t.language),
  ],
)

export const leadMessageVariantUsage = pgTable(
  'lead_message_variant_usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    pool: varchar('pool', { length: 30 }).notNull(),
    attemptNumber: smallint('attempt_number').notNull(),
    variantOrder: smallint('variant_order').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('lead_variant_usage_lead_pool_attempt_idx').on(t.leadId, t.pool, t.attemptNumber),
    index('lead_variant_usage_lead_idx').on(t.leadId, t.attemptNumber),
    index('lead_variant_usage_sent_at_idx').on(t.sentAt),
  ],
)
