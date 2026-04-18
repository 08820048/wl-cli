import {expect} from 'chai'

import {createIdeaMarkdownTemplate} from '../../../src/lib/article/source.js'

describe('article source', () => {
  it('creates a fallback markdown template for idea prompts', () => {
    const markdown = createIdeaMarkdownTemplate('写一篇关于效率工具的文章', '效率工具')

    expect(markdown).to.contain('# 效率工具')
    expect(markdown).to.contain('## 关键观点')
    expect(markdown).to.contain('## 总结')
  })
})
