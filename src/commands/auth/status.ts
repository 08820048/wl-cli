import {Flags} from '@oclif/core'
import chalk from 'chalk'

import BaseCommand from '../../base-command.js'
import {loadSavedCredentials} from '../../lib/auth/auth-store.js'
import {formatLicenseClientError, PURCHASE_URL, validateLicenseStatus} from '../../lib/auth/license-client.js'
import {getAuthFilePath} from '../../lib/config/paths.js'

export default class AuthStatus extends BaseCommand {
  static description = '查看当前保存的许可证状态'
  static enableJsonFlag = true
  static flags = {
    verbose: Flags.boolean({char: 'v', description: '显示更多细节'}),
  }
  static requiresAuth = false
  static requiresSetup = false

  async run(): Promise<Record<string, unknown> | void> {
    const {flags} = await this.parse(AuthStatus)
    const authFile = getAuthFilePath(this.config.configDir)
    const credentials = await loadSavedCredentials(this.config.configDir)

    if (!credentials) {
      const result = {authFile, loggedIn: false, message: '未登录许可证'}

      if (this.jsonEnabled()) return result

      this.log('未登录许可证。')
      this.log(`先运行 ${chalk.cyan('wl auth login')}，如未购买请访问 ${PURCHASE_URL}`)
      return
    }

    let check

    try {
      check = await validateLicenseStatus(credentials)
    } catch (error) {
      this.error(formatLicenseClientError(error))
    }

    const result = {
      authFile,
      customerEmail: credentials.customerEmail,
      deviceFingerprint: check.details.deviceFingerprint,
      loggedIn: true,
      message: check.message,
      savedAt: credentials.savedAt,
      state: check.state,
      status: check.details.status,
    }

    if (this.jsonEnabled()) return result

    this.log(`许可证文件：${authFile}`)
    this.log(`登录邮箱：${credentials.customerEmail}`)
    this.log(`当前状态：${check.state === 'active' ? chalk.green('可用') : check.state === 'inactive' ? chalk.yellow('待桌面版激活') : chalk.red('不可用')}`)
    this.log(`设备指纹：${check.details.deviceFingerprint}`)

    if (flags.verbose) {
      this.log(`许可证状态：${check.details.status}`)
      if (check.details.expiredAt) this.log(`到期时间：${check.details.expiredAt}`)
      if (typeof check.details.currentActivations === 'number' && typeof check.details.maxActivations === 'number') {
        this.log(`激活设备：${check.details.currentActivations}/${check.details.maxActivations}`)
      }
    }

    this.log(check.message)
  }
}
