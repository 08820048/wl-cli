import fs from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

const THEME_ASSET_DIR = fileURLToPath(new URL('../../../assets/theme-css/', import.meta.url))
const themeCssCache = new Map<string, string>()

async function readThemeCssFile(filename: string): Promise<string> {
  const cached = themeCssCache.get(filename)
  if (cached) {
    return cached
  }

  const cssText = await fs.readFile(new URL(filename, `file://${THEME_ASSET_DIR}/`), 'utf8')
  themeCssCache.set(filename, cssText)
  return cssText
}

export async function loadThemeCssBundle(themeId: string): Promise<string> {
  const baseCss = await readThemeCssFile('base.css')
  const primaryThemeCss = await readThemeCssFile('w001.css')

  if (themeId === 'w001') {
    return `${baseCss}\n\n${primaryThemeCss}`
  }

  const specificThemeCss = await readThemeCssFile(`${themeId}.css`)
  return `${baseCss}\n\n${primaryThemeCss}\n\n${specificThemeCss}`
}
