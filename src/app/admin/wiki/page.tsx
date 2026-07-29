import { getWikiContent, extractTableOfContents } from '@/lib/wiki/loader'
import { WikiContent } from '@/components/WikiContent'
import { WikiChatWidget } from '@/components/WikiChatWidget'

export const metadata = {
  title: 'Wiki del Sistema | PanelSmart Admin',
  description: 'Documentación completa del sistema PanelSmart Recruitment Bot',
}

export default function WikiPage() {
  const wikiContent = getWikiContent()
  const toc = extractTableOfContents(wikiContent)

  return (
    <>
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Wiki del Sistema</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Documentación técnica y de arquitectura del bot de reclutamiento PanelSmart
          </p>
        </div>

        <WikiContent content={wikiContent} toc={toc} />
      </div>

      {/* Chat Widget */}
      <WikiChatWidget />
    </>
  )
}
