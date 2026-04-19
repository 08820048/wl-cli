import {Flags} from '@oclif/core'
import chalk from 'chalk'

import BaseCommand from '../../base-command.js'
import {loadSavedCredentials} from '../../lib/auth/auth-store.js'
import {formatLicenseClientError, PURCHASE_URL, validateLicenseStatus} from '../../lib/auth/license-client.js'
import {getAuthFilePath} from '../../lib/config/paths.js'

export default class AuthStatus extends BaseCommand {
  static description = 'Show the currently saved license status'
  static enableJsonFlag = true
  static flags = {
    verbose: Flags.boolean({char: 'v', description: 'Show more details'}),
  }
  static requiresAuth = false
  static requiresSetup = false

  async run(): Promise<Record<string, unknown> | void> {
    const {flags} = await this.parse(AuthStatus)
    const authFile = getAuthFilePath(this.config.configDir)
    const credentials = await loadSavedCredentials(this.config.configDir)

    if (!credentials) {
      const result = {authFile, loggedIn: false, message: 'No saved license'}

      if (this.jsonEnabled()) return result

      this.log('No saved license.')
      this.log(`Run ${chalk.cyan('wl auth login')} first. If you do not have a license yet, visit ${PURCHASE_URL}`)
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

    this.log(`License file: ${authFile}`)
    this.log(`Email: ${credentials.customerEmail}`)
    this.log(`State: ${check.state === 'active' ? chalk.green('active') : check.state === 'inactive' ? chalk.yellow('needs desktop activation') : chalk.red('invalid')}`)
    this.log(`Device fingerprint: ${check.details.deviceFingerprint}`)

    if (flags.verbose) {
      this.log(`License status: ${check.details.status}`)
      if (check.details.expiredAt) this.log(`Expires at: ${check.details.expiredAt}`)
      if (typeof check.details.currentActivations === 'number' && typeof check.details.maxActivations === 'number') {
        this.log(`Activations: ${check.details.currentActivations}/${check.details.maxActivations}`)
      }
    }

    this.log(check.message)
  }
}
