import fs from 'node:fs'
import fsp from 'node:fs/promises'

import type {SavedCredentials} from './types.js'

import {getAuthFilePath} from '../config/paths.js'

function normalizeCredentials(raw: unknown): null | SavedCredentials {
  if (!raw || typeof raw !== 'object') return null

  const value = raw as Partial<SavedCredentials>
  const licenseKey = String(value.licenseKey || '').trim()
  const customerEmail = String(value.customerEmail || '').trim()
  const deviceFingerprint = String(value.deviceFingerprint || '').trim()
  const savedAt = String(value.savedAt || '').trim()

  if (!licenseKey || !customerEmail) return null

  return {
    customerEmail,
    deviceFingerprint: deviceFingerprint || undefined,
    licenseKey,
    savedAt: savedAt || new Date().toISOString(),
  }
}

export async function clearSavedCredentials(configDir: string): Promise<void> {
  await fsp.rm(getAuthFilePath(configDir), {force: true})
}

export async function loadSavedCredentials(configDir: string): Promise<null | SavedCredentials> {
  try {
    const raw = await fsp.readFile(getAuthFilePath(configDir), 'utf8')
    return normalizeCredentials(JSON.parse(raw))
  } catch {
    return null
  }
}

export function loadSavedCredentialsSync(configDir: string): null | SavedCredentials {
  try {
    const raw = fs.readFileSync(getAuthFilePath(configDir), 'utf8')
    return normalizeCredentials(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function saveCredentials(configDir: string, credentials: Omit<SavedCredentials, 'savedAt'>): Promise<SavedCredentials> {
  const payload: SavedCredentials = {
    ...credentials,
    savedAt: new Date().toISOString(),
  }

  await fsp.mkdir(configDir, {recursive: true})
  await fsp.writeFile(getAuthFilePath(configDir), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  return payload
}
