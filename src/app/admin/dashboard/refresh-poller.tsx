'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import styles from './dashboard.module.css'

const POLL_INTERVAL_MS = 60_000

export function RefreshPoller() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [router])

  return (
    <button
      type="button"
      className={styles.refreshBtn}
      disabled={busy}
      onClick={() => {
        setBusy(true)
        router.refresh()
        setTimeout(() => setBusy(false), 500)
      }}
    >
      {busy ? 'Actualizando…' : 'Actualizar'}
    </button>
  )
}
