import type {AppConfigDraft} from './types.js'

export interface ConfigKeyDefinition {
  description: string
  isSecret?: boolean
  key: ConfigKey
}

export type ConfigKey =
  | 'ai.apiKey'
  | 'ai.defaultModel'
  | 'ai.image.apiKey'
  | 'ai.image.defaultModel'
  | 'ai.image.defaultSize'
  | 'ai.image.endpoint'
  | 'wechat.appId'
  | 'wechat.appSecret'
  | 'wechat.proxyOrigin'

export const CONFIG_KEYS: readonly ConfigKeyDefinition[] = [
  {description: 'Default text AI model', key: 'ai.defaultModel'},
  {description: 'Text AI API key', isSecret: true, key: 'ai.apiKey'},
  {description: 'Default image model', key: 'ai.image.defaultModel'},
  {description: 'Image model API key', isSecret: true, key: 'ai.image.apiKey'},
  {description: 'Image model endpoint', key: 'ai.image.endpoint'},
  {description: 'Default image size', key: 'ai.image.defaultSize'},
  {description: 'WeChat AppID', key: 'wechat.appId'},
  {description: 'WeChat AppSecret', isSecret: true, key: 'wechat.appSecret'},
  {description: 'WeChat proxy origin', key: 'wechat.proxyOrigin'},
] as const

export function getConfigKeyDefinition(key: string): ConfigKeyDefinition | undefined {
  return CONFIG_KEYS.find(item => item.key === key)
}

export function isConfigKey(key: string): key is ConfigKey {
  return Boolean(getConfigKeyDefinition(key))
}

export function maskConfigValue(value: string): string {
  if (!value) return value
  if (value.length <= 8) return '*'.repeat(Math.max(4, value.length))
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`
}

export function getConfigValue(config: AppConfigDraft, key: ConfigKey): string | undefined {
  switch (key) {
    case 'ai.apiKey': {
      return config.ai?.apiKey
    }

    case 'ai.defaultModel': {
      return config.ai?.defaultModel
    }

    case 'ai.image.apiKey': {
      return config.ai?.image?.apiKey
    }

    case 'ai.image.defaultModel': {
      return config.ai?.image?.defaultModel
    }

    case 'ai.image.defaultSize': {
      return config.ai?.image?.defaultSize
    }

    case 'ai.image.endpoint': {
      return config.ai?.image?.endpoint
    }

    case 'wechat.appId': {
      return config.wechat?.appId
    }

    case 'wechat.appSecret': {
      return config.wechat?.appSecret
    }

    case 'wechat.proxyOrigin': {
      return config.wechat?.proxyOrigin
    }
  }
}

export function setConfigValue(config: AppConfigDraft, key: ConfigKey, value: string): AppConfigDraft {
  const trimmedValue = value.trim()

  switch (key) {
    case 'ai.apiKey': {
      return {
        ...config,
        ai: {
          ...config.ai,
          apiKey: trimmedValue,
        },
      }
    }

    case 'ai.defaultModel': {
      return {
        ...config,
        ai: {
          ...config.ai,
          defaultModel: trimmedValue,
        },
      }
    }

    case 'ai.image.apiKey': {
      return {
        ...config,
        ai: {
          ...config.ai,
          image: {
            ...config.ai?.image,
            apiKey: trimmedValue,
          },
        },
      }
    }

    case 'ai.image.defaultModel': {
      return {
        ...config,
        ai: {
          ...config.ai,
          image: {
            ...config.ai?.image,
            defaultModel: trimmedValue,
          },
        },
      }
    }

    case 'ai.image.defaultSize': {
      return {
        ...config,
        ai: {
          ...config.ai,
          image: {
            ...config.ai?.image,
            defaultSize: trimmedValue,
          },
        },
      }
    }

    case 'ai.image.endpoint': {
      return {
        ...config,
        ai: {
          ...config.ai,
          image: {
            ...config.ai?.image,
            endpoint: trimmedValue,
          },
        },
      }
    }

    case 'wechat.appId': {
      return {
        ...config,
        wechat: {
          ...config.wechat,
          appId: trimmedValue,
        },
      }
    }

    case 'wechat.appSecret': {
      return {
        ...config,
        wechat: {
          ...config.wechat,
          appSecret: trimmedValue,
        },
      }
    }

    case 'wechat.proxyOrigin': {
      return {
        ...config,
        wechat: {
          ...config.wechat,
          proxyOrigin: trimmedValue,
        },
      }
    }
  }

  return config
}

export function unsetConfigValue(config: AppConfigDraft, key: ConfigKey): AppConfigDraft {
  const next = structuredClone(config)

  switch (key) {
    case 'ai.apiKey': {
      if (next.ai) delete next.ai.apiKey
      break
    }

    case 'ai.defaultModel': {
      if (next.ai) delete next.ai.defaultModel
      break
    }

    case 'ai.image.apiKey': {
      if (next.ai?.image) delete next.ai.image.apiKey
      break
    }

    case 'ai.image.defaultModel': {
      if (next.ai?.image) delete next.ai.image.defaultModel
      break
    }

    case 'ai.image.defaultSize': {
      if (next.ai?.image) delete next.ai.image.defaultSize
      break
    }

    case 'ai.image.endpoint': {
      if (next.ai?.image) delete next.ai.image.endpoint
      break
    }

    case 'wechat.appId': {
      if (next.wechat) delete next.wechat.appId
      break
    }

    case 'wechat.appSecret': {
      if (next.wechat) delete next.wechat.appSecret
      break
    }

    case 'wechat.proxyOrigin': {
      if (next.wechat) delete next.wechat.proxyOrigin
      break
    }
  }

  if (next.ai?.image && Object.keys(next.ai.image).length === 0) delete next.ai.image
  if (next.ai && Object.keys(next.ai).length === 0) delete next.ai
  if (next.wechat && Object.keys(next.wechat).length === 0) delete next.wechat

  return next
}

export function flattenConfigValues(config: AppConfigDraft, options?: {showSecrets?: boolean}): Array<{
  description: string
  isSecret: boolean
  key: ConfigKey
  value: string | undefined
}> {
  return [...CONFIG_KEYS]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(definition => {
      const rawValue = getConfigValue(config, definition.key)
      return {
        description: definition.description,
        isSecret: Boolean(definition.isSecret),
        key: definition.key,
        value: rawValue && definition.isSecret && !options?.showSecrets ? maskConfigValue(rawValue) : rawValue,
      }
    })
}
