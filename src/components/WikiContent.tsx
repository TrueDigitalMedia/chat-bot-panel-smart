'use client'

import React, { useState } from 'react'
import { Search, Copy, Check } from 'lucide-react'

interface WikiContentProps {
  content: string
  toc: Array<{ id: string; label: string; level: number }>
}

export function WikiContent({ content, toc }: WikiContentProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const highlightedContent = !searchTerm
    ? content
    : content.replace(new RegExp(`(${searchTerm})`, 'gi'), '<mark className="bg-yellow-200">$1</mark>')

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
      {/* Sidebar TOC */}
      <aside className="hidden space-y-4 lg:block">
        <div className="sticky top-4 space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Índice</h3>
            <nav className="space-y-1">
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`block truncate text-sm hover:text-blue-600 dark:hover:text-blue-400 ${
                    item.level === 1
                      ? 'font-semibold text-gray-900 dark:text-white'
                      : item.level === 2
                        ? 'ml-4 text-gray-700 dark:text-gray-300'
                        : 'ml-8 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:col-span-3">
        {/* Search */}
        <div className="mb-6 sticky top-0 z-10 bg-white dark:bg-slate-950 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar en la wiki..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-slate-950 dark:text-white dark:placeholder-gray-400"
            />
          </div>
        </div>

        {/* Wiki Content */}
        <div className="prose prose-sm dark:prose-invert max-w-none space-y-4">
          <WikiMarkdown content={highlightedContent} onCopyCode={handleCopyCode} copiedCode={copiedCode} />
        </div>
      </main>
    </div>
  )
}

interface WikiMarkdownProps {
  content: string
  onCopyCode: (code: string) => void
  copiedCode: string | null
}

function WikiMarkdown({ content, onCopyCode, copiedCode }: WikiMarkdownProps) {
  const lines = content.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = headingMatch[2]
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      const Tag = `h${level}` as any
      elements.push(
        React.createElement(Tag, { key: `heading-${i}`, id, className: 'scroll-mt-20' }, text)
      )
      i++
      continue
    }

    // Code blocks
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```

      const code = codeLines.join('\n')
      elements.push(
        <div key={`code-${i}`} className="relative my-4 rounded-lg bg-gray-900 p-4">
          <button
            onClick={() => onCopyCode(code)}
            className="absolute right-2 top-2 rounded-md bg-gray-700 p-2 hover:bg-gray-600"
            title="Copiar código"
          >
            {copiedCode === code ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 text-gray-300" />
            )}
          </button>
          {lang && <div className="text-xs text-gray-400 mb-2">{lang}</div>}
          <pre className="overflow-x-auto">
            <code className="text-sm text-gray-100">{code}</code>
          </pre>
        </div>
      )
      continue
    }

    // Tables
    if (line.includes('|')) {
      const tableLines = [line]
      i++
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i])
        i++
      }

      const rows = tableLines.map((l) => l.split('|').map((c) => c.trim()).filter(Boolean))
      if (rows.length > 1) {
        elements.push(
          <div key={`table-${i}`} className="my-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {rows[0].map((cell, j) => (
                    <th key={j} className="border-b border-gray-200 px-4 py-2 text-left font-semibold dark:border-gray-700">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(2).map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="border-b border-gray-200 px-4 py-2 dark:border-gray-700">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // Horizontal rule
    if (line.trim() === '---') {
      elements.push(<hr key={`hr-${i}`} className="my-6 border-gray-300 dark:border-gray-700" />)
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('>')) {
      const blockquoteLines = []
      while (i < lines.length && lines[i].startsWith('>')) {
        blockquoteLines.push(lines[i].slice(1).trim())
        i++
      }
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="border-l-4 border-blue-500 pl-4 italic text-gray-700 dark:text-gray-300"
        >
          {blockquoteLines.join(' ')}
        </blockquote>
      )
      continue
    }

    // List items
    if (line.match(/^[\s-*+]/)) {
      const listLines = []
      const baseIndent = line.search(/\S/)
      while (i < lines.length && lines[i].match(/^[\s-*+]/) && lines[i].search(/\S/) >= baseIndent) {
        listLines.push(lines[i])
        i++
      }

      elements.push(
        <ul key={`list-${i}`} className="list-disc space-y-1 pl-6">
          {listLines.map((item, idx) => (
            <li key={idx} className="text-gray-700 dark:text-gray-300">
              {item.replace(/^[\s-*+]+/, '').trim()}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Paragraphs
    if (line.trim()) {
      elements.push(
        <p key={`para-${i}`} className="text-gray-700 dark:text-gray-300">
          {renderInlineMarkdown(line)}
        </p>
      )
    }

    i++
  }

  return <>{elements}</>
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let lastIndex = 0

  // Combined regex to match all inline markdown patterns
  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, type: 'bold' },
    { regex: /\*(.+?)\*/g, type: 'italic' },
    { regex: /`(.+?)`/g, type: 'code' },
    { regex: /\[(.+?)\]\((.+?)\)/g, type: 'link' },
  ]

  // Find all matches with their positions
  const matches: Array<{ start: number; end: number; type: string; groups: string[] }> = []

  for (const { regex, type } of patterns) {
    let match
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type,
        groups: Array.from(match).slice(1),
      })
    }
  }

  // Sort by start position and process
  matches.sort((a, b) => a.start - b.start)

  let currentIndex = 0
  let keyCounter = 0

  for (const match of matches) {
    if (match.start > currentIndex) {
      parts.push(text.slice(currentIndex, match.start))
    }

    const key = `inline-${keyCounter++}`

    switch (match.type) {
      case 'bold':
        parts.push(<strong key={key}>{match.groups[0]}</strong>)
        break
      case 'italic':
        parts.push(<em key={key}>{match.groups[0]}</em>)
        break
      case 'code':
        parts.push(
          <code key={key} className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-sm">
            {match.groups[0]}
          </code>
        )
        break
      case 'link':
        parts.push(
          <a
            key={key}
            href={match.groups[1]}
            className="text-blue-600 dark:text-blue-400 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {match.groups[0]}
          </a>
        )
        break
    }

    currentIndex = match.end
  }

  if (currentIndex < text.length) {
    parts.push(text.slice(currentIndex))
  }

  return parts.length === 0 ? text : parts
}
