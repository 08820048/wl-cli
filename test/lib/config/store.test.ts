import {expect} from 'chai'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {loadDraftAppConfig, loadSavedAppConfig, saveDraftAppConfig} from '../../../src/lib/config/store.js'

describe('config store', () => {
  it('persists partial config values without requiring a complete setup', async () => {
    const configDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wl-config-draft-'))

    await saveDraftAppConfig(configDir, {
      ai: {defaultModel: 'gpt-4.1'},
      wechat: {appId: 'wx123'},
    })

    const draft = await loadDraftAppConfig(configDir)
    const saved = await loadSavedAppConfig(configDir)

    expect(draft.ai?.defaultModel).to.equal('gpt-4.1')
    expect(draft.wechat?.appId).to.equal('wx123')
    expect(saved).to.equal(null)
  })

  it('marks the config as setup-complete once all required values exist', async () => {
    const configDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'wl-config-complete-'))

    await saveDraftAppConfig(configDir, {
      ai: {apiKey: 'sk-test', defaultModel: 'gpt-4.1'},
      search: {apiKey: 'tvly-test', provider: 'tavily'},
      wechat: {appId: 'wx123', appSecret: 'secret-123'},
    })

    const saved = await loadSavedAppConfig(configDir)

    expect(saved?.ai.defaultModel).to.equal('gpt-4.1')
    expect(saved?.search?.provider).to.equal('tavily')
    expect(saved?.wechat.appSecret).to.equal('secret-123')
    expect(saved?.setupCompletedAt).to.be.a('string')
  })
})
