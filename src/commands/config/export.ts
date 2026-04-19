import {Flags} from '@oclif/core'
import fsp from 'node:fs/promises'

import BaseCommand from '../../base-command.js'
import {loadDraftAppConfig} from '../../lib/config/store.js'

export default class ConfigExport extends BaseCommand {
  static description = 'Export the current CLI application configuration'
  static enableJsonFlag = true
  static flags = {
    output: Flags.string({char: 'o', description: 'Write the exported config to a file instead of stdout'}),
  }
  static requiresAuth = false
  static requiresSetup = false

  async run(): Promise<Record<string, unknown> | void> {
    const {flags} = await this.parse(ConfigExport)
    const config = await loadDraftAppConfig(this.config.configDir)
    const serialized = `${JSON.stringify(config, null, 2)}\n`

    if (flags.output) {
      await fsp.writeFile(flags.output, serialized, 'utf8')
      const result = {output: flags.output, written: true}
      if (this.jsonEnabled()) return result
      this.log(`Exported configuration to ${flags.output}`)
      return
    }

    if (this.jsonEnabled()) return config as Record<string, unknown>
    this.log(serialized.trimEnd())
  }
}
