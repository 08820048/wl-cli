import {Flags} from '@oclif/core'

import BaseCommand from '../../base-command.js'
import {formatThemeLabel, THEMES} from '../../lib/theme/catalog.js'

export default class ThemeList extends BaseCommand {
  static description = '查看内置主题目录'
  static enableJsonFlag = true
  static flags = {
    limit: Flags.integer({description: '限制显示数量'}),
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
