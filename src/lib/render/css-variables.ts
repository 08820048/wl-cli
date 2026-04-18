interface ThemeRenderConfig {
  fontFamily: string
  fontSize: string
  isUseIndent?: boolean
  isUseJustify?: boolean
  paragraphLetterSpacing?: string
  paragraphLineHeight?: string
  primaryColor: string
}

function parseCssColorToRgbTriplet(color: string): null | string {
  const raw = String(color || '').trim()
  if (!raw) return null

  const hexMatch = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
  if (hexMatch) {
    let hex = hexMatch[1]
    if (hex.length === 3) {
      hex = [...hex].map(character => character + character).join('')
    }

    if (hex.length === 8) {
      hex = hex.slice(0, 6)
    }

    const r = Number.parseInt(hex.slice(0, 2), 16)
    const g = Number.parseInt(hex.slice(2, 4), 16)
    const b = Number.parseInt(hex.slice(4, 6), 16)

    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return `${r}, ${g}, ${b}`
    }
  }

  return null
}

export function buildThemeVariableCss(config: ThemeRenderConfig): string {
  const cssLines = [
    `--blockquote-background: #f7f7f7;`,
    `--foreground: 222 47% 11%;`,
    `--md-font-family: ${config.fontFamily};`,
    `--md-font-size: ${config.fontSize};`,
    `--md-primary-color: ${config.primaryColor};`,
  ]

  const rgbTriplet = parseCssColorToRgbTriplet(config.primaryColor)
  if (rgbTriplet) {
    cssLines.push(`--md-primary-rgb: ${rgbTriplet};`)
  }

  if (config.paragraphLineHeight) {
    cssLines.push(`--md-paragraph-line-height: ${config.paragraphLineHeight};`)
  }

  if (config.paragraphLetterSpacing) {
    cssLines.push(`--md-paragraph-letter-spacing: ${config.paragraphLetterSpacing};`)
  }

  const paragraphStyles: string[] = []
  if (config.isUseIndent) paragraphStyles.push('text-indent: 2em;')
  if (config.isUseJustify) paragraphStyles.push('text-align: justify;')

  return [
    ':root {',
    ...cssLines.map(line => `  ${line}`),
    '}',
    '',
    '#output,',
    '#output section,',
    '#output .md-container,',
    '#output .container {',
    '  font-family: var(--md-font-family) !important;',
    '  font-size: var(--md-font-size) !important;',
    '}',
    '',
    '#output p,',
    '#output li {',
    `  line-height: ${config.paragraphLineHeight || '1.9'};`,
    `  letter-spacing: ${config.paragraphLetterSpacing || '0.02em'};`,
    '}',
    '',
    '#output p {',
    ...(paragraphStyles.length > 0 ? paragraphStyles.map(line => `  ${line}`) : ['  text-indent: 0;']),
    '}',
  ].join('\n')
}
