import chalk from 'chalk'

function stripAnsi(inputValue: string): string {
  const escape = String.fromCodePoint(27)
  let output = ''

  for (let index = 0; index < inputValue.length; index += 1) {
    if (inputValue[index] === escape && inputValue[index + 1] === '[') {
      index += 2

      while (index < inputValue.length && inputValue[index] !== 'm') {
        index += 1
      }

      continue
    }

    output += inputValue[index]
  }

  return output
}

function visibleWidth(inputValue: string): number {
  return stripAnsi(inputValue).length
}

export function getTerminalWidth(fallback = 100): number {
  return Math.max(process.stdout.columns || fallback, 60)
}

export function getAdaptiveBoxWidth(preferred = 84): number {
  return Math.max(48, Math.min(preferred, getTerminalWidth() - 6))
}

export function centerBlock(inputValue: string, width = process.stdout.columns || 100): string {
  const lines = inputValue.split('\n')
  let maxWidth = 0

  for (const line of lines) {
    maxWidth = Math.max(maxWidth, visibleWidth(line))
  }

  const indent = Math.max(0, Math.floor((width - maxWidth) / 2))
  const padding = ' '.repeat(indent)

  return lines
    .map(line => line.trim() ? `${padding}${line}` : '')
    .join('\n')
}

export function renderLogo(): string {
  const lines = [
    '██╗    ██╗███████╗██╗     ██╗ ██████╗ ██╗  ██╗████████╗',
    '██║    ██║██╔════╝██║     ██║██╔════╝ ██║  ██║╚══██╔══╝',
    '██║ █╗ ██║█████╗  ██║     ██║██║  ███╗███████║   ██║   ',
    '██║███╗██║██╔══╝  ██║     ██║██║   ██║██╔══██║   ██║   ',
    '╚███╔███╔╝███████╗███████╗██║╚██████╔╝██║  ██║   ██║   ',
    ' ╚══╝╚══╝ ╚══════╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ',
  ]

  const palette = ['#ffe082', '#ffd166', '#f4a261', '#e76f51', '#2a9d8f', '#264653']

  return centerBlock(lines.map((line, index) => chalk.hex(palette[index])(line)).join('\n'))
}
