import {Readability} from '@mozilla/readability'
import {JSDOM} from 'jsdom'
import fs from 'node:fs/promises'
import path from 'node:path'
import TurndownService from 'turndown'
import {fetch} from 'undici'

import type {ArticleSource} from './types.js'

const turndown = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
})

function normalizeMarkdown(markdown: string): string {
  return String(markdown || '')
    .replaceAll('\r\n', '\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim()
}

function fallbackTitle(value: string): string {
  const trimmed = String(value || '').trim()
  return trimmed || 'Untitled Article'
}

function extractFirstMarkdownHeading(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim()
}

async function fetchReadableArticle(url: string): Promise<{markdown: string; title: string}> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Welight CLI/0.1 (+https://waer.ltd)',
    },
    signal: AbortSignal.timeout(20_000),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch the URL (${response.status})`)
  }

  const html = await response.text()
  const dom = new JSDOM(html, {url})
  const article = new Readability(dom.window.document).parse()

  if (!article?.content) {
    throw new Error('Unable to extract readable article content from this URL')
  }

  const markdownBody = normalizeMarkdown(turndown.turndown(article.content))
  const title = fallbackTitle(article.title || dom.window.document.title || url)
  const markdown = normalizeMarkdown(`# ${title}\n\n${markdownBody}\n\n> Source URL: ${url}`)

  return {markdown, title}
}

export function createIdeaMarkdownTemplate(ideaPrompt: string, title?: string): string {
  const resolvedTitle = fallbackTitle(title || ideaPrompt)

  return normalizeMarkdown(`
# ${resolvedTitle}

${ideaPrompt}

## 背景与问题

围绕这个主题，先交代背景、现状和读者关心的问题。

## 关键观点

1. 提炼 3 到 5 个最重要的观点。
2. 每个观点配一个具体例子或事实支撑。
3. 保持段落短小，适合公众号阅读。

## 实操建议

- 给出可直接执行的方法或步骤。
- 尽量具体，避免空泛表达。

## 总结

用一段简短的话收束全文，并给读者一个明确结论。
  `)
}

export async function resolveArticleSource(input: {
  inputPath?: string
  prompt?: string
  title?: string
  url?: string
}): Promise<ArticleSource> {
  if (input.inputPath) {
    const absolutePath = path.resolve(input.inputPath)
    const markdown = normalizeMarkdown(await fs.readFile(absolutePath, 'utf8'))
    const derivedTitle = input.title || extractFirstMarkdownHeading(markdown) || path.parse(absolutePath).name

    return {
      markdown,
      mode: 'markdown-file',
      sourceLabel: absolutePath,
      title: fallbackTitle(derivedTitle),
    }
  }

  if (input.url) {
    const {markdown, title} = await fetchReadableArticle(input.url)

    return {
      markdown,
      mode: 'url',
      sourceLabel: input.url,
      title: fallbackTitle(input.title || title),
      url: input.url,
    }
  }

  const prompt = String(input.prompt || '').trim()
  if (!prompt) {
    throw new Error('Missing article input. Provide --input, --url, or --prompt.')
  }

  return {
    ideaPrompt: prompt,
    markdown: '',
    mode: 'idea',
    sourceLabel: 'interactive prompt',
    title: fallbackTitle(input.title || prompt),
  }
}
