import { embed } from 'ai'
import { embeddingModel } from '@/lib/ai/models'

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel(),
    value: text,
  })
  return embedding
}
