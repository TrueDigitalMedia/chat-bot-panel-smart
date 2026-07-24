'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ChatButton {
  text: string
  callback_data: string
}

interface ChatMessage {
  id: string
  direction: 'in' | 'out'
  contentType: string
  body: string
  meta: { buttons?: ChatButton[]; type?: string; label?: string } | null
  createdAt: string
}

interface ChatResponse {
  leadId: string
  leadStatus: string
  messages: ChatMessage[]
}

type TurnPayload =
  | { text: string }
  | { callbackData: string; label: string }
  | { location: { latitude: number; longitude: number } }

// Background jobs (mock registration code, download reminders, freeze) send bot
// messages outside any request the visitor's browser makes — polling is how the
// widget ever sees them without the visitor manually reloading the page.
const POLL_INTERVAL_MS = 5000

/**
 * Polling and a turn's own POST response can land in either order (a poll in flight
 * when the turn started can resolve after it, overwriting its messages). Merging by id
 * and re-sorting by createdAt — rather than either replacing wholesale or blindly
 * appending — keeps the transcript correct regardless of which resolves first.
 * `dropLocalEchoes` clears optimistic echoes once authoritative full history (which
 * must already include the corresponding real row) is in hand.
 */
function mergeMessages(
  prev: ChatMessage[],
  incoming: ChatMessage[],
  { dropLocalEchoes }: { dropLocalEchoes: boolean },
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const m of prev) {
    if (dropLocalEchoes && m.id.startsWith('local-')) continue
    byId.set(m.id, m)
  }
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const sendingRef = useRef(false)

  useEffect(() => {
    void bootstrap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    sendingRef.current = sending
  }, [sending])

  useEffect(() => {
    const interval = setInterval(() => {
      // Skip while a turn is in flight — its own response already refreshes state,
      // and a poll landing mid-turn could momentarily hide the optimistic echo.
      if (!sendingRef.current && document.visibilityState === 'visible') {
        void poll()
      }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function poll(): Promise<void> {
    try {
      const res = await fetch('/api/chat/web')
      if (!res.ok) return
      const data = (await res.json()) as ChatResponse
      setMessages((prev) => mergeMessages(prev, data.messages, { dropLocalEchoes: true }))
    } catch {
      // Silent — next interval tick retries.
    }
  }

  async function bootstrap(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/chat/web')
      if (!res.ok) throw new Error('bootstrap_failed')
      const data = (await res.json()) as ChatResponse
      // Hydrate full history on every mount, including a reload mid-survey (US2) —
      // not just a visitor's very first-ever visit.
      setMessages((prev) => mergeMessages(prev, data.messages, { dropLocalEchoes: true }))
    } catch {
      setError('No se pudo conectar con el chat. Intenta recargar la página.')
    } finally {
      setLoading(false)
    }
  }

  async function sendTurn(payload: TurnPayload): Promise<void> {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/chat/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('send_failed')
      const data = (await res.json()) as ChatResponse
      // Only this turn's new outbound messages — the matching inbound row isn't in
      // here, so keep the local echo until the next poll confirms it (dropLocalEchoes: false).
      setMessages((prev) => mergeMessages(prev, data.messages, { dropLocalEchoes: false }))
    } catch {
      setError('No se pudo enviar tu mensaje. Intenta de nuevo.')
    } finally {
      setSending(false)
    }
  }

  function echoVisitorMessage(body: string, contentType: string): void {
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        direction: 'in',
        contentType,
        body,
        meta: null,
        createdAt: new Date().toISOString(),
      },
    ])
  }

  function handleSendText(e: FormEvent): void {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    echoVisitorMessage(text, 'text')
    setInput('')
    void sendTurn({ text })
  }

  function handleButtonClick(button: ChatButton): void {
    if (sending) return
    echoVisitorMessage(button.text, 'callback')
    void sendTurn({ callbackData: button.callback_data, label: button.text })
  }

  function handleShareLocation(): void {
    if (!navigator.geolocation) {
      setError('Tu navegador no soporta compartir ubicación — usa «Escribir mi ubicación» para continuar a mano.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void sendTurn({
          location: { latitude: position.coords.latitude, longitude: position.coords.longitude },
        })
      },
      () => {
        setError('No se pudo obtener tu ubicación — usa «Escribir mi ubicación» para continuar a mano.')
      },
    )
  }

  // Exact phrase gps-capture.ts matches to switch to manual department/municipio entry
  // (src/lib/conversation/gps-capture.ts SKIP_TEXT) — same text Telegram's keyboard button sends.
  function handleWriteLocationManually(): void {
    if (sending) return
    echoVisitorMessage('Escribir mi ubicación', 'text')
    void sendTurn({ text: 'Escribir mi ubicación' })
  }

  const lastMessage = messages[messages.length - 1]
  const isLocationRequestPending = lastMessage?.direction === 'out' && lastMessage.meta?.type === 'location_request'

  if (loading) {
    return <p className="text-muted-foreground p-6 text-sm">Conectando con el chat…</p>
  }

  return (
    <div className="flex h-[70vh] flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} onButtonClick={handleButtonClick} disabled={sending} />
        ))}
        <div ref={bottomRef} />
      </div>

      {error ? <p className="text-destructive px-4 pb-2 text-sm">{error}</p> : null}

      {isLocationRequestPending ? (
        <div className="border-border flex gap-2 border-t p-3">
          <Button type="button" onClick={handleShareLocation} disabled={sending}>
            📍 Compartir ubicación
          </Button>
          <Button type="button" variant="outline" onClick={handleWriteLocationManually} disabled={sending}>
            ✍️ Escribir mi ubicación
          </Button>
        </div>
      ) : null}

      <form onSubmit={handleSendText} className="border-border flex gap-2 border-t p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu mensaje…"
          disabled={sending}
        />
        <Button type="submit" disabled={sending || !input.trim()}>
          Enviar
        </Button>
      </form>
    </div>
  )
}

function MessageBubble({
  message,
  onButtonClick,
  disabled,
}: {
  message: ChatMessage
  onButtonClick: (button: ChatButton) => void
  disabled: boolean
}) {
  const isBot = message.direction === 'out'
  const buttons = message.meta?.buttons
  // A button click's raw callback_data (e.g. "optin:accept") isn't meant for display —
  // prefer the friendly label stored in meta when this bubble is re-rendered from history.
  const displayBody = message.contentType === 'callback' ? (message.meta?.label ?? message.body) : message.body

  return (
    <div className={isBot ? 'flex justify-start' : 'flex justify-end'}>
      <div
        className={
          isBot
            ? 'bg-muted text-foreground max-w-[80%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm'
            : 'bg-primary text-primary-foreground max-w-[80%] rounded-2xl rounded-br-sm px-3 py-2 text-sm'
        }
      >
        <p className="whitespace-pre-wrap">{displayBody}</p>
        {buttons && buttons.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {buttons.map((button) => (
              <Button
                key={button.callback_data}
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onButtonClick(button)}
              >
                {button.text}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
