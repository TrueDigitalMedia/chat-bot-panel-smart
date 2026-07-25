import { openai } from '@ai-sdk/openai'

/** Cheapest OpenAI chat model for extraction / summaries. */
export const CHAT_MODEL_ID = 'gpt-5-nano'

/**
 * One tier up — for judgment calls where nano's inconsistency actually shows: FAQ
 * matching found it flip-flopping between correctly saying "no match" and picking a
 * wrong-but-topically-adjacent FAQ across otherwise-identical repeated calls (e.g.
 * "para que quieres mi nombre y apellido" during the survey vs a FAQ about what the
 * *app* asks for at sign-up). These calls only run on out-of-flow messages — not every
 * turn, unlike field extraction — so the extra cost/latency is worth the reliability.
 */
export const CHAT_MODEL_PRECISE_ID = 'gpt-5-mini'

/** Matches pgvector column vector(1536). */
export const EMBEDDING_MODEL_ID = 'text-embedding-3-small'

export function chatModel() {
  return openai(CHAT_MODEL_ID)
}

export function chatModelPrecise() {
  return openai(CHAT_MODEL_PRECISE_ID)
}

export function embeddingModel() {
  return openai.textEmbeddingModel(EMBEDDING_MODEL_ID)
}
