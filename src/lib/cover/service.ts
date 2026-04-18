import fm from 'front-matter'
import {JSDOM} from 'jsdom'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fetch} from 'undici'

import type {CoverGenerationInput, CoverGenerationResult, CoverInspectionInput, CoverInspectionResult} from './types.js'

import {buildCoverPrompt} from './prompt.js'

const DEFAULT_IMAGE_ENDPOINT = 'https://api.siliconflow.cn/v1'
const DEFAULT_IMAGE_MODEL = 'Qwen/Qwen-Image'
const DEFAULT_IMAGE_SIZE = '1536x1024'
const parseFrontMatter = fm as unknown as <T>(input: string) => {attributes: T}

interface GeneratedImagePayload {
  b64_json?: string
  url?: string
}

interface ImageGenerationResponsePayload {
  data?: GeneratedImagePayload[]
  images?: GeneratedImagePayload[]
}

function normalizeImageEndpoint(endpoint?: string): string {
  const url = new URL(String(endpoint || DEFAULT_IMAGE_ENDPOINT).trim())
  if (!url.pathname.includes('/images/') && !url.pathname.endsWith('/images/generations')) {
    url.pathname = url.pathname.replace(/\/?$/, '/images/generations')
  }

  return url.toString()
}

function sanitizeBasename(inputValue: string): string {
  return inputValue
    .replaceAll(/[\\/:*?"<>|]+/g, '-')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 48) || 'cover'
}

function inferExtensionFromContentType(contentType?: string): string {
  const normalized = String(contentType || '').toLowerCase()

  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg'
  if (normalized.includes('webp')) return 'webp'
  if (normalized.includes('gif')) return 'gif'
  return 'png'
}

function parseMarkdownFrontMatter(markdown: string): {'cover'?: string; 'coverImage'?: string; 'title'?: string} {
  try {
    return parseFrontMatter<{'cover'?: string; 'coverImage'?: string; 'title'?: string}>(markdown).attributes
  } catch {
    return {}
  }
}

function extractFirstMarkdownImage(markdown: string): string {
  const match = markdown.match(/!\[[^\]]*]\(([^)\s]+(?:\s+"[^"]*")?)\)/)
  if (!match?.[1]) return ''
  return match[1].replace(/\s+"[^"]*"$/, '').trim()
}

function extractMarkdownTitle(markdown: string): string {
  const attributes = parseMarkdownFrontMatter(markdown)
  const frontMatterTitle = String(attributes.title || '').trim()
  if (frontMatterTitle) return frontMatterTitle

  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]
  return String(heading || '').trim()
}

function extractSummaryFromText(text: string): string {
  return text
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

function extractTitleFromHtmlDocument(html: string): string {
  const dom = new JSDOM(html)
  const {document} = dom.window
  const title = document.querySelector('title')?.textContent
    || document.querySelector('#output h1')?.textContent
    || document.querySelector('h1')?.textContent

  return String(title || '').trim()
}

function extractSummaryFromHtmlDocument(html: string): string {
  const dom = new JSDOM(html)
  const {document} = dom.window
  const text = document.querySelector('#output')?.textContent || document.body.textContent || ''
  return extractSummaryFromText(text)
}

function extractFirstHtmlImage(html: string): string {
  const dom = new JSDOM(html)
  const {document} = dom.window
  return String(document.querySelector('img')?.getAttribute('src') || '').trim()
}

async function resolveGeneratedBytes(source: string): Promise<{bytes: Uint8Array; extension: string; sourceUrl: string}> {
  if (source.startsWith('data:image/')) {
    const [meta, payload] = source.split(',', 2)
    const extension = meta.includes('jpeg') ? 'jpg'
      : meta.includes('webp') ? 'webp'
        : meta.includes('gif') ? 'gif'
          : 'png'
    return {
      bytes: Uint8Array.from(Buffer.from(payload, 'base64')),
      extension,
      sourceUrl: source,
    }
  }

  const response = await fetch(source, {
    signal: AbortSignal.timeout(60_000),
  })

  if (!response.ok) {
    throw new Error(`下载生成图片失败 (${response.status})`)
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  return {
    bytes,
    extension: inferExtensionFromContentType(response.headers.get('content-type') || undefined),
    sourceUrl: source,
  }
}

function resolveCoverResponseSource(payload: ImageGenerationResponsePayload): string {
  if (Array.isArray(payload.images) && payload.images.length > 0) {
    return String(payload.images[0]?.url || payload.images[0]?.b64_json || '').trim()
  }

  if (Array.isArray(payload.data) && payload.data.length > 0) {
    return String(payload.data[0]?.url || payload.data[0]?.b64_json || '').trim()
  }

  return ''
}

export async function inspectCover(inputValue: CoverInspectionInput): Promise<CoverInspectionResult> {
  if (String(inputValue.explicitCoverImage || '').trim()) {
    return {
      source: String(inputValue.explicitCoverImage).trim(),
      status: 'explicit',
      summary: '',
      title: '',
    }
  }

  let fileText = String(inputValue.fileText || '')
  if (!fileText && inputValue.inputPath) {
    fileText = await fs.readFile(path.resolve(inputValue.inputPath), 'utf8')
  }

  const extension = path.extname(String(inputValue.inputPath || '')).toLowerCase()
  const looksLikeHtml = extension === '.html' || extension === '.htm' || /<html|<!doctype html|<body|<img/i.test(fileText)

  if (looksLikeHtml) {
    const source = extractFirstHtmlImage(fileText)
    return {
      source: source || undefined,
      status: source ? 'body-first-image' : 'missing',
      summary: extractSummaryFromHtmlDocument(fileText),
      title: extractTitleFromHtmlDocument(fileText),
    }
  }

  const frontMatter = parseMarkdownFrontMatter(fileText)
  const frontMatterCover = String(frontMatter.coverImage || frontMatter.cover || '').trim()
  if (frontMatterCover) {
    return {
      source: frontMatterCover,
      status: 'article-meta',
      summary: extractSummaryFromText(fileText),
      title: extractMarkdownTitle(fileText),
    }
  }

  const firstMarkdownImage = extractFirstMarkdownImage(fileText)
  return {
    source: firstMarkdownImage || undefined,
    status: firstMarkdownImage ? 'body-first-image' : 'missing',
    summary: extractSummaryFromText(fileText),
    title: extractMarkdownTitle(fileText),
  }
}

export function createDefaultCoverOutputPath(inputValue: {directory?: string; title: string}): string {
  const directory = path.resolve(inputValue.directory || process.cwd())
  return path.join(directory, `${sanitizeBasename(inputValue.title)}.cover.png`)
}

export async function generateCoverImage(inputValue: CoverGenerationInput): Promise<CoverGenerationResult> {
  const apiKey = String(inputValue.apiKey || '').trim()
  if (!apiKey) {
    throw new Error('缺少图片模型 API Key，请先运行 `wl setup` 配置图片模型，或通过参数传入。')
  }

  const title = String(inputValue.title || '').trim()
  if (!title) {
    throw new Error('缺少封面标题')
  }

  const prompt = String(inputValue.prompt || '').trim() || buildCoverPrompt({
    style: inputValue.style,
    summary: inputValue.summary,
    title,
  })

  const model = String(inputValue.model || DEFAULT_IMAGE_MODEL).trim()
  const endpoint = normalizeImageEndpoint(inputValue.endpoint)
  const size = String(inputValue.size ?? DEFAULT_IMAGE_SIZE).trim()

  const response = await fetch(endpoint, {
    body: JSON.stringify({
      model,
      n: 1,
      prompt,
      size,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(180_000),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `封面图生成失败 (${response.status})`)
  }

  let payload: ImageGenerationResponsePayload

  try {
    payload = JSON.parse(text) as ImageGenerationResponsePayload
  } catch {
    throw new Error(text || '封面图响应解析失败')
  }

  const source = resolveCoverResponseSource(payload)
  if (!source) {
    throw new Error('图片生成成功，但响应中没有可用图片地址')
  }

  const resolved = await resolveGeneratedBytes(source)
  const defaultOutputPath = createDefaultCoverOutputPath({
    directory: inputValue.outputPath ? path.dirname(path.resolve(inputValue.outputPath)) : process.cwd(),
    title,
  })
  const resolvedOutputPath = path.resolve(inputValue.outputPath || defaultOutputPath).replace(/\.(png|jpg|jpeg|webp|gif)$/i, `.${resolved.extension}`)

  await fs.mkdir(path.dirname(resolvedOutputPath), {recursive: true})
  await fs.writeFile(resolvedOutputPath, resolved.bytes)

  return {
    model,
    outputPath: resolvedOutputPath,
    prompt,
    sourceUrl: resolved.sourceUrl,
  }
}
