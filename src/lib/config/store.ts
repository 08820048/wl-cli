import fs from 'node:fs'
import fsp from 'node:fs/promises'

import type {AppConfigDraft, AppConfigInput, SavedAppConfig} from './types.js'

import {modelRequiresApiKey} from '../ai/api-client.js'
import {getAppConfigFilePath} from './paths.js'

function normalizeDraftAppConfig(raw: unknown): AppConfigDraft {
  if (!raw || typeof raw !== 'object') return {}

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

  return {
    ai: aiModel || aiApiKey || imageModel || imageApiKey || imageEndpoint || imageSize
      ? {
          apiKey: aiApiKey || undefined,
          defaultModel: aiModel || undefined,
          image: imageModel || imageApiKey || imageEndpoint || imageSize
            ? {
                apiKey: imageApiKey || undefined,
                defaultModel: imageModel || undefined,
                defaultSize: imageSize || undefined,
                endpoint: imageEndpoint || undefined,
              }
            : undefined,
        }
      : undefined,
    setupCompletedAt: setupCompletedAt || undefined,
    updatedAt: updatedAt || undefined,
    wechat: appId || appSecret || proxyOrigin
      ? {
          appId: appId || undefined,
          appSecret: appSecret || undefined,
          proxyOrigin: proxyOrigin || undefined,
        }
      : undefined,
  }
}

function normalizeSavedAppConfig(raw: unknown): null | SavedAppConfig {
  const value = normalizeDraftAppConfig(raw)
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

export async function loadDraftAppConfig(configDir: string): Promise<AppConfigDraft> {
  try {
    const raw = await fsp.readFile(getAppConfigFilePath(configDir), 'utf8')
    return normalizeDraftAppConfig(JSON.parse(raw))
  } catch {
    return {}
  }
}

export function loadDraftAppConfigSync(configDir: string): AppConfigDraft {
  try {
    const raw = fs.readFileSync(getAppConfigFilePath(configDir), 'utf8')
    return normalizeDraftAppConfig(JSON.parse(raw))
  } catch {
    return {}
  }
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

export async function saveDraftAppConfig(configDir: string, config: AppConfigDraft): Promise<AppConfigDraft> {
  const now = new Date().toISOString()
  const normalized = normalizeDraftAppConfig(config)
  const candidateSetupTimestamp = normalized.setupCompletedAt || now
  const payload: AppConfigDraft = {
    ai: normalized.ai,
    setupCompletedAt: normalized.setupCompletedAt,
    updatedAt: now,
    wechat: normalized.wechat,
  }

  if (!payload.setupCompletedAt && normalizeSavedAppConfig({...normalized, setupCompletedAt: candidateSetupTimestamp, updatedAt: now})) {
    payload.setupCompletedAt = now
  }

  await fsp.mkdir(configDir, {recursive: true})
  await fsp.writeFile(getAppConfigFilePath(configDir), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  return payload
}

export async function saveAppConfig(configDir: string, config: AppConfigInput): Promise<SavedAppConfig> {
  await saveDraftAppConfig(configDir, config)
  const saved = await loadSavedAppConfig(configDir)

  if (!saved) {
    throw new Error('The saved configuration is incomplete after writing config.json')
  }

  return saved
}
