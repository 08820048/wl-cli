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
      ? `Saved license: ${maskEmail(savedCredentials.customerEmail)}`
      : 'No saved license. Run wl auth login first.'
    const setupSummary = savedAppConfig
      ? `Setup: complete · AI ${savedAppConfig.ai.defaultModel}${savedAppConfig.ai.apiKey ? ' + Key' : ''}${savedAppConfig.ai.image?.defaultModel ? ` · Cover ${savedAppConfig.ai.image.defaultModel}` : ''}`
      : 'Setup: incomplete. Run wl setup first.'
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
      `${chalk.cyan('wl')}  Start the onboarding wizard`,
      `${chalk.cyan('wl setup')}  Re-run setup`,
      `${chalk.cyan('wl article compose')}  Start the article workflow`,
      `${chalk.cyan('wl cover generate --title "AI Workflow Trends"')}  Generate a cover image`,
      `${chalk.cyan('wl ai create --prompt "Write a product retrospective"')}  Draft an article with AI`,
      `${chalk.cyan('wl publish wechat article.html --mode draft')}  Push to WeChat draft`,
    ])

    const coreFlow = createBulletList([
      `${chalk.hex('#2a9d8f')('1.')} Verify your license`,
      `${chalk.hex('#2a9d8f')('2.')} Create or refine Markdown with AI`,
      `${chalk.hex('#2a9d8f')('3.')} Apply a theme and export WeChat HTML`,
      `${chalk.hex('#2a9d8f')('4.')} Copy to WeChat or publish directly`,
    ])

    const notes = createBulletList([
      'The CLI validates licenses, but does not activate devices.',
      'If your license is valid but this device is not activated, activate it in the Welight desktop app first.',
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
