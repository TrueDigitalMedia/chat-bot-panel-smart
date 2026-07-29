import { readFileSync } from 'fs'
import { join } from 'path'

let cachedWikiContent: string | null = null

export function getWikiContent(): string {
  if (cachedWikiContent) {
    return cachedWikiContent
  }

  const wikiPath = join(process.cwd(), 'docs', 'WIKI.md')
  cachedWikiContent = readFileSync(wikiPath, 'utf-8')
  return cachedWikiContent
}

export function extractTableOfContents(markdown: string): Array<{ id: string; label: string; level: number }> {
  const lines = markdown.split('\n')
  const toc: Array<{ id: string; label: string; level: number }> = []

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (!match) continue

    const level = match[1].length
    const label = match[2].replace(/\[(.+?)\]\(.*?\)/, '$1').trim()
    const id = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    if (level <= 3) {
      toc.push({ id, label, level })
    }
  }

  return toc
}
