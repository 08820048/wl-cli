import {buildThemeVariableCss} from './css-variables.js'
import {renderMarkdownArticle} from './markdown.js'
import {loadThemeCssBundle} from './theme-assets.js'

export async function buildThemedHtmlDocument(input: {
  countStatus?: boolean
  fallbackTitle: string
  fontFamily?: string
  fontSize?: string
  isUseIndent?: boolean
  isUseJustify?: boolean
  markdownText: string
  paragraphLetterSpacing?: string
  paragraphLineHeight?: string
  primaryColor: string
  themeId: string
}): Promise<{html: string; title: string}> {
  const {articleHtml, resolvedTitle} = renderMarkdownArticle({
    countStatus: input.countStatus,
    fallbackTitle: input.fallbackTitle,
    markdownText: input.markdownText,
  })

  const themeCss = await loadThemeCssBundle(input.themeId)
  const variablesCss = buildThemeVariableCss({
    fontFamily: input.fontFamily || `Georgia, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", serif`,
    fontSize: input.fontSize || '16px',
    isUseIndent: input.isUseIndent,
    isUseJustify: input.isUseJustify,
    paragraphLetterSpacing: input.paragraphLetterSpacing,
    paragraphLineHeight: input.paragraphLineHeight,
    primaryColor: input.primaryColor,
  })

  const shellCss = [
    'html, body {',
    '  margin: 0;',
    '  padding: 0;',
    '  background:',
    '    radial-gradient(circle at top left, rgba(244, 162, 97, 0.22), transparent 24%),',
    '    radial-gradient(circle at top right, rgba(42, 157, 143, 0.18), transparent 26%),',
    '    linear-gradient(180deg, #f9f4ea 0%, #f6f3ee 45%, #f2efe9 100%);',
    '  color: #1f2937;',
    '}',
    'body {',
    '  padding: 40px 18px 72px;',
    '}',
    '.page-shell {',
    '  max-width: 860px;',
    '  margin: 0 auto;',
    '}',
    '.page-kicker {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 10px;',
    '  margin-bottom: 18px;',
    '  padding: 8px 14px;',
    '  border-radius: 999px;',
    '  background: rgba(255, 255, 255, 0.82);',
    '  color: #6b7280;',
    '  font: 600 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;',
    '  letter-spacing: 0.08em;',
    '  text-transform: uppercase;',
    '  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);',
    '}',
    '#output {',
    '  background: rgba(255, 255, 255, 0.96);',
    '  border: 1px solid rgba(15, 23, 42, 0.08);',
    '  border-radius: 28px;',
    '  padding: 32px 24px;',
    '  box-shadow: 0 28px 70px rgba(15, 23, 42, 0.12);',
    '  backdrop-filter: blur(14px);',
    '}',
    '@media (min-width: 768px) {',
    '  body {',
    '    padding: 56px 24px 96px;',
    '  }',
    '',
    '  #output {',
    '    padding: 42px 44px;',
    '  }',
    '}',
  ].join('\n')

  const html = [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${resolvedTitle}</title>`,
    '  <style>',
    variablesCss,
    '',
    themeCss,
    '',
    shellCss,
    '  </style>',
    '</head>',
    '<body>',
    '  <main class="page-shell">',
    '    <div class="page-kicker">wl article compose</div>',
    `    <article id="output">${articleHtml}</article>`,
    '  </main>',
    '</body>',
    '</html>',
  ].join('\n')

  return {html, title: resolvedTitle}
}
