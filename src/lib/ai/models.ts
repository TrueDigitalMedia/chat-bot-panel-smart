import { openai } from '@ai-sdk/openai'

/** Cheapest OpenAI chat model for extraction / summaries. */
export const CHAT_MODEL_ID = 'gpt-5-nano'

/** Matches pgvector column vector(1536). */
export const EMBEDDING_MODEL_ID = 'text-embedding-3-small'

export function chatModel() {
  return openai(CHAT_MODEL_ID)
}

export function embeddingModel() {
  return openai.textEmbeddingModel(EMBEDDING_MODEL_ID)
}
