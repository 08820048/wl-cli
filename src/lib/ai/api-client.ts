import type {Response} from 'undici'

import {fetch} from 'undici'

import {buildTavilySearchContext, searchWithTavily} from '../search/tavily.js'

const AI_API_BASE_URL = 'https://ilikexff.cn/api'
const CLIENT_INFO = 'Welight CLI'

export interface ChatMessage {
  content: string
  role: 'assistant' | 'system' | 'user'
}

export interface SearchConfigInput {
  apiKey?: string
  provider?: 'tavily'
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

interface OllamaStreamPayload {
  message?: {content?: string}
  response?: string
}

interface OpenAiLikeStreamPayload {
  choices?: Array<{
    delta?: {content?: string}
    message?: {
      content?: Array<string | {text?: string}> | string
    }
  }>
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

export function modelRequiresApiKey(identifier: string): boolean {
  return !isOllamaIdentifier(identifier)
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
    throw new Error(text || `AI service request failed (${response.status})`)
  }
}

async function getServerModel(identifier: string): Promise<AIModel> {
  const response = await fetch(`${AI_API_BASE_URL}/ai-models/${identifier}`, {
    signal: AbortSignal.timeout(20_000),
  })
  const payload = await readApiResponse<AIModel>(response)

  if (payload.code !== 200 || !payload.data) {
    throw new Error(payload.message || `Unable to fetch the configuration for model ${identifier}`)
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
    throw new Error(payload.message || `Validation failed for model ${identifier}`)
  }

  return payload.data
}

export async function validateAiModelIdentifier(identifier: string): Promise<{identifier: string; provider: string}> {
  if (isOllamaIdentifier(identifier)) {
    return {
      identifier,
      provider: 'OLLAMA',
    }
  }

  const [serverModel, validation] = await Promise.all([
    getServerModel(identifier),
    validateModel(identifier),
  ])

  if (!validation.valid) {
    throw new Error(validation.errorMessage || `Model ${identifier} is currently unavailable`)
  }

  return {
    identifier: serverModel.identifier,
    provider: serverModel.provider.toUpperCase(),
  }
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
    throw new Error(validation.errorMessage || `Model ${identifier} is currently unavailable`)
  }

  const apiKey = String(localApiKey || validation.apiKey || '').trim()
  if (!apiKey) {
    throw new Error(`Model ${identifier} did not return a usable API key`)
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

export function supportsNativeWebSearch(input: {identifier: string; provider: string}): boolean {
  const provider = String(input.provider || '').trim().toUpperCase()
  const identifier = String(input.identifier || '').trim().toLowerCase()

  if (!provider || identifier.startsWith('deepseek')) {
    return false
  }

  return provider === 'KIMI' || provider === 'QWEN' || provider === 'ZHIPU'
}

function buildWebSearchQuery(messages: ChatMessage[]): string {
  const lastUserMessage = [...messages].reverse().find(message => message.role === 'user')
  if (lastUserMessage?.content.trim()) {
    return lastUserMessage.content.trim()
  }

  return messages
    .map(message => message.content.trim())
    .filter(Boolean)
    .slice(-3)
    .join('\n\n')
}

async function buildMessagesWithExternalWebSearch(input: {
  messages: ChatMessage[]
  searchConfig?: SearchConfigInput
  webSearch: boolean
}): Promise<ChatMessage[]> {
  if (!input.webSearch) {
    return input.messages
  }

  const searchProvider = input.searchConfig?.provider || 'tavily'
  const searchApiKey = String(input.searchConfig?.apiKey || '').trim()

  if (searchProvider !== 'tavily' || !searchApiKey) {
    throw new Error(
      [
        'Real-time web search is required for this request, but Tavily is not configured yet.',
        'Run `wl setup --section ai` or `wl config set search.apiKey <key>` and `wl config set search.provider tavily` first.',
      ].join(' '),
    )
  }

  const query = buildWebSearchQuery(input.messages)
  const searchResponse = await searchWithTavily({
    apiKey: searchApiKey,
    query,
  })
  const contextMessage: ChatMessage = {
    content: buildTavilySearchContext({response: searchResponse}),
    role: 'system',
  }
  const systemMessages = input.messages.filter(message => message.role === 'system')
  const nonSystemMessages = input.messages.filter(message => message.role !== 'system')

  return [
    ...systemMessages,
    contextMessage,
    ...nonSystemMessages,
  ]
}

function buildRequestBody(config: ResolvedModelConfig, messages: ChatMessage[], webSearch: boolean, stream: boolean) {
  const baseBody: Record<string, unknown> = {
    messages,
    model: config.apiModel,
    stream,
    temperature: 0.7,
  }
  Object.assign(baseBody, {'max_tokens': config.maxTokens})

  if (config.provider === 'KIMI' && webSearch) {
    baseBody.tools = [
      {
        function: {
          description: 'Search the web for the latest information',
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
      stream,
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

  throw new Error('The AI response did not contain usable content')
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

  throw new Error('The Ollama response did not contain usable content')
}

function parseOpenAiLikeDelta(payload: OpenAiLikeStreamPayload): string {
  const choice = payload.choices?.[0]
  const content = choice?.delta?.content ?? choice?.message?.content

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part
        if (typeof part?.text === 'string') return part.text
        return ''
      })
      .join('')
  }

  return ''
}

function parseOllamaDelta(payload: OllamaStreamPayload): string {
  return String(payload.message?.content ?? payload.response ?? '')
}

async function streamOpenAiLikeResponse(input: {
  onToken?: (token: string) => void
  response: Response
}): Promise<string> {
  if (!input.response.body) {
    throw new Error('The AI streaming response was empty')
  }

  const decoder = new TextDecoder()
  const reader = input.response.body.getReader()
  let buffer = ''
  let fullText = ''

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const {done, value} = await reader.read()
    if (done) break

    buffer += decoder.decode(value, {stream: true})
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const event of events) {
      const dataLines = event
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())

      for (const line of dataLines) {
        if (!line || line === '[DONE]') continue

        let payload: OpenAiLikeStreamPayload

        try {
          payload = JSON.parse(line) as OpenAiLikeStreamPayload
        } catch {
          continue
        }

        const token = parseOpenAiLikeDelta(payload)
        if (!token) continue
        fullText += token
        input.onToken?.(token)
      }
    }
  }

  if (buffer.trim()) {
    const lines = buffer.split('\n').filter(line => line.startsWith('data:'))
    for (const rawLine of lines) {
      const line = rawLine.slice(5).trim()
      if (!line || line === '[DONE]') continue
      try {
        const payload = JSON.parse(line) as OpenAiLikeStreamPayload
        const token = parseOpenAiLikeDelta(payload)
        if (!token) continue
        fullText += token
        input.onToken?.(token)
      } catch {
        continue
      }
    }
  }

  return fullText.trim()
}

async function streamOllamaResponse(input: {
  onToken?: (token: string) => void
  response: Response
}): Promise<string> {
  if (!input.response.body) {
    throw new Error('The Ollama streaming response was empty')
  }

  const decoder = new TextDecoder()
  const reader = input.response.body.getReader()
  let buffer = ''
  let fullText = ''

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const {done, value} = await reader.read()
    if (done) break

    buffer += decoder.decode(value, {stream: true})
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let payload: OllamaStreamPayload

      try {
        payload = JSON.parse(trimmed) as OllamaStreamPayload
      } catch {
        continue
      }

      const token = parseOllamaDelta(payload)
      if (!token) continue
      fullText += token
      input.onToken?.(token)
    }
  }

  if (buffer.trim()) {
    try {
      const payload = JSON.parse(buffer.trim()) as OllamaStreamPayload
      const token = parseOllamaDelta(payload)
      if (token) {
        fullText += token
        input.onToken?.(token)
      }
    } catch {
      // ignore trailing partial chunk
    }
  }

  return fullText.trim()
}

export async function runAiChat(input: {
  localApiKey?: string
  messages: ChatMessage[]
  model: string
  onToken?: (token: string) => void
  searchConfig?: SearchConfigInput
  stream?: boolean
  webSearch?: boolean
}): Promise<string> {
  const config = await resolveModelConfig(input.model, input.localApiKey)
  const useStream = Boolean(input.stream && input.onToken)
  const messages = await buildMessagesWithExternalWebSearch({
    messages: input.messages,
    searchConfig: input.searchConfig,
    webSearch: Boolean(input.webSearch),
  })
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (config.provider !== 'OLLAMA') {
    headers.Authorization = `Bearer ${config.apiKey}`
  }

  const response = await fetch(buildApiUrl(config), {
    body: JSON.stringify(buildRequestBody(config, messages, false, useStream)),
    headers,
    method: 'POST',
    signal: AbortSignal.timeout(180_000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `AI request failed (${response.status})`)
  }

  if (useStream) {
    return config.provider === 'OLLAMA'
      ? streamOllamaResponse({onToken: input.onToken, response})
      : streamOpenAiLikeResponse({onToken: input.onToken, response})
  }

  const text = await response.text()

  let payload: unknown

  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(text || 'Failed to parse the AI response')
  }

  return config.provider === 'OLLAMA'
    ? parseOllamaText(payload)
    : parseOpenAiLikeText(payload)
}
