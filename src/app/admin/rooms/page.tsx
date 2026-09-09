import { listRooms } from '@/lib/web/chat-rooms'
import { env } from '@/lib/env'
import { CopyLink } from './copy-link'

// Spec 016 US3 — the canonical Ecuador/México chat-room links, with a copy action, so
// recruiters can share them. When APP_BASE_URL is unset the URLs are relative (dev).
export default function AdminRoomsPage() {
  const rooms = listRooms()
  const relative = !env.APP_BASE_URL

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Salas de chat por país</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Comparte estos enlaces para que un visitante llegue directamente a la conversación de su país —
        sin que se le pregunte el país. Un lead creado desde una sala queda marcado con su origen
        (columna «Origen» en el dashboard de leads).
      </p>

      {relative ? (
        <p className="text-muted-foreground mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <code>APP_BASE_URL</code> no está configurada — los enlaces de abajo son relativos. Antepón el
          dominio público al compartirlos.
        </p>
      ) : null}

      <table className="mt-4 w-full max-w-2xl text-sm">
        <thead>
          <tr className="border-border border-b text-left">
            <th className="py-2 pr-4">País</th>
            <th className="py-2 pr-4">Enlace</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <tr key={room.slug} className="border-border/60 border-b">
              <td className="py-2 pr-4">{room.country}</td>
              <td className="py-2 pr-4">
                <code className="break-all">{room.url}</code>
              </td>
              <td className="py-2">
                <CopyLink url={room.url} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
