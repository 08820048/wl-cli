import {Args, Flags} from '@oclif/core'
import boxen from 'boxen'
import chalk from 'chalk'
import fs from 'node:fs/promises'
import path from 'node:path'
import ora from 'ora'

import BaseCommand from '../../base-command.js'
import {writeWechatHtmlToClipboard} from '../../lib/wechat/clipboard.js'
import {convertHtmlDocumentToWechatInline} from '../../lib/wechat/html.js'

export default class CopyWechat extends BaseCommand {
  static args = {
    input: Args.string({description: 'HTML file path to copy', required: true}),
  }
  static description = 'Convert an HTML document into WeChat-compatible content and copy it to the clipboard'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %> ./article.html',
    '<%= config.bin %> <%= command.id %> ./article.html --output wechat-inline.html',
  ]
  static flags = {
    output: Flags.string({char: 'o', description: 'Optional file path to also save the converted WeChat HTML fragment'}),
    printHtml: Flags.boolean({description: 'Also print the converted HTML fragment to stdout'}),
  }

  async run(): Promise<Record<string, unknown> | void> {
    const {args, flags} = await this.parse(CopyWechat)
    const inputPath = path.resolve(args.input)
    const spinner = ora('Reading HTML document').start()

    try {
      const htmlDocument = await fs.readFile(inputPath, 'utf8')
      spinner.text = 'Converting to WeChat-compatible content'
      const payload = convertHtmlDocumentToWechatInline(htmlDocument)
      let outputPath = ''

      if (flags.output) {
        outputPath = this.resolveOutputPath(flags.output)
        await fs.mkdir(path.dirname(outputPath), {recursive: true})
        await fs.writeFile(outputPath, `${payload.html}\n`, 'utf8')
      }

      spinner.text = 'Writing to the system clipboard'
      await writeWechatHtmlToClipboard(payload)
      spinner.succeed('WeChat-compatible content copied to the clipboard')

      if (flags.printHtml) {
        this.log(payload.html)
      }

      const result = {
        inputPath,
        outputPath,
        plainTextLength: payload.plainText.length,
        title: payload.title,
      }

      if (this.jsonEnabled()) return result

      this.log(
        boxen(
          [
            chalk.bold('WeChat Copy Ready'),
            '',
            `${chalk.bold('title')}   ${payload.title}`,
            `${chalk.bold('input')}   ${inputPath}`,
            `${chalk.bold('output')}  ${outputPath || '-'}`,
            `${chalk.bold('plain')}   ${payload.plainText.length} chars`,
          ].join('\n'),
          {
            borderColor: '#2a9d8f',
            padding: 1,
          },
        ),
      )
    } catch (error) {
      spinner.fail('Copy to WeChat failed')
      this.error(error instanceof Error ? error.message : String(error))
    }
  }

  private resolveOutputPath(outputPath: string): string {
    const absolute = path.resolve(outputPath)
    return absolute.toLowerCase().endsWith('.html') ? absolute : `${absolute}.html`
  }
}
