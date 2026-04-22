import type {Response} from 'undici'

import {fetch} from 'undici'

const TAVILY_API_BASE_URL = 'https://api.tavily.com'

interface TavilySearchApiResponse {
  answer?: string
  query?: string
  results?: Array<{
    content?: string
    published_date?: string
    title?: string
    url?: string
  }>
}

export interface TavilySearchResult {
  content: string
  publishedDate?: string
  title: string
  url: string
}

export interface TavilySearchResponse {
  answer?: string
  query: string
  results: TavilySearchResult[]
}

function normalizeApiKey(apiKey?: string): string {
  return String(apiKey || '').trim()
}

function inferTopic(query: string): 'general' | 'news' {
  return /(?:\b(?:latest|recent|today|current|news|breaking|update|updates)\b|最新|今日|近期|当下|资讯|新闻|动态)/i.test(query)
    ? 'news'
    : 'general'
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(text || `Tavily request failed (${response.status})`)
  }
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

export async function validateTavilyApiKey(apiKey?: string): Promise<void> {
  const normalizedApiKey = normalizeApiKey(apiKey)
  if (!normalizedApiKey) {
    throw new Error('Tavily API key cannot be empty')
  }

  const response = await fetch(`${TAVILY_API_BASE_URL}/usage`, {
    headers: buildHeaders(normalizedApiKey),
    method: 'GET',
    signal: AbortSignal.timeout(20_000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Unable to validate the Tavily API key (${response.status})`)
  }
}

export async function searchWithTavily(input: {
  apiKey?: string
  maxResults?: number
  query: string
}): Promise<TavilySearchResponse> {
  const normalizedApiKey = normalizeApiKey(input.apiKey)
  const query = String(input.query || '').trim()

  if (!normalizedApiKey) {
    throw new Error('Missing Tavily API key. Configure it in `wl setup --section ai` or `wl config set search.apiKey <key>`.')
  }

  if (!query) {
    throw new Error('Unable to perform web search because the query is empty')
  }

  const topic = inferTopic(query)
  const response = await fetch(`${TAVILY_API_BASE_URL}/search`, {
    body: JSON.stringify({
      days: topic === 'news' ? 30 : undefined,
      'include_answer': true,
      'include_images': false,
      'include_raw_content': false,
      'max_results': input.maxResults || 5,
      query,
      'search_depth': 'advanced',
      topic,
    }),
    headers: buildHeaders(normalizedApiKey),
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Tavily search failed (${response.status})`)
  }

  const payload = await readJson<TavilySearchApiResponse>(response)
  const results = Array.isArray(payload.results)
    ? payload.results
        .map(result => ({
          content: String(result.content || '').trim(),
          publishedDate: String(result.published_date || '').trim() || undefined,
          title: String(result.title || '').trim(),
          url: String(result.url || '').trim(),
        }))
        .filter(result => result.title && result.url)
    : []

  if (results.length === 0 && !String(payload.answer || '').trim()) {
    throw new Error('Tavily did not return any usable search results')
  }

  return {
    answer: String(payload.answer || '').trim() || undefined,
    query: String(payload.query || query).trim() || query,
    results,
  }
}

export function buildTavilySearchContext(input: {
  executedAt?: string
  response: TavilySearchResponse
}): string {
  const executedAt = String(input.executedAt || new Date().toISOString()).trim()
  const sections = [
    'Fresh web search context for the current task.',
    `Search time: ${executedAt}`,
    `Search query: ${input.response.query}`,
  ]

  if (input.response.answer) {
    sections.push('', 'Search summary:', input.response.answer)
  }

  if (input.response.results.length > 0) {
    sections.push('', 'Sources:')

    for (const [index, result] of input.response.results.entries()) {
      sections.push(
        `${index + 1}. ${result.title}`,
        `   URL: ${result.url}`,
        `   Published: ${result.publishedDate || 'unknown'}`,
        `   Snippet: ${result.content || 'No snippet returned.'}`,
      )
    }
  }

  sections.push(
    '',
    'Use this search context as the freshest available information when the user explicitly requests latest, recent, current, or news-based content.',
    'If the search context and model memory conflict, prefer the search context.',
  )

  return sections.join('\n')
}
