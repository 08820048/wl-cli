import {Flags} from '@oclif/core'

import BaseCommand from '../base-command.js'
import {loadSavedCredentials} from '../lib/auth/auth-store.js'
import {getDeviceFingerprint} from '../lib/auth/fingerprint.js'
import {getAuthFilePath} from '../lib/config/paths.js'

export default class Doctor extends BaseCommand {
  static description = '检查 CLI 的本地环境和关键路径'
  static enableJsonFlag = true
  static flags = {
    verbose: Flags.boolean({char: 'v', description: '显示更多环境信息'}),
  }
  static requiresAuth = false

  async run(): Promise<Record<string, unknown> | void> {
    const {flags} = await this.parse(Doctor)
    const credentials = await loadSavedCredentials(this.config.configDir)
    const result = {
      authFile: getAuthFilePath(this.config.configDir),
      configDir: this.config.configDir,
      dataDir: this.config.dataDir,
      deviceFingerprint: getDeviceFingerprint(),
      loggedIn: Boolean(credentials),
      nodeVersion: process.version,
      platform: process.platform,
      root: this.config.root,
      shell: this.config.shell,
    }

    if (this.jsonEnabled()) return result

    this.log(`configDir: ${result.configDir}`)
    this.log(`dataDir:   ${result.dataDir}`)
    this.log(`authFile:  ${result.authFile}`)
    this.log(`platform:  ${result.platform}`)
    this.log(`node:      ${result.nodeVersion}`)
    this.log(`loggedIn:  ${result.loggedIn ? 'yes' : 'no'}`)
    this.log(`fingerprint: ${result.deviceFingerprint}`)

    if (flags.verbose) {
      this.log(`root: ${result.root}`)
      this.log(`shell: ${result.shell}`)
    }
  }
}
