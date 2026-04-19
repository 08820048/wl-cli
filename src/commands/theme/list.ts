import {Flags} from '@oclif/core'

import BaseCommand from '../../base-command.js'
import {formatThemeLabel, THEMES} from '../../lib/theme/catalog.js'

export default class ThemeList extends BaseCommand {
  static description = 'List built-in themes'
  static enableJsonFlag = true
  static flags = {
    limit: Flags.integer({description: 'Limit the number of themes shown'}),
  }

  async run(): Promise<void | {themes: typeof THEMES}> {
    const {flags} = await this.parse(ThemeList)
    const themes = typeof flags.limit === 'number' ? THEMES.slice(0, flags.limit) : THEMES

    if (this.jsonEnabled()) return {themes}

    for (const theme of themes) {
      this.log(formatThemeLabel(theme))
    }
  }
}
