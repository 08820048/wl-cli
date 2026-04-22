import {expect} from 'chai'

import {
  parseCoverPromptFromMarkdown,
  parseTitlesFromMarkdown,
} from '../../../src/lib/ai/title.js'

describe('title recommendation parser', () => {
  it('extracts the cover query block from markdown output', () => {
    const result = parseCoverPromptFromMarkdown(`
## 推荐标题

### 一个标题

[COVER]
query=ai workflow laptop dashboard
orientation=horizontal
[/COVER]
`)

    expect(result).to.deep.equal({
      orientation: 'horizontal',
      query: 'ai workflow laptop dashboard',
    })
  })

  it('extracts scored title recommendations in order', () => {
    const titles = parseTitlesFromMarkdown(`
## 推荐标题

1. ⭐️ (9.2分)

### 这个时代，AI 工作流才是效率核心

2. ⭐️ (8.6分)

### 为什么团队开始重做 AI 协作方式？

## 标题技巧与点击率分析

1. **标题1**: 反常识 - 直接点出关键判断
2. **标题2**: 提问式 - 激发读者好奇心
`)

    expect(titles).to.have.length(2)
    expect(titles[0]).to.include({
      reason: '反常识 - 直接点出关键判断',
      score: 9.2,
      stars: 5,
      title: '这个时代，AI 工作流才是效率核心',
    })
    expect(titles[1]).to.include({
      reason: '提问式 - 激发读者好奇心',
      score: 8.6,
      stars: 4,
      title: '为什么团队开始重做 AI 协作方式？',
    })
  })
})
