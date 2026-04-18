import {expect} from 'chai'

import {inspectCover} from '../../../src/lib/cover/service.js'

describe('cover service', () => {
  it('prefers explicit cover image when provided', async () => {
    const result = await inspectCover({
      explicitCoverImage: './cover.png',
      fileText: '# Hello',
    })

    expect(result.status).to.equal('explicit')
    expect(result.source).to.equal('./cover.png')
  })

  it('reads cover image from markdown frontmatter', async () => {
    const result = await inspectCover({
      fileText: `---
coverImage: ./front-cover.png
---

# Title

正文内容

![body](./body.png)
`,
      inputPath: 'article.md',
    })

    expect(result.status).to.equal('article-meta')
    expect(result.source).to.equal('./front-cover.png')
  })

  it('falls back to first markdown image', async () => {
    const result = await inspectCover({
      fileText: `
# Title

第一段内容

![body](./body.png "caption")
`,
      inputPath: 'article.md',
    })

    expect(result.status).to.equal('body-first-image')
    expect(result.source).to.equal('./body.png')
  })

  it('falls back to first html image', async () => {
    const result = await inspectCover({
      fileText: `
<!doctype html>
<html>
  <head><title>测试标题</title></head>
  <body>
    <section id="output">
      <p>内容摘要</p>
      <img src="./body-cover.png">
    </section>
  </body>
</html>`,
      inputPath: 'article.html',
    })

    expect(result.status).to.equal('body-first-image')
    expect(result.source).to.equal('./body-cover.png')
    expect(result.title).to.equal('测试标题')
  })
})
