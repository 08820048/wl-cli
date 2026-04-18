import {password, input as promptInput} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import boxen from 'boxen'
import chalk from 'chalk'
import path from 'node:path'
import ora from 'ora'

import BaseCommand from '../../base-command.js'
import {loadSavedAppConfig} from '../../lib/config/store.js'
import {createDefaultCoverOutputPath, generateCoverImage, inspectCover} from '../../lib/cover/service.js'

export default class CoverGenerate extends BaseCommand {
  static args = {
    input: Args.string({description: '可选：文章 HTML 或 Markdown 文件路径'}),
  }
  static description = '使用 AI 生成公众号封面图'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %> --title "2026 年 AI 产品趋势"',
    '<%= config.bin %> <%= command.id %> ./article.html --output ./cover.png',
  ]
  static flags = {
    apiKey: Flags.string({description: '图片模型 API Key'}),
    endpoint: Flags.string({description: '图片模型接口地址'}),
    model: Flags.string({description: '图片模型标识'}),
    output: Flags.string({char: 'o', description: '输出图片路径'}),
    prompt: Flags.string({description: '手动覆盖自动生成的图片提示词'}),
    size: Flags.string({description: '图片尺寸，如 1536x1024'}),
    style: Flags.string({
      description: '封面风格',
      options: ['business', 'editorial', 'magazine', 'minimal'],
    }),
    summary: Flags.string({description: '文章摘要'}),
    title: Flags.string({description: '文章标题'}),
  }
  static requiresSetup = false

  async run(): Promise<Record<string, unknown> | void> {
    const {args, flags} = await this.parse(CoverGenerate)
    const appConfig = this.appConfig || await loadSavedAppConfig(this.config.configDir)
    const coverState = args.input
      ? await inspectCover({inputPath: args.input})
      : {source: undefined, status: 'missing' as const, summary: '', title: ''}
    const title = String(flags.title || coverState.title || await promptInput({message: '请输入文章标题'})).trim()
    const summary = String(flags.summary || coverState.summary).trim()
    const outputPath = flags.output
      ? path.resolve(flags.output)
      : createDefaultCoverOutputPath({
          directory: args.input ? path.dirname(path.resolve(args.input)) : process.cwd(),
          title,
        })
    const spinner = ora('正在生成封面图').start()

    try {
      const result = await generateCoverImage({
        apiKey: String(flags.apiKey || appConfig?.ai.image?.apiKey || await password({mask: '*', message: '请输入图片模型 API Key'})).trim(),
        endpoint: flags.endpoint || appConfig?.ai.image?.endpoint,
        model: flags.model || appConfig?.ai.image?.defaultModel,
        outputPath,
        prompt: flags.prompt,
        size: flags.size ?? appConfig?.ai.image?.defaultSize,
        style: flags.style as 'business' | 'editorial' | 'magazine' | 'minimal' | undefined,
        summary,
        title,
      })

      spinner.succeed('封面图生成完成')

      const payload = {
        ...result,
        input: args.input ?? null,
        summary,
        title,
      }

      if (this.jsonEnabled()) return payload

      this.log(
        boxen(
          [
            chalk.bold('Cover Ready'),
            '',
            `${chalk.bold('title')}   ${title}`,
            `${chalk.bold('model')}   ${result.model}`,
            `${chalk.bold('output')}  ${result.outputPath}`,
            `${chalk.bold('source')}  ${result.sourceUrl}`,
          ].join('\n'),
          {
            borderColor: '#2a9d8f',
            padding: 1,
          },
        ),
      )
    } catch (error) {
      spinner.fail('封面图生成失败')
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
