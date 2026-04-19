import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../base-command.js'
import {getConfigKeyDefinition, getConfigValue, isConfigKey, maskConfigValue} from '../../lib/config/keys.js'
import {loadDraftAppConfig} from '../../lib/config/store.js'

export default class ConfigGet extends BaseCommand {
  static args = {
    key: Args.string({description: 'Configuration key to read', required: true}),
  }
  static description = 'Read a single CLI configuration value'
  static enableJsonFlag = true
  static flags = {
    'show-secrets': Flags.boolean({description: 'Print secret values without masking'}),
  }
  static requiresAuth = false
  static requiresSetup = false

  async run(): Promise<Record<string, unknown> | void> {
    const {args, flags} = await this.parse(ConfigGet)
    if (!isConfigKey(args.key)) {
      this.error(`Unsupported config key '${args.key}'. Run \`wl config list\` to see supported keys.`)
    }

    const config = await loadDraftAppConfig(this.config.configDir)
    const definition = getConfigKeyDefinition(args.key)
    const rawValue = getConfigValue(config, args.key)
    const displayValue = rawValue && definition?.isSecret && !flags['show-secrets']
      ? maskConfigValue(rawValue)
      : rawValue
    const result = {
      found: Boolean(rawValue),
      key: args.key,
      value: displayValue || null,
    }

    if (this.jsonEnabled()) return result
    if (!rawValue) this.error(`No value is currently set for '${args.key}'.`)
    this.log(String(displayValue))
  }
}
