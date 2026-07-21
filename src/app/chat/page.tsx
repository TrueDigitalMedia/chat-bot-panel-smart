import { ChatWindow } from './chat-window'

// Public page — deliberately outside /admin so middleware.ts's matcher never gates it
// (spec 012 research.md R9). Anyone can open this and chat, same as Telegram/WhatsApp today.
export default function ChatPage() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="border-border bg-card flex w-full max-w-lg flex-col overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border border-b p-4">
          <h1 className="text-lg font-semibold">PanelSmart</h1>
          <p className="text-muted-foreground text-sm">
            Chatea con nosotros para saber si calificas como panelista.
          </p>
        </div>
        <ChatWindow />
      </div>
    </div>
  )
}
