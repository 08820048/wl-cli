import {expect} from 'chai'

import {createDefaultHtmlOutputPath, resolveHtmlOutputPath} from '../../../src/lib/article/output.js'

describe('article output', () => {
  it('creates html output next to the input markdown file', () => {
    const output = createDefaultHtmlOutputPath({
      inputPath: '/tmp/demo/article.md',
      title: 'ignored',
    })

    expect(output).to.equal('/tmp/demo/article.html')
  })

  it('ensures html extension when output is explicitly provided', () => {
    const output = resolveHtmlOutputPath('/tmp/demo/result', {title: 'demo'})

    expect(output).to.equal('/tmp/demo/result.html')
  })
})
