import BaseCommand from '../../base-command.js'
import {clearSavedCredentials} from '../../lib/auth/auth-store.js'

export default class AuthLogout extends BaseCommand {
  static description = 'Remove the saved license information from this machine'
  static requiresAuth = false
  static requiresSetup = false

  async run(): Promise<void> {
    await clearSavedCredentials(this.config.configDir)
    this.log('Removed the saved license information from this machine.')
  }
}
