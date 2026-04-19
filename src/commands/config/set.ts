import {Args} from '@oclif/core'

import BaseCommand from '../../base-command.js'
import {getConfigKeyDefinition, isConfigKey, maskConfigValue, setConfigValue} from '../../lib/config/keys.js'
import {loadDraftAppConfig, saveDraftAppConfig} from '../../lib/config/store.js'

export default class ConfigSet extends BaseCommand {
  static args = {
    key: Args.string({description: 'Configuration key to update', required: true}),
    value: Args.string({description: 'Value to save', required: true}),
  }
  static description = 'Set a CLI configuration value'
  static enableJsonFlag = true
  static requiresAuth = false
  static requiresSetup = false

  async run(): Promise<Record<string, unknown> | void> {
    const {args} = await this.parse(ConfigSet)
    if (!isConfigKey(args.key)) {
      this.error(`Unsupported config key '${args.key}'. Run \`wl config list\` to see supported keys.`)
    }

    const current = await loadDraftAppConfig(this.config.configDir)
    const next = setConfigValue(current, args.key, args.value)
    await saveDraftAppConfig(this.config.configDir, next)

    const definition = getConfigKeyDefinition(args.key)
    const displayValue = definition?.isSecret ? maskConfigValue(args.value.trim()) : args.value.trim()
    const result = {key: args.key, value: displayValue}

    if (this.jsonEnabled()) return result
    this.log(`Saved ${args.key} = ${displayValue}`)
  }
}
