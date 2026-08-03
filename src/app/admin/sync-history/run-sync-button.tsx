'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import styles from './sync-history.module.css'

export function RunSyncButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <div className={styles.headerActions}>
      <button
        type="button"
        className={styles.runBtn}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setMsg(null)
          try {
            const res = await fetch('/api/admin/panel-smart-sync/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            })
            const data = (await res.json()) as { scanned: number; synced: number; failed: number }
            if (!res.ok) {
              setMsg('Error al sincronizar')
            } else if (data.scanned === 0) {
              setMsg('Nada pendiente por sincronizar')
            } else {
              setMsg(`${data.scanned} escaneados · ${data.synced} ok · ${data.failed} fallidos`)
              router.refresh()
            }
          } catch {
            setMsg('No se pudo conectar')
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
      </button>
      {msg ? <span className={styles.muted}>{msg}</span> : null}
    </div>
  )
}
