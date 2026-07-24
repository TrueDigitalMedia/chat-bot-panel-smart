-- faq_entries.question_hash was never given a unique constraint, so the seed
-- script's `ON CONFLICT (question_hash) DO NOTHING` (src/lib/db/seed/faqs.ts)
-- has always failed with "no unique or exclusion constraint matching the ON
-- CONFLICT specification" — every seed attempt silently inserted nothing.

CREATE UNIQUE INDEX IF NOT EXISTS faq_entries_question_hash_idx
  ON faq_entries (question_hash);
