import {Flags} from '@oclif/core'

import BaseCommand from '../base-command.js'
import {runSetupWizard} from '../lib/setup/wizard.js'

export default class Setup extends BaseCommand {
  static description = '通过引导完成或重新执行 CLI 初始化配置'
  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]
  static flags = {
    section: Flags.string({
      description: '只重新配置某个阶段',
      options: ['all', 'ai', 'license', 'wechat'],
    }),
  }
  static requiresAuth = false
  static requiresSetup = false

  async run(): Promise<void> {
    try {
      const {flags} = await this.parse(Setup)
      await runSetupWizard({
        configDir: this.config.configDir,
        log: message => this.log(message),
        section: flags.section as 'ai' | 'all' | 'license' | 'wechat' | undefined,
      })
    } catch (error) {
      const errorName = typeof error === 'object' && error && 'name' in error
        ? String((error as {name?: unknown}).name || '')
        : ''

      if (errorName === 'ExitPromptError') {
        this.log('已取消初始化向导。')
        return
      }

      throw error
    }
  }
}
