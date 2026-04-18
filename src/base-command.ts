import {Command, Errors} from '@oclif/core'

import type {LicenseCheckResult} from './lib/auth/types.js'
import type {SavedAppConfig} from './lib/config/types.js'

import {loadSavedCredentials} from './lib/auth/auth-store.js'
import {formatLicenseClientError, PURCHASE_URL, validateLicenseStatus} from './lib/auth/license-client.js'
import {isSetupComplete, loadSavedAppConfig} from './lib/config/store.js'

export default abstract class BaseCommand extends Command {
  static requiresAuth = true
  static requiresSetup = true
  protected appConfig?: SavedAppConfig
  protected licenseCheck?: LicenseCheckResult

  public async init(): Promise<void> {
    await super.init()

    const ctor = this.constructor as typeof BaseCommand
    if (!ctor.requiresAuth) return

    const credentials = await loadSavedCredentials(this.config.configDir)
    if (!credentials) {
      throw new Errors.CLIError(
        [
          'CLI 尚未登录许可证。',
          '',
          '先运行 `wl auth login` 录入许可证信息。',
          `如果你还没有购买许可证，请访问 ${PURCHASE_URL}`,
        ].join('\n'),
      )
    }

    let result: LicenseCheckResult

    try {
      result = await validateLicenseStatus(credentials)
    } catch (error) {
      throw new Errors.CLIError(formatLicenseClientError(error))
    }

    this.licenseCheck = result

    if (result.state !== 'active') {
      if (result.state === 'inactive') {
        throw new Errors.CLIError(
          [
            '许可证有效，但当前设备还没有在桌面版中激活。',
            '',
            '请先打开 Welight 桌面版完成激活，然后再回到 CLI 使用。',
          ].join('\n'),
        )
      }

      throw new Errors.CLIError(result.message)
    }

    if (!ctor.requiresSetup) return

    const appConfig = await loadSavedAppConfig(this.config.configDir)
    if (!isSetupComplete(appConfig)) {
      throw new Errors.CLIError(
        [
          'CLI 尚未完成初始化配置。',
          '',
          '先运行 `wl setup`，完成默认 AI 模型和公众号信息配置后再继续使用。',
        ].join('\n'),
      )
    }

    this.appConfig = appConfig
  }
}
