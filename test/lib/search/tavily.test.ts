import {expect} from 'chai'

import {supportsNativeWebSearch} from '../../../src/lib/ai/api-client.js'
import {buildTavilySearchContext} from '../../../src/lib/search/tavily.js'

describe('tavily search integration', () => {
  it('formats Tavily search context into a readable system prompt', () => {
    const context = buildTavilySearchContext({
      executedAt: '2026-04-22T00:00:00.000Z',
      response: {
        answer: 'Nintendo shared new Switch 2 launch guidance.',
        query: 'latest Nintendo Switch 2 news',
        results: [
          {
            content: 'Nintendo updated shipment targets during its latest briefing.',
            publishedDate: '2026-04-21',
            title: 'Nintendo updates Switch 2 plans',
            url: 'https://example.com/switch-2',
          },
        ],
      },
    })

    expect(context).to.include('Search query: latest Nintendo Switch 2 news')
    expect(context).to.include('Nintendo updates Switch 2 plans')
    expect(context).to.include('Nintendo shared new Switch 2 launch guidance.')
  })

  it('flags deepseek as a model that needs external web search fallback', () => {
    expect(supportsNativeWebSearch({identifier: 'deepseek-chat', provider: 'DEEPSEEK'})).to.equal(false)
    expect(supportsNativeWebSearch({identifier: 'qwen3-max', provider: 'QWEN'})).to.equal(true)
  })
})
