import BaseCommand from '../../base-command.js'
import {clearSavedCredentials} from '../../lib/auth/auth-store.js'

export default class AuthLogout extends BaseCommand {
  static description = '删除本机保存的许可证信息'
  static requiresAuth = false

  async run(): Promise<void> {
    await clearSavedCredentials(this.config.configDir)
    this.log('已删除本机保存的许可证信息。')
  }
}
