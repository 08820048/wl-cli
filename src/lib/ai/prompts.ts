import type {LayoutMode} from '../article/types.js'
import type {ChatMessage} from './api-client.js'

function buildLayoutInstruction(mode: LayoutMode): string {
  if (mode === 'minimal') {
    return [
      '请把内容整理成极简新闻风格的 Markdown。',
      '要求层级清楚、语言克制、装饰最少、适合资讯稿。',
    ].join('')
  }

  if (mode === 'simple') {
    return [
      '请把内容整理成简洁、专业、偏杂志感的 Markdown。',
      '要求结构清晰、段落短、便于公众号阅读，但不过度设计。',
    ].join('')
  }

  return [
    '请把内容整理成适合公众号的高可读性 Markdown。',
    '要求有明确标题层级、导语、重点列表、必要的强调和结尾总结。',
  ].join('')
}

export function buildArticleCreationMessages(topic: string): ChatMessage[] {
  return [
    {
      content: [
        '你是一位专业的中文公众号作者。',
        '你的任务是围绕用户给定主题，直接产出一篇可发布的 Markdown 文章。',
        '要求：',
        '1. 直接返回 Markdown 正文，不要解释。',
        '2. 包含一个一级标题。',
        '3. 有导语、2 到 4 个二级标题、必要时包含列表。',
        '4. 语言自然、具体，避免空洞套话。',
        '5. 适合公众号阅读，段落不要过长。',
      ].join('\n'),
      role: 'system',
    },
    {
      content: `请围绕以下主题创作公众号文章：\n\n${topic}`,
      role: 'user',
    },
  ]
}

export function buildArticleLayoutMessages(markdown: string, mode: LayoutMode): ChatMessage[] {
  return [
    {
      content: [
        '你是一位专业的公众号排版编辑。',
        buildLayoutInstruction(mode),
        '请只返回整理后的 Markdown，不要补充解释，不要用代码块包裹。',
      ].join('\n'),
      role: 'system',
    },
    {
      content: `请整理以下内容：\n\n${markdown}`,
      role: 'user',
    },
  ]
}
