import {input as promptInput} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import chalk from 'chalk'
import fs from 'node:fs/promises'
import path from 'node:path'
import ora from 'ora'

import type {LayoutMode} from '../../lib/article/types.js'

import BaseCommand from '../../base-command.js'
import {createArticleMarkdown, layoutArticleMarkdown} from '../../lib/ai/service.js'

export default class AiCreate extends BaseCommand {
  static description = '用 AI 创作公众号文章 Markdown'
  static examples = [
    '<%= config.bin %> <%= command.id %> --prompt "写一篇关于个人知识管理的公众号文章"',
    '<%= config.bin %> <%= command.id %> --prompt "写一篇产品复盘" --layout smart --output article.md',
  ]
  static flags = {
    layout: Flags.string({
      description: '生成后是否再做一次 Markdown 排版',
      options: ['minimal', 'simple', 'smart'],
    }),
    model: Flags.string({default: 'qwen3-max', description: '使用的 AI 模型标识'}),
    output: Flags.string({char: 'o', description: '输出 Markdown 文件路径'}),
    prompt: Flags.string({char: 'p', description: '文章主题或创作提示词'}),
    webSearch: Flags.boolean({description: '创作时启用联网搜索'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AiCreate)
    const prompt = String(flags.prompt || await promptInput({message: '请输入文章主题或创作提示词'})).trim()
    const spinner = ora('正在调用 AI 创作文章').start()

    try {
      let markdown = await createArticleMarkdown({
        model: flags.model,
        prompt,
        webSearch: flags.webSearch,
      })

      if (flags.layout) {
        spinner.text = `正在应用 ${flags.layout} 排版`
        markdown = await layoutArticleMarkdown({
          markdown,
          mode: flags.layout as LayoutMode,
          model: flags.model,
        })
      }

      spinner.succeed('AI 创作完成')

      if (flags.output) {
        const outputPath = path.resolve(flags.output)
        await fs.mkdir(path.dirname(outputPath), {recursive: true})
        await fs.writeFile(outputPath, `${markdown.trim()}\n`, 'utf8')
        this.log(`已写入 ${chalk.cyan(outputPath)}`)
        return
      }

      this.log(markdown.trim())
    } catch (error) {
      spinner.fail('AI 创作失败')
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
