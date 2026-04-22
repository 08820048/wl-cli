import {expect} from 'chai'

import {
  flattenConfigValues,
  getConfigValue,
  maskConfigValue,
  setConfigValue,
  unsetConfigValue,
} from '../../../src/lib/config/keys.js'

describe('config keys', () => {
  it('masks secret values in flattened output by default', () => {
    const values = flattenConfigValues({
      ai: {apiKey: 'sk-1234567890', defaultModel: 'gpt-4.1'},
      search: {apiKey: 'tvly-1234567890', provider: 'tavily'},
      wechat: {appId: 'wx123', appSecret: 'secret-123456'},
    })

    expect(values.find(item => item.key === 'ai.apiKey')?.value).to.not.equal('sk-1234567890')
    expect(values.find(item => item.key === 'search.apiKey')?.value).to.not.equal('tvly-1234567890')
    expect(values.find(item => item.key === 'wechat.appSecret')?.value).to.not.equal('secret-123456')
    expect(values.find(item => item.key === 'ai.defaultModel')?.value).to.equal('gpt-4.1')
  })

  it('sets and unsets nested config values safely', () => {
    const draft = setConfigValue(setConfigValue({}, 'ai.image.defaultModel', 'flux-dev'), 'search.provider', 'tavily')
    expect(getConfigValue(draft, 'ai.image.defaultModel')).to.equal('flux-dev')
    expect(getConfigValue(draft, 'search.provider')).to.equal('tavily')

    const cleaned = unsetConfigValue(unsetConfigValue(draft, 'ai.image.defaultModel'), 'search.provider')
    expect(cleaned.ai).to.equal(undefined)
    expect(cleaned.search).to.equal(undefined)
  })

  it('masks short values without exposing the original content', () => {
    expect(maskConfigValue('abcd')).to.equal('****')
  })
})
