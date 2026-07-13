import Link from 'next/link'
import styles from './conversations/conversations.module.css'

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PanelSmart</p>
          <h1 className={styles.title}>Chat bot de reclutamiento</h1>
          <p className={styles.sub}>
            Telegram activo. WhatsApp y web listos a nivel de identidad. Monitorea las conversaciones
            en vivo desde el panel.
          </p>
        </div>
      </header>
      <Link href="/conversations" className={styles.open}>
        Ver conversaciones
      </Link>
    </div>
  )
}
