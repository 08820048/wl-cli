import {Help} from '@oclif/core'
import boxen from 'boxen'
import chalk from 'chalk'

import {loadSavedCredentialsSync} from './lib/auth/auth-store.js'
import {renderLogo} from './lib/ui/banner.js'

function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  if (!name || !domain) return email
  if (name.length <= 2) return `${name[0]}***@${domain}`
  return `${name[0]}***${name.at(-1)}@${domain}`
}

export default class WlHelp extends Help {
  protected formatRoot(): string {
    const savedCredentials = loadSavedCredentialsSync(this.config.configDir)
    const authSummary = savedCredentials
      ? `已保存许可证：${maskEmail(savedCredentials.customerEmail)}`
      : '未保存许可证，请先运行 wl auth login'

    const intro = boxen(
      [
        chalk.bold('Welight CLI'),
        'Write. Layout. Theme. Publish to WeChat.',
        '',
        chalk.gray(authSummary),
      ].join('\n'),
      {
        borderColor: '#f4a261',
        padding: {bottom: 0, left: 1, right: 1, top: 0},
      },
    )

    const quickStart = [
      `${chalk.cyan('wl auth login')}      录入并检查许可证`,
      `${chalk.cyan('wl ai create')}       用 AI 创作公众号文章`,
      `${chalk.cyan('wl article compose')}  进入公众号文章工作流`,
      `${chalk.cyan('wl theme list')}      查看可用主题`,
      `${chalk.cyan('wl doctor')}          检查 CLI 环境`,
    ].join('\n')

    return [
      renderLogo(),
      intro,
      this.section('QUICK START', quickStart),
      this.section(
        'NOTES',
        [
          'CLI 只校验许可证，不负责设备激活。',
          '如果许可证有效但当前设备未激活，请先在 Welight 桌面版中完成激活。',
        ].join('\n'),
      ),
    ].join('\n\n')
  }
}
