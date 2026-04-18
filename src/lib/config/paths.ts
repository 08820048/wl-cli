import path from 'node:path'

export function getAuthFilePath(configDir: string): string {
  return path.join(configDir, 'auth.json')
}
