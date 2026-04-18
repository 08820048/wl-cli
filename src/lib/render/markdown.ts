import frontMatter from 'front-matter'
import {JSDOM} from 'jsdom'
import {Marked} from 'marked'
import readingTime from 'reading-time'

const markdown = new Marked({
  breaks: true,
  gfm: true,
})

function extractDocumentTitle(rawTitle: unknown, fallback: string): string {
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : ''
  return title || fallback
}

const parseFrontMatter = frontMatter as unknown as <T>(markdownText: string) => {
  attributes: T
  body: string
}

// eslint-disable-next-line no-undef
function decorateH2Heading(heading: Element): void {
  const rawText = heading.textContent?.trim() || ''
  const label = heading.ownerDocument.createElement('span')
  label.className = 'md-h2-label'

  if (!rawText) {
    label.innerHTML = heading.innerHTML
    heading.innerHTML = ''
    heading.append(label)
    return
  }

  const characters = [...rawText]
  const firstCharacter = characters.shift() || ''
  const first = heading.ownerDocument.createElement('span')
  first.className = 'md-h2-first'
  first.textContent = firstCharacter

  label.append(first)
  label.append(characters.join(''))
  heading.textContent = ''
  heading.append(label)
}

function decorateRenderedHtml(html: string, title: string, readingSummary: string): string {
  const dom = new JSDOM(`<div id="wl-render-root">${html}</div>`)
  const {document} = dom.window
  const root = document.querySelector('#wl-render-root')

  if (!root) {
    throw new Error('Markdown 渲染失败')
  }

  if (!root.querySelector('h1') && title) {
    const heading = document.createElement('h1')
    heading.textContent = title
    root.prepend(heading)
  }

  for (const heading of root.querySelectorAll('h2')) {
    decorateH2Heading(heading)
  }

  for (const pre of root.querySelectorAll('pre')) {
    pre.classList.add('code__pre')
  }

  const article = document.createElement('section')
  article.className = 'container md-container'

  if (readingSummary) {
    const blockquote = document.createElement('blockquote')
    const paragraph = document.createElement('p')
    paragraph.textContent = readingSummary
    blockquote.append(paragraph)
    article.append(blockquote)
  }

  article.innerHTML += root.innerHTML
  return article.outerHTML
}

export function renderMarkdownArticle(input: {countStatus?: boolean; fallbackTitle: string; markdownText: string}) {
  const parsed = parseFrontMatter<Record<string, unknown>>(input.markdownText)
  const markdownBody = String(parsed.body || '').trim()
  const resolvedTitle = extractDocumentTitle(parsed.attributes?.title, input.fallbackTitle)
  const reading = readingTime(markdownBody)
  const readingSummary = input.countStatus && reading.words > 0
    ? `字数 ${reading.words}，阅读大约需 ${Math.max(1, Math.ceil(reading.minutes))} 分钟`
    : ''

  const renderedHtml = markdown.parse(markdownBody) as string

  return {
    articleHtml: decorateRenderedHtml(renderedHtml, resolvedTitle, readingSummary),
    resolvedTitle,
  }
}
