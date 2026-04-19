import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'

function parseWindowsDiskSerial(raw: string): null | string {
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('SerialNumber=')) {
      const value = trimmed.slice('SerialNumber='.length).trim()
      if (value) return value
    }
  }

  return null
}

function readDiskSerial(): null | string {
  try {
    switch (process.platform) {
      case 'darwin': {
        const stdout = execFileSync('system_profiler', ['SPStorageDataType'], {encoding: 'utf8'})
        const match = stdout.match(/Serial Number:\s*(.+)/)
        return match?.[1]?.trim() || null
      }

      case 'linux': {
        const stdout = execFileSync('lsblk', ['-o', 'NAME,SERIAL'], {encoding: 'utf8'})

        for (const line of stdout.split(/\r?\n/)) {
          const parts = line.trim().split(/\s+/)
          if (parts.length >= 2 && parts[1] !== '-') return parts[1]
        }

        return null
      }

      case 'win32': {
        const stdout = execFileSync(
          'wmic',
          ['diskdrive', 'where', String.raw`DeviceID='\\\\.\\PHYSICALDRIVE0'`, 'get', 'SerialNumber', '/value'],
          {encoding: 'utf8'},
        )

        return parseWindowsDiskSerial(stdout)
      }

      default: {
        return null
      }
    }
  } catch {
    return null
  }
}

export function getDeviceFingerprint(): string {
  const source = readDiskSerial()
    || `${process.env.COMPUTERNAME || process.env.HOSTNAME || 'unknown-host'}-${process.env.USERNAME || process.env.USER || 'unknown-user'}`

  return createHash('sha256').update(source).digest('hex').toUpperCase().slice(0, 32)
}

export function getDeviceName(): string {
  switch (process.platform) {
    case 'darwin': {
      return 'User Mac device'
    }

    case 'linux': {
      return 'User Linux device'
    }

    case 'win32': {
      return 'User Windows device'
    }

    default: {
      return `User ${process.platform} device`
    }
  }
}
