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
    input: Args.string({description: '待复制的 HTML 文件路径', required: true}),
  }
  static description = '将 HTML 文档转换为公众号兼容内容并复制到剪贴板'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %> ./article.html',
    '<%= config.bin %> <%= command.id %> ./article.html --output wechat-inline.html',
  ]
  static flags = {
    output: Flags.string({char: 'o', description: '可选：同时将公众号兼容 HTML 片段写入文件'}),
    printHtml: Flags.boolean({description: '额外将转换后的 HTML 片段输出到 stdout'}),
  }

  async run(): Promise<Record<string, unknown> | void> {
    const {args, flags} = await this.parse(CopyWechat)
    const inputPath = path.resolve(args.input)
    const spinner = ora('正在读取 HTML 文档').start()

    try {
      const htmlDocument = await fs.readFile(inputPath, 'utf8')
      spinner.text = '正在转换为公众号兼容内容'
      const payload = convertHtmlDocumentToWechatInline(htmlDocument)
      let outputPath = ''

      if (flags.output) {
        outputPath = this.resolveOutputPath(flags.output)
        await fs.mkdir(path.dirname(outputPath), {recursive: true})
        await fs.writeFile(outputPath, `${payload.html}\n`, 'utf8')
      }

      spinner.text = '正在写入系统剪贴板'
      await writeWechatHtmlToClipboard(payload)
      spinner.succeed('公众号兼容内容已复制到剪贴板')

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
      spinner.fail('复制到公众号失败')
      this.error(error instanceof Error ? error.message : String(error))
    }
  }

  private resolveOutputPath(outputPath: string): string {
    const absolute = path.resolve(outputPath)
    return absolute.toLowerCase().endsWith('.html') ? absolute : `${absolute}.html`
  }
}
