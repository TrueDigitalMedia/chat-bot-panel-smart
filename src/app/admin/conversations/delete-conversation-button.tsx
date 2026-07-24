'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import styles from './conversations.module.css'

export function DeleteConversationButton({
  leadId,
  /** Where to send the browser after a successful delete — omit to just refresh in place (list rows). */
  redirectTo,
}: {
  leadId: string
  redirectTo?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick(): Promise<void> {
    if (busy) return
    if (!window.confirm('¿Eliminar esta conversación? Esto borra el lead y todos sus datos permanentemente.')) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/conversations/${leadId}`, { method: 'DELETE' })
      if (!res.ok) {
        setError('No se pudo eliminar')
        return
      }
      if (redirectTo) {
        router.push(redirectTo)
      } else {
        router.refresh()
      }
    } catch {
      setError('No se pudo conectar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span>
      <button type="button" className={styles.deleteBtn} disabled={busy} onClick={handleClick}>
        {busy ? 'Eliminando…' : 'Eliminar'}
      </button>
      {error ? <span className={styles.muted}> {error}</span> : null}
    </span>
  )
}
