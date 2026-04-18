import path from 'node:path'

function sanitizeFilenamePart(value: string): string {
  const normalized = String(value || '')
    .trim()
    .replaceAll(/[<>:"/\\|?*]/g, '-')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')

  return normalized || `wl-article-${Date.now()}`
}

export function createDefaultHtmlOutputPath(input: {inputPath?: string; title: string}): string {
  if (input.inputPath) {
    const parsed = path.parse(path.resolve(input.inputPath))
    return path.join(parsed.dir, `${parsed.name}.html`)
  }

  return path.resolve(process.cwd(), `${sanitizeFilenamePart(input.title)}.html`)
}

export function resolveHtmlOutputPath(outputPath: string | undefined, fallback: {inputPath?: string; title: string}): string {
  if (!outputPath) {
    return createDefaultHtmlOutputPath(fallback)
  }

  const absolute = path.resolve(outputPath)
  if (absolute.toLowerCase().endsWith('.html')) {
    return absolute
  }

  return `${absolute}.html`
}
