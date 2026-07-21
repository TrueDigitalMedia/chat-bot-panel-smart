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
    currentPhase: smallint('current_phase').notNull().default(1),
    surveyQuestionIndex: smallint('survey_question_index').notNull().default(0),
    quotaSegment: varchar('quota_segment', { length: 50 }),
    /** Qué dimensión calificó al lead: 'nse' | 'edad' | 'integrantes' | 'exception' | NULL. */
    quotaMatchedDimension: varchar('quota_matched_dimension', { length: 20 }),
    quotaMatchedValue: varchar('quota_matched_value', { length: 20 }),
    score: smallint('score'),
    optInAccepted: boolean('opt_in_accepted').notNull().default(false),
    d1Accepted: boolean('d1_accepted').notNull().default(false),
    d2Accepted: boolean('d2_accepted'),
    d3IsShopper: boolean('d3_is_shopper'),
    conversationSummary: text('conversation_summary'),
    reEngagementCount: smallint('re_engagement_count').notNull().default(0),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** MySQL AUTO_INCREMENT id assigned by TDM's tb_leads_agente_ia on first successful sync (spec 010). */
    tdmLeadId: integer('tdm_lead_id'),
    /** 'synced' | 'failed', code-managed like flowStates.gpsGateStatus. */
    tdmSyncStatus: varchar('tdm_sync_status', { length: 20 }),
    tdmLastSyncAt: timestamp('tdm_last_sync_at', { withTimezone: true }),
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
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    outcome: varchar('outcome', { length: 20 }),
    qstashMessageId: varchar('qstash_message_id', { length: 100 }),
  },
  (t) => [uniqueIndex('re_engagement_unique_idx').on(t.leadId, t.phase, t.attemptNumber)],
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversation_messages_lead_created_idx').on(t.leadId, t.createdAt)],
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
