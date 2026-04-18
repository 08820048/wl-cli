import {Help} from '@oclif/core'
import boxen from 'boxen'
import chalk from 'chalk'
import terminalLink from 'terminal-link'

import {loadSavedCredentialsSync} from './lib/auth/auth-store.js'
import {loadSavedAppConfigSync} from './lib/config/store.js'
import {centerBlock, getAdaptiveBoxWidth, renderLogo} from './lib/ui/banner.js'

function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  if (!name || !domain) return email
  if (name.length <= 2) return `${name[0]}***@${domain}`
  return `${name[0]}***${name.at(-1)}@${domain}`
}

function link(url: string): string {
  return terminalLink(url, url, {
    fallback: text => text,
  })
}

function infoRow(label: string, value: string): string {
  return `${chalk.hex('#f4a261')(label.padEnd(10, ' '))} ${value}`
}

function createBulletList(lines: string[]): string {
  return lines.map(line => `  ${line}`).join('\n')
}

export default class WlHelp extends Help {
  protected formatRoot(): string {
    const savedCredentials = loadSavedCredentialsSync(this.config.configDir)
    const savedAppConfig = loadSavedAppConfigSync(this.config.configDir)
    const authSummary = savedCredentials
      ? `已保存许可证：${maskEmail(savedCredentials.customerEmail)}`
      : '未保存许可证，请先运行 wl auth login'
    const setupSummary = savedAppConfig
      ? `初始化状态：已完成 · AI ${savedAppConfig.ai.defaultModel}${savedAppConfig.ai.apiKey ? ' + Key' : ''}${savedAppConfig.ai.image?.defaultModel ? ` · Cover ${savedAppConfig.ai.image.defaultModel}` : ''}`
      : '初始化状态：未完成，请先运行 wl setup'
    const version = `v${this.config.version}`
    const website = link('https://waer.ltd')
    const developer = link('https://xuyi.dev')

    const intro = boxen(
      [
        `${chalk.bold('Welight')}  ${chalk.gray('WeChat Article Production CLI')}`,
        chalk.hex('#c9a227')('Write. Layout. Theme. Publish to WeChat.'),
        '',
        infoRow('Official', website),
        infoRow('Developer', developer),
        infoRow('Version', version),
        infoRow('Command', chalk.bold('wl')),
        '',
        chalk.gray(authSummary),
        chalk.gray(setupSummary),
      ].join('\n'),
      {
        borderColor: '#f4a261',
        padding: {bottom: 0, left: 1, right: 1, top: 0},
        width: getAdaptiveBoxWidth(),
      },
    )

    const quickStart = createBulletList([
      `${chalk.cyan('wl')}  首次启动时自动进入初始化向导`,
      `${chalk.cyan('wl setup')}  重新进入配置流程`,
      `${chalk.cyan('wl article compose')}  进入公众号文章创作工作流`,
      `${chalk.cyan('wl cover generate --title "AI 工作流趋势"')}  生成公众号封面图`,
      `${chalk.cyan('wl ai create --prompt "写一篇产品复盘"')}  用 AI 生成文章初稿`,
      `${chalk.cyan('wl publish wechat article.html --mode draft')}  推送到公众号草稿箱`,
    ])

    const coreFlow = createBulletList([
      `${chalk.hex('#2a9d8f')('1.')} 认证许可证`,
      `${chalk.hex('#2a9d8f')('2.')} AI 创作或整理 Markdown`,
      `${chalk.hex('#2a9d8f')('3.')} 选择主题并导出公众号 HTML`,
      `${chalk.hex('#2a9d8f')('4.')} 复制到公众号或直接发草稿 / 发布`,
    ])

    const notes = createBulletList([
      'CLI 只校验许可证，不负责设备激活。',
      '如果许可证有效但当前设备未激活，请先在 Welight 桌面版中完成激活。',
    ])

    return [
      renderLogo(),
      centerBlock(intro),
      this.section('CORE FLOW', coreFlow),
      this.section('QUICK START', quickStart),
      this.section('NOTES', notes),
    ].join('\n\n')
  }
}
