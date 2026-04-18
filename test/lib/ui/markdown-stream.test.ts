import {expect} from 'chai'

import {extractStableMarkdownChunk, renderMarkdownPreview} from '../../../src/lib/ui/markdown-stream.js'

describe('renderMarkdownPreview', () => {
  it('renders markdown into readable terminal text', () => {
    const preview = renderMarkdownPreview([
      '# 标题',
      '',
      '这里是 **正文** 内容。',
      '',
      '- 第一项',
      '- 第二项',
      '',
      '> 引用说明',
      '',
      '```ts',
      'const value = 1',
      '```',
    ].join('\n'), 60)

    expect(preview).to.include('标题')
    expect(preview).to.include('这里是 正文 内容。')
    expect(preview).to.include('• 第一项')
    expect(preview).to.include('│ 引用说明')
    expect(preview).to.include('const value = 1')
    expect(preview).not.to.include('# 标题')
    expect(preview).not.to.include('- 第一项')
    expect(preview).not.to.include('```ts')
  })

  it('extracts only stable markdown blocks for streaming', () => {
    const article = [
      '# 标题',
      '',
      '第一段。',
      '',
      '第二段还没写完',
    ].join('\n')

    const result = extractStableMarkdownChunk(article)

    expect(result.completed).to.equal('# 标题\n\n第一段。\n\n')
    expect(result.remainder).to.equal('第二段还没写完')
  })
})
