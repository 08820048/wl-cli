import {input} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import chalk from 'chalk'

import BaseCommand from '../../base-command.js'
import {saveCredentials} from '../../lib/auth/auth-store.js'
import {formatLicenseClientError, validateLicenseStatus} from '../../lib/auth/license-client.js'

export default class AuthLogin extends BaseCommand {
  static description = '录入许可证并检查当前设备是否可用于 CLI'
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --licenseKey WL-XXXX --customerEmail me@example.com',
  ]
  static flags = {
    customerEmail: Flags.string({description: '购买许可证时使用的邮箱'}),
    licenseKey: Flags.string({description: '许可证密钥'}),
  }
  static requiresAuth = false

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthLogin)

    const licenseKey = String(flags.licenseKey || await input({message: '许可证密钥'})).trim()
    const customerEmail = String(flags.customerEmail || await input({message: '购买邮箱'})).trim()

    let result

    try {
      result = await validateLicenseStatus({
        customerEmail,
        licenseKey,
      })
    } catch (error) {
      this.error(formatLicenseClientError(error))
    }

    if (result.state === 'invalid') {
      this.error(result.message)
    }

    await saveCredentials(this.config.configDir, {
      customerEmail,
      licenseKey,
    })

    if (result.state === 'active') {
      this.log(chalk.green('许可证检查通过，当前设备已可使用 CLI。'))
      return
    }

    this.warn(
      [
        '许可证信息已保存，但当前设备还没有在桌面版中激活。',
        '请先打开 Welight 桌面版完成激活，然后再使用 CLI 命令。',
      ].join('\n'),
    )
  }
}
