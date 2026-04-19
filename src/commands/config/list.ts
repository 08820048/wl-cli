import {Flags} from '@oclif/core'

import BaseCommand from '../../base-command.js'
import {flattenConfigValues} from '../../lib/config/keys.js'
import {loadDraftAppConfig, loadSavedAppConfig} from '../../lib/config/store.js'

export default class ConfigList extends BaseCommand {
  static description = 'List the current CLI configuration values'
  static enableJsonFlag = true
  static flags = {
    'show-secrets': Flags.boolean({description: 'Print secret values without masking'}),
  }
  static requiresAuth = false
  static requiresSetup = false

  async run(): Promise<Record<string, unknown> | void> {
    const {flags} = await this.parse(ConfigList)
    const [draftConfig, savedConfig] = await Promise.all([
      loadDraftAppConfig(this.config.configDir),
      loadSavedAppConfig(this.config.configDir),
    ])
    const values = flattenConfigValues(draftConfig, {showSecrets: flags['show-secrets']})
    const result = {
      configFile: `${this.config.configDir}/config.json`,
      configuredKeys: values.filter(item => item.value).length,
      isSetupComplete: Boolean(savedConfig),
      values,
    }

    if (this.jsonEnabled()) return result

    if (result.configuredKeys === 0) {
      this.log('No application configuration has been saved yet.')
      this.log('Run `wl setup` or use `wl config set <key> <value>` to start configuring the CLI.')
      return
    }

    this.log(`Config file: ${result.configFile}`)
    this.log(`Setup complete: ${result.isSetupComplete ? 'yes' : 'no'}`)
    for (const item of values) {
      this.log(`${item.key}: ${item.value || '(not set)'}`)
    }
  }
}
