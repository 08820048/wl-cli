export interface AppConfigInput {
  ai: {
    apiKey?: string
    defaultModel: string
    image?: {
      apiKey?: string
      defaultModel?: string
      defaultSize?: string
      endpoint?: string
    }
  }
  wechat: {
    appId: string
    appSecret: string
    proxyOrigin?: string
  }
}

export interface AppConfigDraft {
  ai?: {
    apiKey?: string
    defaultModel?: string
    image?: {
      apiKey?: string
      defaultModel?: string
      defaultSize?: string
      endpoint?: string
    }
  }
  setupCompletedAt?: string
  updatedAt?: string
  wechat?: {
    appId?: string
    appSecret?: string
    proxyOrigin?: string
  }
}

export interface SavedAppConfig extends AppConfigInput {
  setupCompletedAt: string
  updatedAt: string
}
