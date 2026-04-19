import BaseCommand from '../../base-command.js'
import {getAppConfigFilePath, getAuthFilePath} from '../../lib/config/paths.js'

export default class ConfigPath extends BaseCommand {
  static description = 'Show the local configuration file paths'
  static enableJsonFlag = true
  static requiresAuth = false
  static requiresSetup = false

  async run(): Promise<Record<string, string> | void> {
    const result = {
      authFile: getAuthFilePath(this.config.configDir),
      configDir: this.config.configDir,
      configFile: getAppConfigFilePath(this.config.configDir),
    }

    if (this.jsonEnabled()) return result

    this.log(`configDir:  ${result.configDir}`)
    this.log(`configFile: ${result.configFile}`)
    this.log(`authFile:   ${result.authFile}`)
  }
}
