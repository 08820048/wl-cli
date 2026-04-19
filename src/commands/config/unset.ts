import {Args} from '@oclif/core'

import BaseCommand from '../../base-command.js'
import {isConfigKey, unsetConfigValue} from '../../lib/config/keys.js'
import {loadDraftAppConfig, saveDraftAppConfig} from '../../lib/config/store.js'

export default class ConfigUnset extends BaseCommand {
  static args = {
    key: Args.string({description: 'Configuration key to remove', required: true}),
  }
  static description = 'Remove a saved CLI configuration value'
  static enableJsonFlag = true
  static requiresAuth = false
  static requiresSetup = false

  async run(): Promise<Record<string, unknown> | void> {
    const {args} = await this.parse(ConfigUnset)
    if (!isConfigKey(args.key)) {
      this.error(`Unsupported config key '${args.key}'. Run \`wl config list\` to see supported keys.`)
    }

    const current = await loadDraftAppConfig(this.config.configDir)
    const next = unsetConfigValue(current, args.key)
    await saveDraftAppConfig(this.config.configDir, next)

    const result = {key: args.key, removed: true}

    if (this.jsonEnabled()) return result
    this.log(`Removed ${args.key}`)
  }
}
