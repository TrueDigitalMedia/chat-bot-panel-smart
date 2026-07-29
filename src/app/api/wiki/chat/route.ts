import { getWikiContent } from '@/lib/wiki/loader'
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'

const MAX_TOKENS = 512

export async function POST(request: Request) {
  try {
    const { question } = (await request.json()) as { question: string }

    if (!question || typeof question !== 'string') {
      return Response.json({ error: 'Invalid or missing question' }, { status: 400 })
    }

    const wikiContent = getWikiContent()

    const systemPrompt = `Eres un asistente que responde preguntas sobre la wiki del sistema PanelSmart Recruitment Bot.
Basate únicamente en el contexto de la wiki proporcionada.
Si la pregunta no está en la wiki, di "No encontré esa información en la wiki".
Siempre cita la sección específica (§ número) de la wiki que usaste.
Responde en español.
Sé conciso y directo.
Máximo 200 palabras.`

    const userMessage = `Aquí está la wiki:

${wikiContent}

Pregunta: ${question}`

    const { text } = await generateText({
      model: openai('gpt-4-turbo'),
      system: systemPrompt,
      prompt: userMessage,
      maxCompletionTokens: MAX_TOKENS,
    })

    return Response.json({ answer: text })
  } catch (error) {
    console.error('Error in wiki chat:', error)
    return Response.json({ error: 'Failed to process question' }, { status: 500 })
  }
}
