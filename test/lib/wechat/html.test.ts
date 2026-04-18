import {expect} from 'chai'

import {convertHtmlDocumentToWechatInline} from '../../../src/lib/wechat/html.js'

describe('wechat html', () => {
  it('converts a themed html document into wechat compatible inline html', () => {
    const result = convertHtmlDocumentToWechatInline(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>测试文章</title>
          <style>
            :root {
              --md-primary-color: #2a9d8f;
              --md-font-size: 16px;
            }

            #output h1 {
              color: var(--md-primary-color);
            }

            #output p {
              color: hsl(222 47% 11%);
              font-size: calc(var(--md-font-size) * 1.25);
            }
          </style>
        </head>
        <body>
          <section id="output">
            <h1>测试文章</h1>
            <p>第一段内容</p>
            <img src="demo.png" width="640" height="320">
          </section>
        </body>
      </html>`)

    expect(result.title).to.equal('测试文章')
    expect(result.plainText).to.equal('测试文章 第一段内容')
    expect(result.html).to.not.contain('<style')
    expect(result.html).to.not.contain('var(--')
    expect(result.html).to.contain('#1f2937')
    expect(result.html).to.contain('font-size: 20px')
    expect(result.html).to.contain('width:640px')
    expect(result.html).to.contain('height:320px')
  })

  it('throws when the html document is missing #output', () => {
    expect(() => convertHtmlDocumentToWechatInline('<html><body><main>missing</main></body></html>')).to.throw(
      'HTML 中缺少 #output，无法生成公众号兼容内容',
    )
  })
})
