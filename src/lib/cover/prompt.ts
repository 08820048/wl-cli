import type {CoverGenerationInput} from './types.js'

function normalizeText(inputValue?: string, maxLength = 140): string {
  return String(inputValue || '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function resolveStyleInstruction(style?: CoverGenerationInput['style']): string {
  switch (style) {
    case 'business': {
      return '风格专业、克制、理性，适合商业与产品类公众号头图。'
    }

    case 'editorial': {
      return '风格像编辑部专题封面，有层次感但不过度花哨。'
    }

    case 'magazine': {
      return '风格更具杂志感和视觉冲击，但仍保持高级和简洁。'
    }

    default: {
      return '风格极简、现代、有留白，适合中文公众号封面。'
    }
  }
}

export function buildCoverPrompt(inputValue: {
  style?: CoverGenerationInput['style']
  summary?: string
  title: string
}): string {
  const title = normalizeText(inputValue.title, 80)
  const summary = normalizeText(inputValue.summary, 180)

  return [
    '请生成一张适合中文公众号文章的横版封面图。',
    resolveStyleInstruction(inputValue.style),
    '画面要求：简洁、高级、构图明确、适合移动端头图裁切。',
    '避免出现可读文字、水印、logo、二维码、复杂拼贴。',
    '色彩控制克制，强调主题意象，不要做成海报广告。',
    `文章标题：${title}`,
    summary ? `文章摘要：${summary}` : '',
  ].filter(Boolean).join('\n')
}
