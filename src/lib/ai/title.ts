import {JSDOM} from 'jsdom'
import fs from 'node:fs/promises'
import path from 'node:path'

import type {ChatMessage} from './api-client.js'

import {runAiChat} from './api-client.js'

export interface CoverPromptResult {
  orientation: 'all' | 'horizontal' | 'vertical'
  query: string
}

export interface TitleRecommendationItem {
  reason?: string
  score?: number
  stars?: number
  title: string
}

export interface TitleRecommendationResult {
  coverPrompt: CoverPromptResult | null
  rawMarkdown: string
  titles: TitleRecommendationItem[]
}

function normalizeTitle(value: string): string {
  return String(value || '')
    .replaceAll(/^["“”'‘’「」『』【】]+|["“”'‘’「」『』【】]+$/g, '')
    .replace(/^\d+[.\u3001)\]]\s+/, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/[:：]\s*$/, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function isValidTitle(value: string): boolean {
  if (!value || value.length < 4) return false
  if (/^[-—]+$/.test(value)) return false
  if (/[★☆]/.test(value)) return false
  if (/推荐指数|评分|打分|分数/.test(value)) return false
  if (/\d+\s*分/.test(value)) return false
  if (/^\d+[.\u3001)]\s*$/.test(value)) return false
  if (/^[|#>]/.test(value)) return false
  if (/^\*{2,}$/.test(value)) return false
  if (!/[\u4E00-\u9FA5A-Z]/i.test(value)) return false
  const leftParens = (value.match(/[([{（【]/g) || []).length
  const rightParens = (value.match(/[)\]}）】]/g) || []).length
  return leftParens === rightParens
}

function buildTitleRecommendationPrompt(text: string): string {
  return `# 微信公众号爆款标题生成器

## 角色

你是一位深谙微信生态的资深内容策略师和标题优化专家，精通各类能够引爆阅读和营销的标题技巧，并且能够将这些技巧灵活运用于AI提示工程。

## 背景与目标

微信文章的标题是内容传播的黄金入口，直接决定了文章的打开率、阅读完成度乃至营销转化。本Prompt旨在帮助用户基于其提供的内容核心，快速生成5-10个高质量、多样化的微信公众号标题，并提供使用这些标题的策略建议和预估点击效果。你需要运用调研资料中提及的各种"吸睛"标题基石、爆款标题风格与技巧、营销心理学杠杆以及标点符号的精妙运用，同时严格规避"标题党"的风险。

## 任务指令

请根据用户输入的核心内容，完成以下任务：

1.  **生成标题 (5-10个)**：
    *   产出5-10个风格多样、吸引眼球的微信公众号标题。
    *   确保标题长度在7-18字之间为佳，核心信息尽量在前7个字呈现。
    *   灵活运用以下一种或多种策略：
        *   **信息传递型**：新闻速递式、老友对话式、实用锦囊式（可含数字/提问）。
        *   **好奇心与情感型**：巧设悬念、善用提问、反常识/逆向思维、紧跟热点/名人、活用热词/流行梗、妙用引语/转换视角、触动情感/引发共鸣。
        *   **营销心理型**：恐惧诉求、锚定效应、稀缺性原则、调动感官/构建场景。
        *   **标点符号强调**：如感叹号增强情感、问号引发思考、省略号制造悬念、引号突出重点、特殊符号【】| 区分。
    *   包含用户内容中的核心关键词。
    *   考虑目标受众可能的痛点、需求或兴趣点。

2.  **标题评分与排序**：
    *   为每个标题进行综合评分（满分10分）
    *   将标题按总分从高到低排序
    *   为最高评分的1-3个标题标记⭐️，表示强烈推荐使用

3.  **敏感内容检测**：
    *   检查所有生成标题中可能触发微信审核机制的敏感表达：
        *   过度夸张的承诺或效果宣称
        *   涉及政治、宗教、暴力等敏感话题的词汇
        *   违反广告法的表述（如"最""首""独家"等绝对化用词）
        *   可能被视为低俗、诱导或虚假的表达方式
    *   对存在风险的标题提供修改建议或替代方案

## 输出格式(示例)

---

# 为您生成的微信公众号爆款标题

## 推荐标题

1. ⭐️ (9.0分)

### 标题内容1


2. ⭐️ (8.5分)

### 标题内容2


3. ⭐️ (8.3分)

### 标题内容3


4. (7.8分)

### 标题内容4

...


## 标题技巧与点击率分析

1. **标题1**: [使用技巧] - [简洁说明为什么这个标题点击率高]
2. **标题2**: [使用技巧] - [简洁说明]
3. **标题3**: [使用技巧] - [简洁说明]
4. **标题4**: [使用技巧] - [简洁说明]
...

## 敏感内容提醒

| 标题序号 | 潜在敏感表达 | 修改建议 |
|----------|--------------|----------|
| [序号] | [敏感表达] | [替代表达] |
| [序号] | [敏感表达] | [替代表达] |

## 重要提醒：

*   选择标题时，请确保标题与文章核心内容高度相关，避免成为"标题党"。
*   结合您的品牌调性和目标受众的偏好进行最终选择。
*   建议进行A/B测试，以找到最适合您内容的标题。
*   注意避免使用可能触发微信内容审核的敏感表达。

---

## 约束与准则

*   **严禁标题党**：标题必须真实反映文章核心内容，不能为了吸引点击而夸大其词、歪曲事实或与内容无关。
*   **尊重原创，遵守规范**：生成内容需符合微信平台运营规范。
*   **积极正面**：除非内容本身是揭示问题，否则标题应尽量传递积极、有价值的信息。
*   **简洁有力**：在规定字数内，力求表达清晰、冲击力强。
*   **合规性优先**：在追求点击率的同时，确保标题不违反广告法和微信内容政策。

## 封面搜索词输出（用于图片素材平台 Pixabay）

在回答的最末尾追加一个封面搜索块，严格使用如下格式（只输出一次）：

[COVER]
query=<3-6个关键词，用空格分隔，优先英文；无法翻译可用中文>
orientation=<horizontal|vertical|all>
[/COVER]

请根据以下内容分析提取关键信息并创作最佳标题方案：

---

${text}`
}

export function buildTitleRecommendationMessages(text: string): ChatMessage[] {
  return [
    {
      content: buildTitleRecommendationPrompt(text),
      role: 'user',
    },
  ]
}

export function parseCoverPromptFromMarkdown(content: string): CoverPromptResult | null {
  const match = content.match(/\[\s*COVER\s*]([\s\S]*?)\[\s*\/\s*COVER\s*]/i)
  if (!match) return null

  const body = match[1] || ''
  let query = ''
  let orientation: CoverPromptResult['orientation'] = 'horizontal'

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const lower = line.toLowerCase()

    if (lower.startsWith('query=')) {
      query = line.slice('query='.length).trim()
      continue
    }

    if (lower.startsWith('orientation=')) {
      const value = line.slice('orientation='.length).trim().toLowerCase()
      if (value === 'horizontal' || value === 'vertical' || value === 'all') {
        orientation = value
      }
    }
  }

  return query
    ? {orientation, query}
    : null
}

export function parseTitlesFromMarkdown(content: string): TitleRecommendationItem[] {
  const lines = content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  const h3Entries: Array<{lineIndex: number; title: string}> = []
  for (const [index, line] of lines.entries()) {
    if (line.startsWith('### ')) {
      const title = line.replace(/^###\s*/, '').trim()
      if (title) h3Entries.push({lineIndex: index, title})
    }
  }

  const analysisStartIndex = lines.findIndex(
    line => line.includes('标题分析说明') || line.includes('标题技巧与点击率分析'),
  )
  const analysisLines: string[] = []
  if (analysisStartIndex !== -1) {
    for (let index = analysisStartIndex + 1; index < lines.length; index += 1) {
      const line = lines[index]
      if (line.startsWith('## ')) break
      if (/^\d+[.\u3001]/.test(line)) analysisLines.push(line)
    }
  }

  const structuredTitles = h3Entries.map((entry, index) => {
    let score: number | undefined
    for (let offset = 1; offset <= 3; offset += 1) {
      const previousLine = lines[entry.lineIndex - offset]
      if (!previousLine) continue
      const match = previousLine.match(/(\d{1,2}(?:\.\d)?)\s*分/)
      if (!match) continue
      const parsed = Number.parseFloat(match[1])
      if (!Number.isNaN(parsed)) {
        score = parsed
        break
      }
    }

    let stars: number | undefined
    if (typeof score === 'number') {
      if (score >= 9) stars = 5
      else if (score >= 8) stars = 4
      else if (score >= 7) stars = 3
      else if (score >= 6) stars = 2
      else stars = 1
    }

    let reason = ''
    const analysisLine = analysisLines[index]
    if (analysisLine) {
      const parts = analysisLine.split(/[:：]/)
      reason = parts.length > 1
        ? parts.slice(1).join('：')
        : analysisLine.replace(/^\d+[.\u3001]\s*/, '')
      reason = reason.replace(/^[-—]\s*/, '').replaceAll('**', '').trim()
    }

    return {
      reason: reason || undefined,
      score,
      stars,
      title: normalizeTitle(entry.title),
    }
  })

  if (structuredTitles.length > 0) {
    const seen = new Set<string>()
    return structuredTitles.filter((item) => {
      const key = normalizeTitle(item.title)
      if (!isValidTitle(key) || seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 10)
  }

  const sectionStartIndex = lines.findIndex(line =>
    /^(?:##|###)\s*(?:标题推荐|候选标题|推荐标题|标题候选)/.test(line),
  )
  let sectionEndIndex = -1
  if (sectionStartIndex !== -1) {
    for (let index = sectionStartIndex + 1; index < lines.length; index += 1) {
      if (/^##\s+/.test(lines[index])) {
        sectionEndIndex = index
        break
      }
    }
  }

  const isInSection = (index: number): boolean => {
    if (sectionStartIndex === -1) return true
    if (sectionEndIndex === -1) return index >= sectionStartIndex
    return index >= sectionStartIndex && index < sectionEndIndex
  }

  const fallbackTitles: TitleRecommendationItem[] = []
  const seen = new Set<string>()

  for (const [index, line] of lines.entries()) {
    if (!isInSection(index)) continue
    const orderedMatch = line.match(/^\d+[.\u3001]\s+(\S.*)$/)
    const bulletMatch = line.match(/^[-*•]\s+(\S.*)$/)
    const headingMatch = line.match(/^###\s+(\S.*)$/)
    let raw = ''

    if (headingMatch) raw = headingMatch[1].trim()
    else if (orderedMatch) raw = orderedMatch[1].trim()
    else if (bulletMatch) raw = bulletMatch[1].trim()
    if (!raw) continue

    const cleaned = normalizeTitle(
      raw.replaceAll(/[（(]\s*(?:推荐指数|评分|打分|分数|★)[^）)]*[）)]\s*$/g, '').trim(),
    )
    if (!isValidTitle(cleaned) || seen.has(cleaned)) continue
    seen.add(cleaned)
    fallbackTitles.push({title: cleaned})
  }

  return fallbackTitles.slice(0, 10)
}

function htmlToPlainText(html: string): string {
  const dom = new JSDOM(html)
  const container = dom.window.document.querySelector('#output') || dom.window.document.body
  return String(container?.textContent || '').replaceAll(/\s+/g, ' ').trim()
}

export async function loadRecommendationContent(input: {inputPath?: string; text?: string}): Promise<{
  content: string
  inputPath?: string
}> {
  const inlineText = String(input.text || '').trim()
  if (inlineText) return {content: inlineText}

  if (!input.inputPath) {
    throw new Error('Missing content. Provide an input file or pass --text.')
  }

  const inputPath = path.resolve(input.inputPath)
  const fileText = await fs.readFile(inputPath, 'utf8')
  const extension = path.extname(inputPath).toLowerCase()
  const content = extension === '.html' || extension === '.htm' || /<html|<!doctype html|<body/i.test(fileText)
    ? htmlToPlainText(fileText)
    : fileText

  return {
    content: content.trim(),
    inputPath,
  }
}

export async function recommendArticleTitles(input: {
  content: string
  localApiKey?: string
  model?: string
  onToken?: (token: string) => void
  stream?: boolean
}): Promise<TitleRecommendationResult> {
  const rawMarkdown = await runAiChat({
    localApiKey: input.localApiKey,
    messages: buildTitleRecommendationMessages(input.content),
    model: input.model || 'deepseek-chat',
    onToken: input.onToken,
    stream: input.stream,
  })

  return {
    coverPrompt: parseCoverPromptFromMarkdown(rawMarkdown),
    rawMarkdown,
    titles: parseTitlesFromMarkdown(rawMarkdown),
  }
}
