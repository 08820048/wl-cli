import {fetch} from 'undici'

import type {CoverPromptResult} from '../ai/title.js'

const DEFAULT_PIXABAY_API_KEY = '53826829-6fe731031d3a582cd6dff1b20'

export interface PixabayHit {
  downloads: number
  id: number
  imageHeight: number
  imageWidth: number
  largeImageURL: string
  likes: number
  pageURL: string
  previewURL: string
  tags: string
  type: string
  user: string
  webformatURL: string
}

export interface CoverRecommendationResult {
  orientation: CoverPromptResult['orientation']
  pageUrl: string
  previewUrl: string
  query: string
  source: 'pixabay'
  tags: string
  user: string
}

interface PixabaySearchResponse {
  hits?: PixabayHit[]
}

export function pickBestPixabayHit(
  hits: PixabayHit[],
  orientation: CoverPromptResult['orientation'],
): null | PixabayHit {
  if (!Array.isArray(hits) || hits.length === 0) return null

  const filtered = hits.filter((hit) => {
    const width = Number(hit.imageWidth) || 0
    const height = Number(hit.imageHeight) || 0
    if (width <= 0 || height <= 0) return false
    if (orientation === 'horizontal') return width >= height
    if (orientation === 'vertical') return height >= width
    return true
  })

  const ranked = [...(filtered.length > 0 ? filtered : hits)].sort((left, right) => {
    const leftScore = (Number(left.likes) || 0) * 2 + (Number(left.downloads) || 0) / 10
    const rightScore = (Number(right.likes) || 0) * 2 + (Number(right.downloads) || 0) / 10
    return rightScore - leftScore
  })

  return ranked[0] || null
}

export async function recommendPixabayCover(input: {
  apiKey?: string
  orientation?: CoverPromptResult['orientation']
  perPage?: number
  query: string
}): Promise<CoverRecommendationResult | null> {
  const query = String(input.query || '').trim()
  if (!query) throw new Error('Missing cover search query')

  const apiKey = String(input.apiKey || process.env.WL_PIXABAY_API_KEY || DEFAULT_PIXABAY_API_KEY).trim()
  const orientation = input.orientation || 'horizontal'
  const perPage = Math.min(Math.max(Number(input.perPage) || 30, 3), 50)
  const searchUrl = new URL('https://pixabay.com/api/')

  searchUrl.searchParams.set('category', '')
  searchUrl.searchParams.set('image_type', 'photo')
  searchUrl.searchParams.set('key', apiKey)
  searchUrl.searchParams.set('lang', 'zh')
  searchUrl.searchParams.set('page', '1')
  searchUrl.searchParams.set('per_page', String(perPage))
  searchUrl.searchParams.set('q', query)
  searchUrl.searchParams.set('safesearch', 'true')
  if (orientation !== 'all') {
    searchUrl.searchParams.set('orientation', orientation)
  }

  const response = await fetch(searchUrl, {
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `Pixabay request failed (${response.status})`)
  }

  let payload: PixabaySearchResponse
  try {
    payload = JSON.parse(text) as PixabaySearchResponse
  } catch {
    throw new Error(text || 'Failed to parse the Pixabay response')
  }

  const best = pickBestPixabayHit(payload.hits || [], orientation)
  if (!best) return null

  const previewUrl = String(best.webformatURL || best.previewURL || best.largeImageURL || '').trim()
  const pageUrl = String(best.pageURL || '').trim()
  if (!previewUrl || !pageUrl) return null

  return {
    orientation,
    pageUrl,
    previewUrl,
    query,
    source: 'pixabay',
    tags: String(best.tags || '').trim(),
    user: String(best.user || '').trim(),
  }
}
