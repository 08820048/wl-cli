export interface SavedCredentials {
  customerEmail: string
  deviceFingerprint?: string
  licenseKey: string
  savedAt: string
}

export interface LicenseActivation {
  [key: string]: unknown
  deviceFingerprint?: string
  isCurrentDevice?: boolean
  status?: string
}

export interface LicenseDetails {
  currentActivations?: number
  deviceActivations?: LicenseActivation[]
  deviceFingerprint: string
  deviceName: string
  expiredAt?: null | string
  isActive: boolean
  maxActivations?: number
  message?: string
  permanent?: boolean
  productCode?: string
  remainingActivations?: number
  status: string
}

export interface LicenseCheckResult {
  details: LicenseDetails
  message: string
  state: 'active' | 'inactive' | 'invalid'
}
