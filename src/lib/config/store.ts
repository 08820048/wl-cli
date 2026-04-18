import fs from 'node:fs'
import fsp from 'node:fs/promises'

import type {AppConfigInput, SavedAppConfig} from './types.js'

import {modelRequiresApiKey} from '../ai/api-client.js'
import {getAppConfigFilePath} from './paths.js'

function normalizeSavedAppConfig(raw: unknown): null | SavedAppConfig {
  if (!raw || typeof raw !== 'object') return null

  const value = raw as Partial<SavedAppConfig>
  const aiModel = String(value.ai?.defaultModel || '').trim()
  const aiApiKey = String(value.ai?.apiKey || '').trim()
  const imageModel = String(value.ai?.image?.defaultModel || '').trim()
  const imageApiKey = String(value.ai?.image?.apiKey || '').trim()
  const imageEndpoint = String(value.ai?.image?.endpoint || '').trim()
  const imageSize = String(value.ai?.image?.defaultSize || '').trim()
  const appId = String(value.wechat?.appId || '').trim()
  const appSecret = String(value.wechat?.appSecret || '').trim()
  const proxyOrigin = String(value.wechat?.proxyOrigin || '').trim()
  const setupCompletedAt = String(value.setupCompletedAt || '').trim()
  const updatedAt = String(value.updatedAt || '').trim()
  const requiresAiApiKey = aiModel ? modelRequiresApiKey(aiModel) : false

  if (!aiModel || !appId || !appSecret || (requiresAiApiKey && !aiApiKey)) return null

  return {
    ai: {
      apiKey: aiApiKey || undefined,
      defaultModel: aiModel,
      image: imageModel || imageApiKey || imageEndpoint || imageSize
        ? {
            apiKey: imageApiKey || undefined,
            defaultModel: imageModel || undefined,
            defaultSize: imageSize || undefined,
            endpoint: imageEndpoint || undefined,
          }
        : undefined,
    },
    setupCompletedAt: setupCompletedAt || updatedAt || new Date().toISOString(),
    updatedAt: updatedAt || setupCompletedAt || new Date().toISOString(),
    wechat: {
      appId,
      appSecret,
      proxyOrigin: proxyOrigin || undefined,
    },
  }
}

export function isSetupComplete(config: null | SavedAppConfig): config is SavedAppConfig {
  return config !== null
}

export async function loadSavedAppConfig(configDir: string): Promise<null | SavedAppConfig> {
  try {
    const raw = await fsp.readFile(getAppConfigFilePath(configDir), 'utf8')
    return normalizeSavedAppConfig(JSON.parse(raw))
  } catch {
    return null
  }
}

export function loadSavedAppConfigSync(configDir: string): null | SavedAppConfig {
  try {
    const raw = fs.readFileSync(getAppConfigFilePath(configDir), 'utf8')
    return normalizeSavedAppConfig(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function saveAppConfig(configDir: string, config: AppConfigInput): Promise<SavedAppConfig> {
  const now = new Date().toISOString()
  const payload: SavedAppConfig = {
    ai: {
      apiKey: String(config.ai.apiKey || '').trim() || undefined,
      defaultModel: String(config.ai.defaultModel || '').trim(),
      image: config.ai.image
        ? {
            apiKey: String(config.ai.image.apiKey || '').trim() || undefined,
            defaultModel: String(config.ai.image.defaultModel || '').trim() || undefined,
            defaultSize: String(config.ai.image.defaultSize || '').trim() || undefined,
            endpoint: String(config.ai.image.endpoint || '').trim() || undefined,
          }
        : undefined,
    },
    setupCompletedAt: now,
    updatedAt: now,
    wechat: {
      appId: String(config.wechat.appId || '').trim(),
      appSecret: String(config.wechat.appSecret || '').trim(),
      proxyOrigin: String(config.wechat.proxyOrigin || '').trim() || undefined,
    },
  }

  await fsp.mkdir(configDir, {recursive: true})
  await fsp.writeFile(getAppConfigFilePath(configDir), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  return payload
}
