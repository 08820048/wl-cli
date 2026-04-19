import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('auth status', () => {
  it('prints either unauthenticated or authenticated summary based on local auth state', async () => {
    const {stdout} = await runCommand('auth status')
    expect(
      stdout.includes('No saved license')
      || stdout.includes('License file:'),
    ).to.equal(true)
  })
})
