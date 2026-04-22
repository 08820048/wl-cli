import {highlight as cliHighlight} from 'cli-highlight'
import {JSDOM} from 'jsdom'
import {Marked} from 'marked'

const markdown = new Marked({
  breaks: true,
  gfm: true,
})

interface RenderNodeLike {
  children: Iterable<RenderNodeLike>
  getAttribute: (name: string) => null | string
  tagName: string
  textContent: null | string
}

function stripFrontMatter(inputValue: string): string {
  return inputValue.replace(/^---\n[\s\S]*?\n---\n?/u, '')
}

function wrapText(inputValue: string, options: {prefix?: string; width: number}): string[] {
  const prefix = options.prefix || ''
  const width = Math.max(options.width - prefix.length, 20)
  const source = inputValue.replaceAll('\r', '')

  if (!source.trim()) {
    return [prefix]
  }

  const lines: string[] = []
  let current = ''

  for (const character of source) {
    if (character === '\n') {
      lines.push(`${prefix}${current}`)
      current = ''
      continue
    }

    if ((current + character).length > width) {
      lines.push(`${prefix}${current}`)
      current = character === ' ' ? '' : character
      continue
    }

    current += character
  }

  lines.push(`${prefix}${current}`)
  return lines
}

function renderParagraph(text: string, width: number, prefix?: string): string[] {
  return text
    .split(/\n{2,}/u)
    .flatMap(paragraph => wrapText(paragraph.trim(), {prefix, width}))
}

function renderListItem(text: string, width: number, marker: string): string[] {
  const wrapped = wrapText(text, {prefix: `${marker} `, width})
  const hangingPrefix = ' '.repeat(marker.length + 1)
  return wrapped.map((line, index) => index === 0 ? line : `${hangingPrefix}${line.trimStart()}`)
}

function extractText(node: RenderNodeLike): string {
  return (node.textContent || '').replaceAll(/\s+/g, ' ').trim()
}

function renderNode(node: RenderNodeLike, width: number): string[] {
  const tagName = node.tagName.toLowerCase()

  switch (tagName) {
    case 'blockquote': {
      return renderParagraph(extractText(node), width, '│ ')
    }

    case 'h1':
    case 'h2':
    case 'h3': {
      const text = extractText(node)
      if (!text) return []
      return wrapText(text, {width}).map(line => line.trim()).filter(Boolean)
    }

    case 'hr': {
      return ['─'.repeat(Math.max(12, width))]
    }

    case 'img': {
      const alt = String(node.getAttribute('alt') || '').trim()
      const source = String(node.getAttribute('src') || '').trim()
      return [`[Image] ${alt || source || 'Untitled image'}`]
    }

    case 'ol': {
      return [...node.children]
        .filter(child => child.tagName.toLowerCase() === 'li')
        .flatMap((child, index) => renderListItem(extractText(child), width, `${index + 1}.`))
    }

    case 'p': {
      return renderParagraph(extractText(node), width)
    }

    case 'pre': {
      const codeChild = [...node.children].find(child => child.tagName.toLowerCase() === 'code')
      const langClass = codeChild?.getAttribute('class') || ''
      const lang = /\blanguage-(\w+)\b/u.exec(langClass)?.[1]
      const rawCode = (codeChild?.textContent || node.textContent || '').replace(/\n+$/u, '')

      let lines: string[]
      try {
        const highlighted = cliHighlight(rawCode, {ignoreIllegals: true, language: lang})
        lines = highlighted.split('\n')
      } catch {
        lines = rawCode.split('\n')
      }

      return lines.map(line => `    ${line}`)
    }

    case 'ul': {
      return [...node.children]
        .filter(child => child.tagName.toLowerCase() === 'li')
        .flatMap(child => renderListItem(extractText(child), width, '•'))
    }

    default: {
      const children = [...node.children]
      if (children.length === 0) {
        const text = extractText(node)
        return text ? renderParagraph(text, width) : []
      }

      return children.flatMap(child => renderNode(child, width))
    }
  }
}

function createLineSegments(inputValue: string): string[] {
  return inputValue.match(/[^\n]*\n?|$/gu)?.filter(Boolean) || []
}

export function extractStableMarkdownChunk(markdownText: string): {
  completed: string
  remainder: string
} {
  const source = String(markdownText || '').replaceAll('\r', '')
  const segments = createLineSegments(source)
  let completedOffset = 0
  let currentOffset = 0
  let inFence = false
  let fenceMarker = ''
  let inFrontMatter = false
  let hasSeenContent = false

  for (const segment of segments) {
    const line = segment.replace(/\n$/u, '')
    const trimmed = line.trim()
    const segmentEnd = currentOffset + segment.length

    if (!hasSeenContent && trimmed === '---') {
      inFrontMatter = !inFrontMatter
      currentOffset = segmentEnd
      continue
    }

    if (inFrontMatter && trimmed === '---') {
      inFrontMatter = false
      completedOffset = segmentEnd
      currentOffset = segmentEnd
      continue
    }

    if (inFrontMatter) {
      currentOffset = segmentEnd
      continue
    }

    if (trimmed) {
      hasSeenContent = true
    }

    const fenceMatch = trimmed.match(/^(```+|~~~+)/u)?.[1]
    if (fenceMatch) {
      if (!inFence) {
        inFence = true
        fenceMarker = fenceMatch
      } else if (trimmed.startsWith(fenceMarker)) {
        inFence = false
        fenceMarker = ''
        completedOffset = segmentEnd
      }

      currentOffset = segmentEnd
      continue
    }

    if (!inFence && trimmed === '') {
      completedOffset = segmentEnd
    }

    currentOffset = segmentEnd
  }

  return {
    completed: source.slice(0, completedOffset),
    remainder: source.slice(completedOffset),
  }
}

export function renderMarkdownPreview(markdownText: string, width = 100): string {
  const source = stripFrontMatter(String(markdownText || ''))
  if (!source.trim()) {
    return 'Waiting for content...'
  }

  let html = ''
  try {
    html = String(markdown.parse(source) || '')
  } catch {
    return source.trim()
  }

  const dom = new JSDOM(`<body>${html}</body>`)
  const {document} = dom.window
  const lines = [...(document.body.children as unknown as Iterable<RenderNodeLike>)]
    .flatMap(node => {
      const rendered = renderNode(node, width)
      return rendered.length > 0 ? [...rendered, ''] : []
    })

  while (lines.length > 0 && !lines.at(-1)?.trim()) {
    lines.pop()
  }

  return lines.join('\n') || source.trim()
}

export class MarkdownStreamRenderer {
  private buffer = ''
  private flushTimer?: NodeJS.Timeout
  private readonly isInteractive = Boolean(process.stdout.isTTY)
  private readonly width: number

  constructor(width = Math.max((process.stdout.columns || 100) - 2, 40)) {
    this.width = width
  }

  append(token: string): void {
    this.buffer += token

    if (!this.isInteractive) {
      process.stdout.write(token)
      return
    }

    this.scheduleFlush()
  }

  finish(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = undefined
    }

    if (!this.isInteractive) {
      process.stdout.write('\n')
      this.buffer = ''
      return
    }

    this.flushCompleted()

    const remainder = this.buffer.trim()
    if (remainder) {
      this.writeRenderedChunk(this.buffer)
      this.buffer = ''
    }

    process.stdout.write('\n')
  }

  private flushCompleted(): void {
    const {completed, remainder} = extractStableMarkdownChunk(this.buffer)
    if (!completed.trim()) return

    this.writeRenderedChunk(completed)
    this.buffer = remainder
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return

    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined
      this.flushCompleted()
    }, 120)
  }

  private writeRenderedChunk(markdownChunk: string): void {
    const rendered = renderMarkdownPreview(markdownChunk, this.width).trim()
    if (!rendered) return
    process.stdout.write(`${rendered}\n\n`)
  }
}
