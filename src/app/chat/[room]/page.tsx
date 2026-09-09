import { ChatWindow } from '../chat-window'
import { resolveRoom } from '@/lib/web/chat-rooms'

// Country room — `/chat/ecuador`, `/chat/mexico`. Same layout and copy as `/chat`
// (FR-010, no per-market intro): the ONLY difference is the room slug passed to
// ChatWindow, which pre-scopes a brand-new conversation to that country's questionnaire
// and never asks the country question. An unrecognized slug degrades to the generic
// experience — never a 404 (FR-007).
export default async function ChatRoomPage({
  params,
}: {
  params: Promise<{ room: string }>
}) {
  const { room } = await params
  const roomCountry = resolveRoom(room)

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="border-border bg-card flex w-full max-w-lg flex-col overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border border-b p-4">
          <h1 className="text-lg font-semibold">PanelSmart</h1>
          <p className="text-muted-foreground text-sm">
            Chatea con nosotros para saber si calificas como panelista.
          </p>
        </div>
        <ChatWindow roomSlug={roomCountry ? room : undefined} />
      </div>
    </div>
  )
}
