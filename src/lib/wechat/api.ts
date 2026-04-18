import type {Response} from 'undici'

import fs from 'node:fs/promises'
import path from 'node:path'
import {fetch, FormData} from 'undici'

const DEFAULT_PROXY_ORIGIN = 'https://waer.ltd'

export interface WechatImageAsset {
  bytes: Uint8Array
  fileName: string
  mimeType: string
}

function sanitizeWechatCredential(raw: string): string {
  return String(raw || '')
    .replaceAll(/\u200B|\u200C|\u200D|\u2060|\uFEFF/g, '')
    .trim()
}

function normalizeProxyOrigin(proxyOrigin?: string): string | undefined {
  const resolved = String(proxyOrigin || '').trim().replace(/\/+$/, '')
  return resolved || undefined
}

function guessMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()

  switch (ext) {
    case '.gif': {
      return 'image/gif'
    }

    case '.jpeg':
    case '.jpg': {
      return 'image/jpeg'
    }

    case '.png': {
      return 'image/png'
    }

    case '.webp': {
      return 'image/webp'
    }

    default: {
      return 'application/octet-stream'
    }
  }
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch (error) {
    throw new Error(error instanceof Error ? `读取响应失败: ${error.message}` : '读取响应失败')
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await readResponseText(response)

  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new Error(error instanceof Error ? `JSON 解析失败: ${error.message}` : `JSON 解析失败: ${text}`)
  }
}

async function requestJsonWithOptionalProxy(input: {
  body?: unknown
  directUrl: string
  errorContext: string
  method?: 'GET' | 'POST'
  proxyUrl?: string
}): Promise<unknown> {
  const method = input.method || 'POST'
  const headers: Record<string, string> = {}
  let body: string | undefined

  if (input.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(input.body)
  }

  const send = async (url: string) => fetch(url, {
      body,
      headers,
      method,
      signal: AbortSignal.timeout(30_000),
    })

  let response: Response

  try {
    response = await send(input.directUrl)
  } catch (error) {
    if (!input.proxyUrl) {
      throw new Error(`${input.errorContext}: ${error instanceof Error ? error.message : String(error)}`)
    }

    response = await send(input.proxyUrl)
  }

  if (!response.ok) {
    const text = await readResponseText(response)
    throw new Error(`HTTP 状态错误: ${response.status}，响应: ${text}`)
  }

  return parseJsonResponse(response)
}

async function requestMultipartWithOptionalProxy(input: {
  directUrl: string
  errorContext: string
  fieldName?: string
  file: WechatImageAsset
  proxyUrl?: string
}): Promise<unknown> {
  const fieldName = input.fieldName || 'media'
  const buildForm = () => {
    const form = new FormData()
    form.append(fieldName, new Blob([Buffer.from(input.file.bytes)], {type: input.file.mimeType}), input.file.fileName)
    return form
  }

  const send = async (url: string) => fetch(url, {
      body: buildForm(),
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
    })

  let response: Response

  try {
    response = await send(input.directUrl)
  } catch (error) {
    if (!input.proxyUrl) {
      throw new Error(`${input.errorContext}: ${error instanceof Error ? error.message : String(error)}`)
    }

    response = await send(input.proxyUrl)
  }

  if (!response.ok) {
    const text = await readResponseText(response)
    throw new Error(`HTTP 状态错误: ${response.status}，响应: ${text}`)
  }

  return parseJsonResponse(response)
}

function ensureWechatBusinessSuccess(payload: unknown): void {
  const errcode = (payload as {errcode?: number})?.errcode
  if (typeof errcode === 'number' && errcode !== 0) {
    throw new Error(`微信API错误: ${JSON.stringify(payload)}`)
  }
}

export async function getWechatAccessToken(input: {appId: string; appSecret: string; proxyOrigin?: string}): Promise<string> {
  const appId = sanitizeWechatCredential(input.appId)
  const appSecret = sanitizeWechatCredential(input.appSecret)
  const proxyOrigin = normalizeProxyOrigin(input.proxyOrigin || DEFAULT_PROXY_ORIGIN)
  const body = {
    appid: appId,
    'grant_type': 'client_credential',
    secret: appSecret,
  }

  const directUrl = 'https://api.weixin.qq.com/cgi-bin/stable_token'
  const proxyUrl = proxyOrigin ? `${proxyOrigin}/cgi-bin/stable_token` : undefined

  try {
    const directPayload = await requestJsonWithOptionalProxy({
      body,
      directUrl,
      errorContext: '请求 access_token 失败',
      method: 'POST',
    })
    const token = (directPayload as {access_token?: string})?.access_token
    if (typeof token === 'string' && token.trim()) {
      return token
    }

    if (!proxyUrl) {
      throw new Error(`微信返回异常: ${JSON.stringify(directPayload)}`)
    }
  } catch (error) {
    if (!proxyUrl) {
      throw error
    }
  }

  const proxyPayload = await requestJsonWithOptionalProxy({
    body,
    directUrl: proxyUrl,
    errorContext: '请求 access_token 失败',
    method: 'POST',
  })
  const token = (proxyPayload as {access_token?: string})?.access_token
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error(`代理响应未包含 access_token: ${JSON.stringify(proxyPayload)}`)
  }

  return token
}

export async function uploadWechatMaterial(input: {
  accessToken: string
  file: WechatImageAsset
  proxyOrigin?: string
}): Promise<{mediaId: string}> {
  const proxyOrigin = normalizeProxyOrigin(input.proxyOrigin)
  const directUrl = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${input.accessToken}&type=image`
  const proxyUrl = proxyOrigin
    ? `${proxyOrigin}/cgi-bin/material/add_material?access_token=${input.accessToken}&type=image`
    : undefined

  const payload = await requestMultipartWithOptionalProxy({
    directUrl,
    errorContext: '上传永久素材失败',
    file: input.file,
    proxyUrl,
  })
  ensureWechatBusinessSuccess(payload)

  const mediaId = (payload as {'media_id'?: string}).media_id
  if (typeof mediaId !== 'string' || !mediaId.trim()) {
    throw new Error(`上传成功但未返回 media_id: ${JSON.stringify(payload)}`)
  }

  return {mediaId}
}

export async function uploadWechatContentImage(input: {
  accessToken: string
  file: WechatImageAsset
  proxyOrigin?: string
}): Promise<{url: string}> {
  const proxyOrigin = normalizeProxyOrigin(input.proxyOrigin)
  const lowerMime = input.file.mimeType.toLowerCase()
  const sizeMb = input.file.bytes.length / 1024 / 1024
  const useUploadImg = sizeMb < 1 && (lowerMime === 'image/jpeg' || lowerMime === 'image/png')

  const directUrl = useUploadImg
    ? `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${input.accessToken}`
    : `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${input.accessToken}&type=image`
  const proxyUrl = proxyOrigin
    ? useUploadImg
      ? `${proxyOrigin}/cgi-bin/media/uploadimg?access_token=${input.accessToken}`
      : `${proxyOrigin}/cgi-bin/material/add_material?access_token=${input.accessToken}&type=image`
    : undefined

  const payload = await requestMultipartWithOptionalProxy({
    directUrl,
    errorContext: '上传正文图片失败',
    file: input.file,
    proxyUrl,
  })
  ensureWechatBusinessSuccess(payload)

  const rawUrl = (payload as {url?: string})?.url
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error(`上传成功但未返回图片 URL: ${JSON.stringify(payload)}`)
  }

  return {
    url: rawUrl.startsWith('http://') ? rawUrl.replace('http://', 'https://') : rawUrl,
  }
}

export async function addWechatDraft(input: {
  accessToken: string
  articles: unknown
  proxyOrigin?: string
}): Promise<{mediaId: string}> {
  const proxyOrigin = normalizeProxyOrigin(input.proxyOrigin)
  const directUrl = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${input.accessToken}`
  const proxyUrl = proxyOrigin
    ? `${proxyOrigin}/cgi-bin/draft/add?access_token=${input.accessToken}`
    : undefined

  const payload = await requestJsonWithOptionalProxy({
    body: input.articles,
    directUrl,
    errorContext: '创建草稿失败',
    method: 'POST',
    proxyUrl,
  })
  ensureWechatBusinessSuccess(payload)

  const mediaId = (payload as {'media_id'?: string}).media_id
  if (typeof mediaId !== 'string' || !mediaId.trim()) {
    throw new Error(`创建草稿成功但未返回 media_id: ${JSON.stringify(payload)}`)
  }

  return {mediaId}
}

export async function getWechatDraft(input: {
  accessToken: string
  mediaId: string
  proxyOrigin?: string
}): Promise<unknown> {
  const proxyOrigin = normalizeProxyOrigin(input.proxyOrigin)
  const directUrl = `https://api.weixin.qq.com/cgi-bin/draft/get?access_token=${input.accessToken}`
  const proxyUrl = proxyOrigin
    ? `${proxyOrigin}/cgi-bin/draft/get?access_token=${input.accessToken}`
    : undefined

  const payload = await requestJsonWithOptionalProxy({
    body: {'media_id': input.mediaId},
    directUrl,
    errorContext: '获取草稿详情失败',
    method: 'POST',
    proxyUrl,
  })
  ensureWechatBusinessSuccess(payload)
  return payload
}

export async function submitWechatFreePublish(input: {
  accessToken: string
  mediaId: string
  proxyOrigin?: string
}): Promise<{publishId: string}> {
  const proxyOrigin = normalizeProxyOrigin(input.proxyOrigin)
  const directUrl = `https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${input.accessToken}`
  const proxyUrl = proxyOrigin
    ? `${proxyOrigin}/cgi-bin/freepublish/submit?access_token=${input.accessToken}`
    : undefined

  const payload = await requestJsonWithOptionalProxy({
    body: {'media_id': input.mediaId},
    directUrl,
    errorContext: '提交发布失败',
    method: 'POST',
    proxyUrl,
  })
  ensureWechatBusinessSuccess(payload)

  // eslint-disable-next-line dot-notation
  const publishIdValue = (payload as {'publish_id'?: number | string})['publish_id']
  const publishId = typeof publishIdValue === 'number' ? String(publishIdValue) : publishIdValue
  if (typeof publishId !== 'string' || !publishId.trim()) {
    throw new Error(`提交发布成功但未返回 publish_id: ${JSON.stringify(payload)}`)
  }

  return {publishId}
}

export async function getWechatFreePublishStatus(input: {
  accessToken: string
  proxyOrigin?: string
  publishId: string
}): Promise<unknown> {
  const proxyOrigin = normalizeProxyOrigin(input.proxyOrigin)
  const directUrl = `https://api.weixin.qq.com/cgi-bin/freepublish/get?access_token=${input.accessToken}`
  const proxyUrl = proxyOrigin
    ? `${proxyOrigin}/cgi-bin/freepublish/get?access_token=${input.accessToken}`
    : undefined

  const payload = await requestJsonWithOptionalProxy({
    body: {'publish_id': input.publishId},
    directUrl,
    errorContext: '查询发布状态失败',
    method: 'POST',
    proxyUrl,
  })
  ensureWechatBusinessSuccess(payload)
  return payload
}

function decodeDataUri(uri: string): WechatImageAsset {
  const match = uri.match(/^data:(.*?);base64,(.*)$/)
  if (!match) {
    throw new Error('不支持的 data URI 图片格式')
  }

  const mimeType = match[1] || 'application/octet-stream'
  const bytes = Uint8Array.from(Buffer.from(match[2], 'base64'))
  const extension = mimeType.split('/')[1] || 'bin'

  return {
    bytes,
    fileName: `image.${extension}`,
    mimeType,
  }
}

export async function resolveWechatImageAsset(input: {assetBaseDir?: string; source: string}): Promise<WechatImageAsset> {
  const source = String(input.source || '').trim()
  if (!source) {
    throw new Error('图片地址不能为空')
  }

  if (source.startsWith('data:image')) {
    return decodeDataUri(source)
  }

  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, {
      headers: {'user-agent': 'Welight CLI/0.1 (+https://waer.ltd)'},
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) {
      throw new Error(`下载远程图片失败 (${response.status})`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const parsedUrl = new URL(source)
    const fileName = path.basename(parsedUrl.pathname) || 'image'
    const mimeType = response.headers.get('content-type') || guessMimeType(fileName)

    return {
      bytes: new Uint8Array(arrayBuffer),
      fileName,
      mimeType,
    }
  }

  const localPath = source.startsWith('file://')
    ? new URL(source)
    : path.resolve(input.assetBaseDir || process.cwd(), source)
  const filePath = localPath instanceof URL ? localPath : localPath
  const bytes = new Uint8Array(await fs.readFile(filePath))
  const fileName = path.basename(typeof filePath === 'string' ? filePath : filePath.pathname)

  return {
    bytes,
    fileName,
    mimeType: guessMimeType(fileName),
  }
}

export {DEFAULT_PROXY_ORIGIN}
