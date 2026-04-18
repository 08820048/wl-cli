import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('auth status', () => {
  it('prints either unauthenticated or authenticated summary based on local auth state', async () => {
    const {stdout} = await runCommand('auth status')
    expect(
      stdout.includes('未登录许可证')
      || stdout.includes('许可证文件：'),
    ).to.equal(true)
  })
})
