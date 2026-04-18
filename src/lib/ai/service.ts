import type {LayoutMode} from '../article/types.js'

import {runAiChat} from './api-client.js'
import {buildArticleCreationMessages, buildArticleLayoutMessages} from './prompts.js'

const DEFAULT_AI_MODEL = 'qwen3-max'

export async function createArticleMarkdown(input: {
  localApiKey?: string
  model?: string
  onToken?: (token: string) => void
  prompt: string
  stream?: boolean
  webSearch?: boolean
}): Promise<string> {
  return runAiChat({
    localApiKey: input.localApiKey,
    messages: buildArticleCreationMessages(input.prompt),
    model: input.model || DEFAULT_AI_MODEL,
    onToken: input.onToken,
    stream: input.stream,
    webSearch: input.webSearch,
  })
}

export async function layoutArticleMarkdown(input: {
  localApiKey?: string
  markdown: string
  mode: LayoutMode
  model?: string
  onToken?: (token: string) => void
  stream?: boolean
}): Promise<string> {
  return runAiChat({
    localApiKey: input.localApiKey,
    messages: buildArticleLayoutMessages(input.markdown, input.mode),
    model: input.model || DEFAULT_AI_MODEL,
    onToken: input.onToken,
    stream: input.stream,
  })
}
