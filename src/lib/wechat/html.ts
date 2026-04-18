import {JSDOM} from 'jsdom'
import juice from 'juice'

const FOREGROUND_RGB = {b: 55, g: 41, h: 222, l: 11, r: 31, s: 47}

function hueToRgbChannel(p: number, q: number, t: number): number {
  let value = t
  if (value < 0) value += 1
  if (value > 1) value -= 1
  if (value < 1 / 6) return p + (q - p) * 6 * value
  if (value < 1 / 2) return q
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
  return p
}

function hslToRgb(input: {alpha?: number; h: number; l: number; s: number}) {
  const h = input.h / 360
  const s = input.s / 100
  const l = input.l / 100

  if (s === 0) {
    const gray = Math.round(l * 255)
    return {b: gray, g: gray, r: gray}
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return {
    b: Math.round(hueToRgbChannel(p, q, h - 1 / 3) * 255),
    g: Math.round(hueToRgbChannel(p, q, h) * 255),
    r: Math.round(hueToRgbChannel(p, q, h + 1 / 3) * 255),
  }
}

function rgbToHex(rgb: {b: number; g: number; r: number}): string {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map(channel => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

function extractCssCustomProperties(cssText: string): Record<string, string> {
  const variables: Record<string, string> = {}
  const regex = /--([\w-]+)\s*:\s*([^;]+);/g

  while (true) {
    const match = regex.exec(cssText)
    if (!match) break
    variables[`--${match[1]}`] = match[2].trim()
  }

  return variables
}

function resolveCssCustomProperties(variables: Record<string, string>) {
  const resolved = new Map<string, string>()

  const resolveVariable = (name: string, stack = new Set<string>()): string => {
    if (resolved.has(name)) {
      return resolved.get(name) || ''
    }

    if (stack.has(name)) {
      return variables[name] || ''
    }

    stack.add(name)
    const rawValue = variables[name] || ''
    const nextValue = rawValue.replaceAll(/var\((--[\w-]+)\)/g, (_match, variableName: string) => resolveVariable(variableName, stack))
    stack.delete(name)
    resolved.set(name, nextValue)
    return nextValue
  }

  for (const key of Object.keys(variables)) {
    resolveVariable(key)
  }

  return Object.fromEntries(resolved.entries())
}

function replaceCssVariables(source: string, variables: Record<string, string>): string {
  let output = source

  for (const [name, value] of Object.entries(variables)) {
    output = output.replaceAll(`var(${name})`, value)
  }

  return output
}

function resolveMdFontSize(text: string, fontSize: string): string {
  const size = fontSize.trim()
  if (!size) return text

  const sizeMatch = /^(\d+(?:\.\d+)?)([a-z%]+)$/i.exec(size)
  if (!sizeMatch) {
    return text.replaceAll('var(--md-font-size)', size)
  }

  const baseValue = Number.parseFloat(sizeMatch[1])
  const unit = sizeMatch[2]
  if (!Number.isFinite(baseValue) || baseValue <= 0) {
    return text.replaceAll('var(--md-font-size)', size)
  }

  const calcRe = /calc\(\s*(?:var\(--md-font-size\)|(\d+(?:\.\d+)?[a-z%]+))\s*\*\s*(\d+(?:\.\d+)?)\s*\)/gi
  let next = text.replaceAll(calcRe, (_match, _current: string | undefined, factorText: string) => {
    const factor = Number.parseFloat(factorText)
    if (!Number.isFinite(factor)) {
      return size
    }

    const computed = Number((baseValue * factor).toFixed(3))
    return `${computed}${unit}`
  })

  next = next.replaceAll('var(--md-font-size)', size)
  return next
}

function replaceForegroundColor(text: string): string {
  return text.replaceAll(
    /hsl\(\s*222\s+47%\s+11%(?:\s*\/\s*([0-9.]+))?\s*\)/gi,
    (_match, alphaText: string | undefined) => {
      if (!alphaText) {
        return rgbToHex(FOREGROUND_RGB)
      }

      return `rgba(${FOREGROUND_RGB.r}, ${FOREGROUND_RGB.g}, ${FOREGROUND_RGB.b}, ${alphaText})`
    },
  )
}

function replaceGenericHslFunctions(text: string): string {
  return text.replaceAll(
    /hsl\(\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%(?:\s*\/\s*([0-9.]+))?\s*\)/gi,
    (...arguments_) => {
      const [_match, hText, sText, lText, alphaText] = arguments_ as [string, string, string, string, string | undefined]
      const h = Number.parseFloat(hText)
      const s = Number.parseFloat(sText)
      const l = Number.parseFloat(lText)
      if (![h, s, l].every(value => Number.isFinite(value))) {
        return _match
      }

      const rgb = hslToRgb({h, l, s})
      if (!alphaText) {
        return rgbToHex(rgb)
      }

      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alphaText})`
    },
  )
}

function normalizeWechatHtml(html: string): string {
  return html
    .replaceAll(/([^-])top:\s*([^;"]+?)em/gi, '$1transform: translateY($2em)')
    .replaceAll(/--md-primary-color:[^;"]+;?/gi, '')
    .replaceAll(/--md-font-family:[^;"]+;?/gi, '')
    .replaceAll(/--md-font-size:[^;"]+;?/gi, '')
    .replaceAll(
      /<span class="nodeLabel"([^>]*)><p[^>]*>(.*?)<\/p><\/span>/g,
      '<span class="nodeLabel"$1>$2</span>',
    )
    .replaceAll(
      /<span class="edgeLabel"([^>]*)><p[^>]*>(.*?)<\/p><\/span>/g,
      '<span class="edgeLabel"$1>$2</span>',
    )
    .replaceAll(
      /<tspan([^>]*)>/g,
      '<tspan$1 style="fill: #333333 !important; color: #333333 !important; stroke: none !important;">',
    )
}

function solveWechatImages(document: JSDOM['window']['document']): void {
  const images = document.querySelectorAll('img')

  for (const image of images) {
    const width = image.getAttribute('width')
    const height = image.getAttribute('height')

    if (width) {
      image.removeAttribute('width')
      image.setAttribute('style', `${image.getAttribute('style') || ''};width:${/^\d+$/.test(width) ? `${width}px` : width}`)
    }

    if (height) {
      image.removeAttribute('height')
      image.setAttribute('style', `${image.getAttribute('style') || ''};height:${/^\d+$/.test(height) ? `${height}px` : height}`)
    }
  }
}

export function convertHtmlDocumentToWechatInline(inputHtml: string): {html: string; plainText: string; title: string} {
  const sourceDom = new JSDOM(inputHtml)
  const {document} = sourceDom.window
  const title = document.querySelector('title')?.textContent?.trim()
    || document.querySelector('#output h1')?.textContent?.trim()
    || '未命名文章'
  const output = document.querySelector('#output')
  if (!output) {
    throw new Error('HTML 中缺少 #output，无法生成公众号兼容内容')
  }

  const styleText = [...document.querySelectorAll('style')]
    .map(element => element.textContent || '')
    .join('\n')
  const cssVariables = resolveCssCustomProperties(extractCssCustomProperties(styleText))
  const mdFontSize = cssVariables['--md-font-size'] || '16px'
  let resolvedCss = replaceCssVariables(styleText, cssVariables)
  resolvedCss = resolveMdFontSize(resolvedCss, mdFontSize)
  resolvedCss = replaceForegroundColor(resolvedCss)
  resolvedCss = replaceGenericHslFunctions(resolvedCss)

  for (const style of document.querySelectorAll('style')) {
    style.remove()
  }

  const inlined = juice.inlineContent(document.documentElement.outerHTML, resolvedCss, {
    preserveMediaQueries: false,
    removeStyleTags: true,
  })

  const inlineDom = new JSDOM(inlined)
  const inlineDocument = inlineDom.window.document
  const inlineOutput = inlineDocument.querySelector('#output')
  if (!inlineOutput) {
    throw new Error('HTML 内联失败，未找到 #output')
  }

  for (const element of inlineOutput.querySelectorAll('style, link[rel="stylesheet"]')) element.remove()
  solveWechatImages(inlineDocument)

  const html = normalizeWechatHtml(inlineOutput.innerHTML).trim()
  const plainText = inlineOutput.textContent?.replace(/\s+/g, ' ').trim() || ''

  return {html, plainText, title}
}
