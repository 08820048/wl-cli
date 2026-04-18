#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning

import {execute} from '@oclif/core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'wl')
  }

  return path.join(os.homedir(), '.config', 'wl')
}

function hasCompletedSetup() {
  const configDir = getConfigDir()
  const authFile = path.join(configDir, 'auth.json')
  const configFile = path.join(configDir, 'config.json')

  try {
    const auth = JSON.parse(fs.readFileSync(authFile, 'utf8'))
    const appConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'))

  const model = String(appConfig?.ai?.defaultModel || '').trim()
  const requiresAiApiKey = model !== 'ollama'
    && !(model.startsWith('llama') && !model.includes('qwen'))
    && !model.startsWith('mistral')
    && !(model.includes(':') && !model.startsWith('http'))

    return Boolean(
      String(auth?.licenseKey || '').trim()
      && String(auth?.customerEmail || '').trim()
      && model
      && (!requiresAiApiKey || String(appConfig?.ai?.apiKey || '').trim())
      && String(appConfig?.wechat?.appId || '').trim()
      && String(appConfig?.wechat?.appSecret || '').trim(),
    )
  } catch {
    return false
  }
}

if (process.argv.length <= 2 && !hasCompletedSetup()) {
  process.argv.push('setup')
}

await execute({development: true, dir: import.meta.url})
