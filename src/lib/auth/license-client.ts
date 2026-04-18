import {fetch} from 'undici'

import type {LicenseCheckResult, SavedCredentials} from './types.js'

import {getDeviceFingerprint, getDeviceName} from './fingerprint.js'

const LICENSE_API_BASE_URL = 'https://ilikexff.cn/api'
const CLIENT_INFO = 'WeLight CLI'

export const PURCHASE_URL = 'https://waer.ltd'
export const LICENSE_SERVICE_UNAVAILABLE_MESSAGE = '无法连接许可证服务，请检查网络后重试。'

interface LicenseApiResponse {
  code?: number
  data?: {
    license?: {
      currentActivations?: number
      deviceActivations?: Array<Record<string, unknown>>
      expiredAt?: null | string
      maxActivations?: number
      permanent?: boolean
      productCode?: string
      remainingActivations?: number
      status?: string
    }
    valid?: boolean
  }
  message?: string
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  let response: Awaited<ReturnType<typeof fetch>>

  try {
    response = await fetch(url, {
      body: JSON.stringify(payload),
      headers: {'Content-Type': 'application/json'},
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error(LICENSE_SERVICE_UNAVAILABLE_MESSAGE)
  }

  const text = await response.text()

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(text || `License API 请求失败 (${response.status})`)
  }
}

export function formatLicenseClientError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  return LICENSE_SERVICE_UNAVAILABLE_MESSAGE
}

function normalizeFailureMessage(message?: string): string {
  const text = String(message || '').trim()
  if (!text) return '许可证校验失败'

  if (
    text.includes('新设备需要激活')
    || text.includes('当前设备未激活')
    || text.includes('设备已被停用')
  ) {
    return '许可证有效，但当前设备未激活。请先打开 Welight 桌面版完成激活。'
  }

  if (
    text.includes('未找到')
    || text.includes('不存在')
    || text.includes('无效')
    || text.includes('失效')
    || text.includes('过期')
    || text.includes('撤销')
  ) {
    return `${text}\n\n如果你还没有购买许可证，请访问 ${PURCHASE_URL}`
  }

  return text
}

export async function validateLicenseStatus(credentials: Omit<SavedCredentials, 'savedAt'> | SavedCredentials): Promise<LicenseCheckResult> {
  const deviceFingerprint = getDeviceFingerprint()
  const deviceName = getDeviceName()
  const payload = {
    activate: false,
    clientInfo: CLIENT_INFO,
    customerEmail: credentials.customerEmail,
    deviceFingerprint,
    deviceName,
    licenseKey: credentials.licenseKey,
  }

  const data = await postJson<LicenseApiResponse>(`${LICENSE_API_BASE_URL}/licenses/validate`, payload)

  if (
    data.code === 500
    && (
      String(data.message || '').includes('设备已被停用')
      || String(data.message || '').includes('新设备需要激活')
      || String(data.message || '').includes('当前设备未激活')
    )
  ) {
    return {
      details: {
        deviceFingerprint,
        deviceName,
        isActive: false,
        message: String(data.message || '').trim(),
        status: 'INACTIVE',
      },
      message: '许可证有效，但当前设备未激活。请先打开 Welight 桌面版完成激活。',
      state: 'inactive',
    }
  }

  if (data.code === 200 && data.data?.valid) {
    const license = data.data.license || {}
    const activations = (license.deviceActivations || []) as Array<Record<string, unknown>>
    const currentDevice = activations.find(item => item.deviceFingerprint === deviceFingerprint && item.isCurrentDevice)
    const currentDeviceStatus = currentDevice ? String(currentDevice.status || '').toUpperCase() : 'INACTIVE'
    const active = currentDeviceStatus === 'ACTIVE'

    return {
      details: {
        currentActivations: license.currentActivations,
        deviceActivations: activations,
        deviceFingerprint,
        deviceName,
        expiredAt: license.expiredAt,
        isActive: active,
        maxActivations: license.maxActivations,
        permanent: Boolean(license.permanent),
        productCode: license.productCode,
        remainingActivations: license.remainingActivations,
        status: active ? 'ACTIVE' : 'INACTIVE',
      },
      message: active
        ? '许可证正常，当前设备已激活。'
        : '许可证有效，但当前设备未激活。请先打开 Welight 桌面版完成激活。',
      state: active ? 'active' : 'inactive',
    }
  }

  return {
    details: {
      deviceFingerprint,
      deviceName,
      isActive: false,
      message: normalizeFailureMessage(data.message),
      status: 'INVALID',
    },
    message: normalizeFailureMessage(data.message),
    state: 'invalid',
  }
}
