import {Args, Flags} from '@oclif/core'
import fsp from 'node:fs/promises'

import BaseCommand from '../../base-command.js'
import {loadDraftAppConfig, loadSavedAppConfig, saveDraftAppConfig} from '../../lib/config/store.js'

export default class ConfigImport extends BaseCommand {
  static args = {
    file: Args.string({description: 'JSON file to import', required: true}),
  }
  static description = 'Import CLI application configuration from a JSON file'
  static enableJsonFlag = true
  static flags = {
    merge: Flags.boolean({description: 'Merge the imported file with the current config instead of replacing it'}),
  }
  static requiresAuth = false
  static requiresSetup = false

  async run(): Promise<Record<string, unknown> | void> {
    const {args, flags} = await this.parse(ConfigImport)
    const importedRaw = await fsp.readFile(args.file, 'utf8')
    const imported = JSON.parse(importedRaw) as Record<string, unknown>
    const current = flags.merge ? await loadDraftAppConfig(this.config.configDir) : {}
    const next = flags.merge ? {
      ...current,
      ...imported,
      ai: {
        ...current.ai,
        ...(imported.ai as Record<string, unknown> | undefined),
        image: {
          ...current.ai?.image,
          ...((imported.ai as undefined | {image?: Record<string, unknown>})?.image),
        },
      },
      wechat: {
        ...current.wechat,
        ...(imported.wechat as Record<string, unknown> | undefined),
      },
    } : imported

    await saveDraftAppConfig(this.config.configDir, next)
    const savedConfig = await loadSavedAppConfig(this.config.configDir)
    const result = {
      file: args.file,
      merged: flags.merge,
      setupComplete: Boolean(savedConfig),
    }

    if (this.jsonEnabled()) return result
    this.log(`Imported configuration from ${args.file}`)
    this.log(`Setup complete: ${result.setupComplete ? 'yes' : 'no'}`)
  }
}
