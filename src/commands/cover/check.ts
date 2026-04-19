import {Args, Flags} from '@oclif/core'
import boxen from 'boxen'
import chalk from 'chalk'

import BaseCommand from '../../base-command.js'
import {inspectCover} from '../../lib/cover/service.js'

export default class CoverCheck extends BaseCommand {
  static args = {
    input: Args.string({description: 'Article HTML or Markdown file path', required: true}),
  }
  static description = 'Check whether an article currently has a usable cover'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %> ./article.html',
    '<%= config.bin %> <%= command.id %> ./article.md --coverImage ./cover.png',
  ]
  static flags = {
    coverImage: Flags.string({description: 'Explicit cover image path or URL'}),
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
          `${chalk.bold('title')}   ${result.title || 'no title detected'}`,
          `${chalk.bold('summary')} ${result.summary || 'no summary detected'}`,
        ].join('\n'),
        {
          borderColor: result.status === 'missing' ? '#e76f51' : '#2a9d8f',
          padding: 1,
        },
      ),
    )
  }
}
