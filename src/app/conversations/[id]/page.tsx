import Link from 'next/link'
import { ConversationMonitor } from './monitor'
import styles from '../conversations.module.css'

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Monitor</p>
          <h1 className={styles.title}>Conversación</h1>
          <p className={styles.sub}>Vista en vivo del hilo y del estado del lead.</p>
        </div>
        <Link href="/conversations" className={styles.backLink}>
          ← Todas
        </Link>
      </header>
      <ConversationMonitor leadId={id} />
    </div>
  )
}
