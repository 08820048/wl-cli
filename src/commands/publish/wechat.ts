import {input as promptInput} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import boxen from 'boxen'
import chalk from 'chalk'
import fs from 'node:fs/promises'
import path from 'node:path'
import ora from 'ora'

import BaseCommand from '../../base-command.js'
import {DEFAULT_PROXY_ORIGIN} from '../../lib/wechat/api.js'
import {publishWechatArticle, resolveWechatAssetBaseDir} from '../../lib/wechat/publish.js'

export default class PublishWechat extends BaseCommand {
  static args = {
    input: Args.string({description: '待发布的 HTML 文件路径', required: true}),
  }
  static description = '将 HTML 文档发布到微信公众号草稿箱或正式发布'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %> ./article.html --mode draft',
    '<%= config.bin %> <%= command.id %> ./article.html --mode publish --appId wx123 --appSecret secret',
  ]
  static flags = {
    appId: Flags.string({description: '公众号 AppID'}),
    appSecret: Flags.string({description: '公众号 AppSecret'}),
    author: Flags.string({description: '可选：文章作者'}),
    contentSourceUrl: Flags.string({description: '可选：原文地址'}),
    coverImage: Flags.string({description: '可选：封面图片路径、URL 或 data URI'}),
    digest: Flags.string({description: '可选：文章摘要'}),
    fansCommentOnly: Flags.boolean({description: '仅粉丝可评论'}),
    mode: Flags.string({
      default: 'draft',
      description: '发布模式',
      options: ['draft', 'publish'],
    }),
    openComment: Flags.boolean({description: '启用评论'}),
    proxyOrigin: Flags.string({
      default: DEFAULT_PROXY_ORIGIN,
      description: '微信 API 代理地址',
    }),
    title: Flags.string({description: '可选：覆盖 HTML 中解析出的标题'}),
    yes: Flags.boolean({char: 'y', description: '非交互模式；缺少必要参数时直接报错'}),
  }

  async run(): Promise<Record<string, unknown> | void> {
    const {args, flags} = await this.parse(PublishWechat)
    const inputPath = path.resolve(args.input)
    const appId = await this.resolveRequiredValue(flags.appId, {
      flagName: 'appId',
      message: '请输入公众号 AppID',
      yes: flags.yes,
    })
    const appSecret = await this.resolveRequiredValue(flags.appSecret, {
      flagName: 'appSecret',
      message: '请输入公众号 AppSecret',
      yes: flags.yes,
    })
    const spinner = ora(flags.mode === 'publish' ? '正在发布到微信公众号' : '正在推送到公众号草稿箱').start()

    try {
      const htmlDocument = await fs.readFile(inputPath, 'utf8')
      const result = await publishWechatArticle({
        appId,
        appSecret,
        assetBaseDir: resolveWechatAssetBaseDir(inputPath),
        author: flags.author,
        contentSourceUrl: flags.contentSourceUrl,
        coverImage: flags.coverImage,
        digest: flags.digest,
        fansCommentOnly: flags.fansCommentOnly,
        htmlDocument,
        log(message) {
          spinner.text = message
        },
        mode: flags.mode as 'draft' | 'publish',
        openComment: flags.openComment,
        proxyOrigin: flags.proxyOrigin,
        title: flags.title,
      })

      spinner.succeed(flags.mode === 'publish' ? '公众号文章已提交发布' : '公众号草稿已创建')
      const payload = {
        ...result,
        inputPath,
        mode: flags.mode,
      }

      if (this.jsonEnabled()) return payload

      const lines = [
        chalk.bold(flags.mode === 'publish' ? 'WeChat Publish Ready' : 'WeChat Draft Ready'),
        '',
        `${chalk.bold('title')}        ${result.title}`,
        `${chalk.bold('input')}        ${inputPath}`,
        `${chalk.bold('draftMediaId')} ${result.draftMediaId}`,
      ]

      if (result.publishId) {
        lines.push(`${chalk.bold('publishId')}    ${result.publishId}`)
      }

      if (result.previewUrl) {
        lines.push(`${chalk.bold('preview')}      ${result.previewUrl}`)
      }

      if (result.articleUrls.length > 0) {
        lines.push(`${chalk.bold('articleUrls')}  ${result.articleUrls.join(', ')}`)
      }

      this.log(
        boxen(lines.join('\n'), {
          borderColor: '#e76f51',
          padding: 1,
        }),
      )
    } catch (error) {
      spinner.fail(flags.mode === 'publish' ? '公众号发布失败' : '公众号草稿创建失败')
      this.error(error instanceof Error ? error.message : String(error))
    }
  }

  private async resolveRequiredValue(
    rawValue: string | undefined,
    input: {flagName: string; message: string; yes?: boolean},
  ): Promise<string> {
    const directValue = String(rawValue || '').trim()
    if (directValue) return directValue

    if (input.yes) {
      this.error(`缺少必要参数 --${input.flagName}`)
    }

    const prompted = String(await promptInput({message: input.message})).trim()
    if (prompted) return prompted

    this.error(`缺少必要参数 --${input.flagName}`)
  }
}
