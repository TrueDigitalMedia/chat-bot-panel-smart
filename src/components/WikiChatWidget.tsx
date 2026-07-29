'use client'

import { useState } from 'react'
import { MessageCircle, X, Send, Loader } from 'lucide-react'

export function WikiChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/wiki/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })

      if (!response.ok) {
        throw new Error('Failed to get answer')
      }

      const data = (await response.json()) as { answer: string }
      setAnswer(data.answer)
      setQuestion('')
    } catch (err) {
      setError('Error al procesar tu pregunta. Intenta de nuevo.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setIsOpen(false)
    setQuestion('')
    setAnswer(null)
    setError(null)
  }

  return (
    <>
      {/* Chat Button (Bottom Right) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-all duration-300 hover:bg-blue-700 hover:shadow-xl ${
          isOpen ? 'scale-110' : 'scale-100'
        }`}
        aria-label={isOpen ? 'Cerrar chat' : 'Abrir chat'}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-slate-900">
          {/* Header */}
          <div className="border-b border-gray-200 bg-blue-600 px-4 py-3 dark:border-gray-700">
            <h3 className="font-semibold text-white">Preguntas sobre la Wiki</h3>
            <p className="text-xs text-blue-100">Haz preguntas sobre el sistema PanelSmart</p>
          </div>

          {/* Messages */}
          <div className="max-h-96 space-y-4 overflow-y-auto p-4">
            {answer ? (
              <>
                {/* Question */}
                <div className="flex justify-end">
                  <div className="max-w-xs rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">{question}</div>
                </div>

                {/* Answer */}
                <div className="flex justify-start">
                  <div className="max-w-xs rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                    {answer}
                  </div>
                </div>

                {/* Reset Button */}
                <div className="flex justify-center">
                  <button
                    onClick={() => {
                      setAnswer(null)
                      setQuestion('')
                    }}
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Hacer otra pregunta
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-2 text-center text-sm text-gray-500 dark:text-gray-400">
                <p>¿Tienes preguntas sobre el sistema?</p>
                <p className="text-xs">Escribe tu pregunta abajo y te ayudaré a encontrar la información en la wiki.</p>
              </div>
            )}
          </div>

          {/* Input */}
          {!answer && (
            <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4 dark:border-gray-700">
              {error && <div className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</div>}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Tu pregunta..."
                  disabled={isLoading}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                />
                <button
                  type="submit"
                  disabled={isLoading || !question.trim()}
                  className="rounded-lg bg-blue-600 p-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                  aria-label="Enviar pregunta"
                >
                  {isLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  )
}
