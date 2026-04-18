import type {LayoutMode} from '../article/types.js'

import {runAiChat} from './api-client.js'
import {buildArticleCreationMessages, buildArticleLayoutMessages} from './prompts.js'

const DEFAULT_AI_MODEL = 'qwen3-max'

export async function createArticleMarkdown(input: {
  localApiKey?: string
  model?: string
  prompt: string
  webSearch?: boolean
}): Promise<string> {
  return runAiChat({
    localApiKey: input.localApiKey,
    messages: buildArticleCreationMessages(input.prompt),
    model: input.model || DEFAULT_AI_MODEL,
    webSearch: input.webSearch,
  })
}

export async function layoutArticleMarkdown(input: {
  localApiKey?: string
  markdown: string
  mode: LayoutMode
  model?: string
}): Promise<string> {
  return runAiChat({
    localApiKey: input.localApiKey,
    messages: buildArticleLayoutMessages(input.markdown, input.mode),
    model: input.model || DEFAULT_AI_MODEL,
  })
}
