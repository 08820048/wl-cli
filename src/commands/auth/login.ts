import {input} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import chalk from 'chalk'

import BaseCommand from '../../base-command.js'
import {saveCredentials} from '../../lib/auth/auth-store.js'
import {formatLicenseClientError, validateLicenseStatus} from '../../lib/auth/license-client.js'

export default class AuthLogin extends BaseCommand {
  static description = 'Save a license and check whether this device can use the CLI'
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --licenseKey WL-XXXX --customerEmail me@example.com',
  ]
  static flags = {
    customerEmail: Flags.string({description: 'Email used when purchasing the license'}),
    licenseKey: Flags.string({description: 'License key'}),
  }
  static requiresAuth = false
  static requiresSetup = false

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthLogin)

    const licenseKey = String(flags.licenseKey || await input({message: 'License key'})).trim()
    const customerEmail = String(flags.customerEmail || await input({message: 'Purchase email'})).trim()

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
      this.log(chalk.green('License check passed. This device is ready to use the CLI.'))
      return
    }

    this.warn(
      [
        'Your license has been saved, but this device is not activated in the desktop app yet.',
        'Open the Welight desktop app, activate this device, then come back to the CLI.',
      ].join('\n'),
    )
  }
}
