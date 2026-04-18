import {JSDOM} from 'jsdom'
import path from 'node:path'

import {
  addWechatDraft,
  DEFAULT_PROXY_ORIGIN,
  getWechatAccessToken,
  getWechatDraft,
  getWechatFreePublishStatus,
  resolveWechatImageAsset,
  submitWechatFreePublish,
  uploadWechatContentImage,
  uploadWechatMaterial,
} from './api.js'
import {convertHtmlDocumentToWechatInline} from './html.js'

export interface PublishWechatOptions {
  appId: string
  appSecret: string
  assetBaseDir?: string
  author?: string
  contentSourceUrl?: string
  coverImage?: string
  digest?: string
  fansCommentOnly?: boolean
  htmlDocument: string
  mode: 'draft' | 'publish'
  openComment?: boolean
  proxyOrigin?: string
  title?: string
  watermark?: boolean
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

function extractDraftPreviewUrl(payload: unknown): string {
  const previewUrl = (payload as {news_item?: Array<{url?: string}>})?.news_item?.[0]?.url
  return typeof previewUrl === 'string' ? previewUrl : ''
}

function extractArticleUrls(payload: unknown): string[] {
  const items = (payload as {article_detail?: {item?: Array<{article_url?: string}>}})?.article_detail?.item
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .map(item => item.article_url)
    .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
}

function buildDraftPayload(input: {
  author?: string
  contentHtml: string
  contentSourceUrl?: string
  digest?: string
  fansCommentOnly?: boolean
  openComment?: boolean
  thumbMediaId: string
  title: string
}) {
  const article: Record<string, number | string> = {
    'article_type': 'news',
    content: input.contentHtml,
    'need_open_comment': input.openComment ? 1 : 0,
    'only_fans_can_comment': input.fansCommentOnly ? 1 : 0,
    'thumb_media_id': input.thumbMediaId,
    title: input.title,
  }

  if (input.author?.trim()) {
    article.author = input.author.trim()
  }

  if (input.contentSourceUrl?.trim()) {
    // eslint-disable-next-line dot-notation
    article['content_source_url'] = input.contentSourceUrl.trim()
  }

  if (input.digest?.trim()) {
    article.digest = input.digest.trim()
  }

  return {articles: [article]}
}

async function uploadContentImages(input: {
  accessToken: string
  assetBaseDir?: string
  html: string
  log?: (message: string) => void
  proxyOrigin?: string
}): Promise<string> {
  const dom = new JSDOM(`<body>${input.html}</body>`)
  const {document} = dom.window
  const images = [...document.querySelectorAll('img')]

  for (const [index, image] of images.entries()) {
    const src = image.getAttribute('src')
    if (!src) continue
    if (src.includes('qpic.cn') || src.includes('qlogo.cn')) continue

    input.log?.(`上传正文图片 ${index + 1}/${images.length}`)
    // 顺序上传可以保持正文图片引用和日志进度一致。
    // eslint-disable-next-line no-await-in-loop
    const asset = await resolveWechatImageAsset({
      assetBaseDir: input.assetBaseDir,
      source: src,
    })
    // eslint-disable-next-line no-await-in-loop
    const {url} = await uploadWechatContentImage({
      accessToken: input.accessToken,
      file: asset,
      proxyOrigin: input.proxyOrigin,
    })
    image.setAttribute('src', url)
  }

  return document.body.innerHTML
}

async function resolveCoverMediaId(input: {
  accessToken: string
  assetBaseDir?: string
  coverImage?: string
  html: string
  log?: (message: string) => void
  proxyOrigin?: string
}): Promise<string> {
  let source = input.coverImage

  if (!source) {
    const dom = new JSDOM(`<body>${input.html}</body>`)
    const firstImage = dom.window.document.querySelector('img')
    source = firstImage?.getAttribute('src') || ''
  }

  if (!source) {
    throw new Error('必须提供封面图，或正文中至少包含一张图片')
  }

  input.log?.('上传封面图')
  const asset = await resolveWechatImageAsset({
    assetBaseDir: input.assetBaseDir,
    source,
  })
  const {mediaId} = await uploadWechatMaterial({
    accessToken: input.accessToken,
    file: asset,
    proxyOrigin: input.proxyOrigin,
  })

  return mediaId
}

async function pollPublishResult(input: {
  accessToken: string
  log?: (message: string) => void
  proxyOrigin?: string
  publishId: string
}): Promise<string[]> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const payload = await getWechatFreePublishStatus({
      accessToken: input.accessToken,
      proxyOrigin: input.proxyOrigin,
      publishId: input.publishId,
    })
    const status = (payload as {publish_status?: number})?.publish_status

    if (status === 1) {
      input.log?.(`发布中... (${attempt}/30)`)
      // eslint-disable-next-line no-await-in-loop
      await sleep(2000)
      continue
    }

    if (status === 0) {
      return extractArticleUrls(payload)
    }

    throw new Error(`发布失败: ${JSON.stringify(payload)}`)
  }

  throw new Error('发布超时：请稍后在公众号后台确认结果')
}

export async function publishWechatArticle(input: PublishWechatOptions & {log?: (message: string) => void}) {
  const proxyOrigin = input.proxyOrigin || DEFAULT_PROXY_ORIGIN
  const {html, title: detectedTitle} = convertHtmlDocumentToWechatInline(input.htmlDocument)
  const title = String(input.title || detectedTitle || '').trim()
  if (!title) {
    throw new Error('无法确定文章标题，请使用 --title 指定')
  }

  input.log?.('获取 Access Token')
  const accessToken = await getWechatAccessToken({
    appId: input.appId,
    appSecret: input.appSecret,
    proxyOrigin,
  })

  const contentHtml = await uploadContentImages({
    accessToken,
    assetBaseDir: input.assetBaseDir,
    html,
    log: input.log,
    proxyOrigin,
  })

  const thumbMediaId = await resolveCoverMediaId({
    accessToken,
    assetBaseDir: input.assetBaseDir,
    coverImage: input.coverImage,
    html: contentHtml,
    log: input.log,
    proxyOrigin,
  })

  input.log?.('创建公众号草稿')
  const {mediaId} = await addWechatDraft({
    accessToken,
    articles: buildDraftPayload({
      author: input.author,
      contentHtml,
      contentSourceUrl: input.contentSourceUrl,
      digest: input.digest,
      fansCommentOnly: input.fansCommentOnly,
      openComment: input.openComment,
      thumbMediaId,
      title,
    }),
    proxyOrigin,
  })

  if (input.mode === 'draft') {
    const draftPayload = await getWechatDraft({
      accessToken,
      mediaId,
      proxyOrigin,
    })

    return {
      accessToken,
      articleUrls: [],
      draftMediaId: mediaId,
      mode: input.mode,
      previewUrl: extractDraftPreviewUrl(draftPayload),
      title,
    }
  }

  input.log?.('提交一键发布')
  const {publishId} = await submitWechatFreePublish({
    accessToken,
    mediaId,
    proxyOrigin,
  })
  const articleUrls = await pollPublishResult({
    accessToken,
    log: input.log,
    proxyOrigin,
    publishId,
  })

  return {
    accessToken,
    articleUrls,
    draftMediaId: mediaId,
    mode: input.mode,
    previewUrl: articleUrls[0] || '',
    publishId,
    title,
  }
}

export function resolveWechatAssetBaseDir(inputPath: string): string {
  return path.dirname(path.resolve(inputPath))
}
