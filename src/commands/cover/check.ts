import {Args, Flags} from '@oclif/core'
import boxen from 'boxen'
import chalk from 'chalk'

import BaseCommand from '../../base-command.js'
import {inspectCover} from '../../lib/cover/service.js'

export default class CoverCheck extends BaseCommand {
  static args = {
    input: Args.string({description: '文章 HTML 或 Markdown 文件路径', required: true}),
  }
  static description = '检查文章当前是否具备可用封面'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %> ./article.html',
    '<%= config.bin %> <%= command.id %> ./article.md --coverImage ./cover.png',
  ]
  static flags = {
    coverImage: Flags.string({description: '显式指定封面图路径或 URL'}),
  }
  static requiresSetup = false

  async run(): Promise<Record<string, unknown> | void> {
    const {args, flags} = await this.parse(CoverCheck)
    const result = await inspectCover({
      explicitCoverImage: flags.coverImage,
      inputPath: args.input,
    })

    const payload = {
      input: args.input,
      source: result.source || null,
      status: result.status,
      summary: result.summary,
      title: result.title,
    }

    if (this.jsonEnabled()) return payload

    this.log(
      boxen(
        [
          chalk.bold('Cover Check'),
          '',
          `${chalk.bold('status')}  ${result.status}`,
          `${chalk.bold('source')}  ${result.source || 'none'}`,
          `${chalk.bold('title')}   ${result.title || '未解析到标题'}`,
          `${chalk.bold('summary')} ${result.summary || '未解析到摘要'}`,
        ].join('\n'),
        {
          borderColor: result.status === 'missing' ? '#e76f51' : '#2a9d8f',
          padding: 1,
        },
      ),
    )
  }
}
