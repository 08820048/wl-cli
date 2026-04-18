import type {Response} from 'undici'

import {fetch} from 'undici'

const AI_API_BASE_URL = 'https://ilikexff.cn/api'
const CLIENT_INFO = 'Welight CLI'

export interface ChatMessage {
  content: string
  role: 'assistant' | 'system' | 'user'
}

interface ApiResponse<T> {
  code: number
  data?: T
  message: string
}

interface AIModel {
  apiEndpoint: string
  identifier: string
  maxContextLength?: number
  name: string
  provider: string
}

interface ModelValidationResponse {
  apiEndpoint?: string
  apiKey?: string
  errorMessage?: string
  valid: boolean
}

interface ResolvedModelConfig {
  apiEndpoint: string
  apiKey: string
  apiModel: string
  identifier: string
  maxTokens: number
  name: string
  provider: string
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function isOllamaIdentifier(identifier: string): boolean {
  return identifier === 'ollama'
    || (identifier.startsWith('llama') && !identifier.includes('qwen'))
    || identifier.startsWith('mistral')
    || (identifier.includes(':') && !identifier.startsWith('http'))
}

function mapIdentifierToApiModel(identifier: string): string {
  switch (identifier) {
    case 'deepseek-chat': {
      return 'deepseek-chat'
    }

    case 'Doubao-Seed': {
      return 'doubao-seed-1-6-251015'
    }

    case 'glm-4.5v': {
      return 'glm-4.5v'
    }

    case 'glm-46': {
      return 'glm-4.6'
    }

    case 'kimi-k2-0905-preview': {
      return 'kimi-k2-0905-preview'
    }

    case 'qwen3-max': {
      return 'qwen-max'
    }

    default: {
      return identifier
    }
  }
}

async function readApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text()

  try {
    return JSON.parse(text) as ApiResponse<T>
  } catch {
    throw new Error(text || `AI 服务请求失败 (${response.status})`)
  }
}

async function getServerModel(identifier: string): Promise<AIModel> {
  const response = await fetch(`${AI_API_BASE_URL}/ai-models/${identifier}`, {
    signal: AbortSignal.timeout(20_000),
  })
  const payload = await readApiResponse<AIModel>(response)

  if (payload.code !== 200 || !payload.data) {
    throw new Error(payload.message || `无法获取模型 ${identifier} 的配置`)
  }

  return payload.data
}

async function validateModel(identifier: string): Promise<ModelValidationResponse> {
  const response = await fetch(`${AI_API_BASE_URL}/ai-models/validate`, {
    body: JSON.stringify({
      clientInfo: CLIENT_INFO,
      identifier,
      source: 'cli',
    }),
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
  })
  const payload = await readApiResponse<ModelValidationResponse>(response)

  if (payload.code !== 200 || !payload.data) {
    throw new Error(payload.message || `模型 ${identifier} 校验失败`)
  }

  return payload.data
}

async function resolveModelConfig(identifier: string, localApiKey?: string): Promise<ResolvedModelConfig> {
  if (isOllamaIdentifier(identifier)) {
    const endpoint = process.env.WL_OLLAMA_BASE_URL || 'http://localhost:11434'
    const model = identifier === 'ollama'
      ? process.env.WL_OLLAMA_MODEL || 'llama3.2:3b'
      : identifier

    return {
      apiEndpoint: endpoint,
      apiKey: 'ollama-local',
      apiModel: model,
      identifier,
      maxTokens: 4000,
      name: 'Ollama',
      provider: 'OLLAMA',
    }
  }

  const [serverModel, validation] = await Promise.all([
    getServerModel(identifier),
    validateModel(identifier),
  ])

  if (!validation.valid) {
    throw new Error(validation.errorMessage || `模型 ${identifier} 当前不可用`)
  }

  const apiKey = String(localApiKey || validation.apiKey || '').trim()
  if (!apiKey) {
    throw new Error(`模型 ${identifier} 未返回可用的 API Key`)
  }

  return {
    apiEndpoint: serverModel.apiEndpoint || validation.apiEndpoint || '',
    apiKey,
    apiModel: mapIdentifierToApiModel(serverModel.identifier),
    identifier,
    maxTokens: Math.min(serverModel.maxContextLength || 8000, 8000),
    name: serverModel.name,
    provider: serverModel.provider.toUpperCase(),
  }
}

function buildApiUrl(config: ResolvedModelConfig): string {
  const baseUrl = normalizeBaseUrl(config.apiEndpoint)

  if (config.provider === 'OLLAMA') {
    return `${baseUrl}/api/chat`
  }

  return baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl}/chat/completions`
}

function buildRequestBody(config: ResolvedModelConfig, messages: ChatMessage[], webSearch: boolean) {
  const baseBody: Record<string, unknown> = {
    messages,
    model: config.apiModel,
    stream: false,
    temperature: 0.7,
  }
  Object.assign(baseBody, {'max_tokens': config.maxTokens})

  if (config.provider === 'KIMI' && webSearch) {
    baseBody.tools = [
      {
        function: {
          description: '用于联网搜索最新信息',
          name: '$web_search',
          parameters: {properties: {}, required: [], type: 'object'},
        },
        type: 'builtin_function',
      },
    ]
  }

  if (config.provider === 'QWEN' && webSearch) {
    Object.assign(baseBody, {'enable_search': true})
  }

  if ((config.provider === 'OTHER' || config.provider === 'ZHIPU') && webSearch) {
    const lastUserMessage = [...messages].reverse().find(message => message.role === 'user')
    baseBody.thinking = {type: 'disabled'}
    baseBody.tools = [
      {
        type: 'web_search',
        'web_search': {
          'search_query': lastUserMessage?.content || '',
          'search_result': true,
        },
      },
    ]
  }

  if (config.provider === 'OLLAMA') {
    return {
      messages,
      model: config.apiModel,
      stream: false,
    }
  }

  return baseBody
}

function parseOpenAiLikeText(payload: unknown): string {
  const candidate = payload as {
    choices?: Array<{
      delta?: {content?: string}
      message?: {
        content?: Array<string | {text?: string}> | string
      }
    }>
  }
  const choice = candidate.choices?.[0]
  const content = choice?.message?.content ?? choice?.delta?.content

  if (typeof content === 'string' && content.trim()) {
    return content.trim()
  }

  if (Array.isArray(content)) {
    const merged = content
      .map(part => {
        if (typeof part === 'string') return part
        if (typeof part?.text === 'string') return part.text
        return ''
      })
      .join('')
      .trim()

    if (merged) {
      return merged
    }
  }

  throw new Error('AI 响应中没有可用内容')
}

function parseOllamaText(payload: unknown): string {
  const candidate = payload as {
    message?: {content?: string}
    response?: string
  }
  const content = candidate.message?.content ?? candidate.response
  if (typeof content === 'string' && content.trim()) {
    return content.trim()
  }

  throw new Error('Ollama 响应中没有可用内容')
}

export async function runAiChat(input: {
  localApiKey?: string
  messages: ChatMessage[]
  model: string
  webSearch?: boolean
}): Promise<string> {
  const config = await resolveModelConfig(input.model, input.localApiKey)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (config.provider !== 'OLLAMA') {
    headers.Authorization = `Bearer ${config.apiKey}`
  }

  const response = await fetch(buildApiUrl(config), {
    body: JSON.stringify(buildRequestBody(config, input.messages, Boolean(input.webSearch))),
    headers,
    method: 'POST',
    signal: AbortSignal.timeout(180_000),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `AI 请求失败 (${response.status})`)
  }

  let payload: unknown

  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(text || 'AI 响应解析失败')
  }

  return config.provider === 'OLLAMA'
    ? parseOllamaText(payload)
    : parseOpenAiLikeText(payload)
}
