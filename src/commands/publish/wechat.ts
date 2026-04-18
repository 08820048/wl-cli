import {confirm, input as promptInput} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import boxen from 'boxen'
import chalk from 'chalk'
import fs from 'node:fs/promises'
import path from 'node:path'
import ora from 'ora'

import BaseCommand from '../../base-command.js'
import {loadSavedAppConfig} from '../../lib/config/store.js'
import {generateCoverImage, inspectCover} from '../../lib/cover/service.js'
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
    autoCover: Flags.boolean({description: '缺少封面时自动生成一张 AI 封面图'}),
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
      description: '微信 API 代理地址',
    }),
    title: Flags.string({description: '可选：覆盖 HTML 中解析出的标题'}),
    yes: Flags.boolean({char: 'y', description: '非交互模式；缺少必要参数时直接报错'}),
  }

  async run(): Promise<Record<string, unknown> | void> {
    const {args, flags} = await this.parse(PublishWechat)
    const inputPath = path.resolve(args.input)
    const appConfig = this.appConfig || await loadSavedAppConfig(this.config.configDir)
    const appId = await this.resolveRequiredValue(flags.appId, {
      fallbackValue: appConfig?.wechat.appId,
      flagName: 'appId',
      message: '请输入公众号 AppID',
      yes: flags.yes,
    })
    const appSecret = await this.resolveRequiredValue(flags.appSecret, {
      fallbackValue: appConfig?.wechat.appSecret,
      flagName: 'appSecret',
      message: '请输入公众号 AppSecret',
      yes: flags.yes,
    })
    const proxyOrigin = String(flags.proxyOrigin || appConfig?.wechat.proxyOrigin || DEFAULT_PROXY_ORIGIN).trim()
    const spinner = ora(flags.mode === 'publish' ? '正在发布到微信公众号' : '正在推送到公众号草稿箱').start()

    try {
      const htmlDocument = await fs.readFile(inputPath, 'utf8')
      spinner.text = '正在检查封面图'
      const inspectedCover = await inspectCover({
        explicitCoverImage: flags.coverImage,
        fileText: htmlDocument,
        inputPath,
      })
      let {coverImage} = flags

      if (inspectedCover.status === 'missing') {
        let shouldAutoCover = flags.autoCover

        if (!shouldAutoCover && !flags.yes) {
          spinner.stop()
          shouldAutoCover = await confirm({
            default: true,
            message: '当前文章没有可用封面图，是否自动生成一张 AI 封面？',
          })
          spinner.start('正在继续发布流程')
        }

        if (shouldAutoCover) {
          spinner.text = '正在生成 AI 封面图'
          const {outputPath} = await generateCoverImage({
            apiKey: appConfig?.ai.image?.apiKey,
            endpoint: appConfig?.ai.image?.endpoint,
            model: appConfig?.ai.image?.defaultModel,
            outputPath: path.join(path.dirname(inputPath), `${path.parse(inputPath).name}.cover.png`),
            size: appConfig?.ai.image?.defaultSize,
            style: 'editorial',
            summary: inspectedCover.summary,
            title: flags.title || inspectedCover.title || path.parse(inputPath).name,
          })
          coverImage = outputPath
        }
      }

      const result = await publishWechatArticle({
        appId,
        appSecret,
        assetBaseDir: resolveWechatAssetBaseDir(inputPath),
        author: flags.author,
        contentSourceUrl: flags.contentSourceUrl,
        coverImage,
        digest: flags.digest,
        fansCommentOnly: flags.fansCommentOnly,
        htmlDocument,
        log(message) {
          spinner.text = message
        },
        mode: flags.mode as 'draft' | 'publish',
        openComment: flags.openComment,
        proxyOrigin,
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
        `${chalk.bold('cover')}        ${coverImage || inspectedCover.source || 'body-first-image'}`,
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
    input: {fallbackValue?: string; flagName: string; message: string; yes?: boolean},
  ): Promise<string> {
    const directValue = String(rawValue || '').trim()
    if (directValue) return directValue

    const fallbackValue = String(input.fallbackValue || '').trim()
    if (fallbackValue) return fallbackValue

    if (input.yes) {
      this.error(`缺少必要参数 --${input.flagName}`)
    }

    const prompted = String(await promptInput({message: input.message})).trim()
    if (prompted) return prompted

    this.error(`缺少必要参数 --${input.flagName}`)
  }
}
