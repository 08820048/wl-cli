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
          'No license is currently saved in the CLI.',
          '',
          'Run `wl auth login` first to save your license.',
          `If you do not have a license yet, visit ${PURCHASE_URL}`,
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
            'Your license is valid, but this device is not activated yet.',
            '',
            'Open the Welight desktop app, activate this device, then return to the CLI.',
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
          'The CLI setup is not complete yet.',
          '',
          'Run `wl setup` to configure your default AI model and WeChat settings before continuing.',
        ].join('\n'),
      )
    }

    this.appConfig = appConfig
  }
}
