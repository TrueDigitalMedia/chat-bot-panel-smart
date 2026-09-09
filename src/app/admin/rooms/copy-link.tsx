'use client'

import { useState } from 'react'

/** Copy-to-clipboard button for a room URL (spec 016 T019). */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked — no-op; the URL is still visible next to the button.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="border-border hover:bg-accent rounded-md border px-2 py-1 text-xs"
    >
      {copied ? 'Copiado ✓' : 'Copiar'}
    </button>
  )
}
