import {Flags} from '@oclif/core'

import BaseCommand from '../base-command.js'
import {loadSavedCredentials} from '../lib/auth/auth-store.js'
import {getDeviceFingerprint} from '../lib/auth/fingerprint.js'
import {getAuthFilePath} from '../lib/config/paths.js'
import {loadSavedAppConfig} from '../lib/config/store.js'

export default class Doctor extends BaseCommand {
  static description = 'Inspect the local CLI environment and key paths'
  static enableJsonFlag = true
  static flags = {
    verbose: Flags.boolean({char: 'v', description: 'Show more environment details'}),
  }
  static requiresAuth = false
  static requiresSetup = false

  async run(): Promise<Record<string, unknown> | void> {
    const {flags} = await this.parse(Doctor)
    const [credentials, appConfig] = await Promise.all([
      loadSavedCredentials(this.config.configDir),
      loadSavedAppConfig(this.config.configDir),
    ])
    const result = {
      aiImageKeyConfigured: Boolean(appConfig?.ai.image?.apiKey),
      aiImageModel: appConfig?.ai.image?.defaultModel || null,
      aiKeyConfigured: Boolean(appConfig?.ai.apiKey),
      authFile: getAuthFilePath(this.config.configDir),
      configDir: this.config.configDir,
      configFile: this.config.configDir ? `${this.config.configDir}/config.json` : '',
      dataDir: this.config.dataDir,
      defaultAiModel: appConfig?.ai.defaultModel || null,
      deviceFingerprint: getDeviceFingerprint(),
      isConfigured: Boolean(appConfig),
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
    this.log(`configFile:${result.configFile}`)
    this.log(`platform:  ${result.platform}`)
    this.log(`node:      ${result.nodeVersion}`)
    this.log(`loggedIn:  ${result.loggedIn ? 'yes' : 'no'}`)
    this.log(`configured:${result.isConfigured ? 'yes' : 'no'}`)
    if (result.defaultAiModel) this.log(`aiModel:   ${result.defaultAiModel}`)
    this.log(`aiKey:     ${result.aiKeyConfigured ? 'configured' : 'not configured'}`)
    if (result.aiImageModel) this.log(`coverModel:${result.aiImageModel}`)
    this.log(`coverKey:  ${result.aiImageKeyConfigured ? 'configured' : 'not configured'}`)
    this.log(`fingerprint: ${result.deviceFingerprint}`)

    if (flags.verbose) {
      this.log(`root: ${result.root}`)
      this.log(`shell: ${result.shell}`)
    }
  }
}
