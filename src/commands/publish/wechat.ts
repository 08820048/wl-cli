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
    input: Args.string({description: 'HTML file path to publish', required: true}),
  }
  static description = 'Publish an HTML document to WeChat drafts or live publishing'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %> ./article.html --mode draft',
    '<%= config.bin %> <%= command.id %> ./article.html --mode publish --appId wx123 --appSecret secret',
  ]
  static flags = {
    appId: Flags.string({description: 'WeChat AppID'}),
    appSecret: Flags.string({description: 'WeChat AppSecret'}),
    author: Flags.string({description: 'Optional article author'}),
    autoCover: Flags.boolean({description: 'Generate an AI cover image when none is available'}),
    contentSourceUrl: Flags.string({description: 'Optional original article URL'}),
    coverImage: Flags.string({description: 'Optional cover image path, URL, or data URI'}),
    digest: Flags.string({description: 'Optional article summary'}),
    fansCommentOnly: Flags.boolean({description: 'Allow comments from followers only'}),
    mode: Flags.string({
      default: 'draft',
      description: 'Publishing mode',
      options: ['draft', 'publish'],
    }),
    openComment: Flags.boolean({description: 'Enable comments'}),
    proxyOrigin: Flags.string({
      description: 'WeChat API proxy origin',
    }),
    title: Flags.string({description: 'Optional title override parsed from HTML'}),
    yes: Flags.boolean({char: 'y', description: 'Non-interactive mode; fail immediately when required values are missing'}),
  }

  async run(): Promise<Record<string, unknown> | void> {
    const {args, flags} = await this.parse(PublishWechat)
    const inputPath = path.resolve(args.input)
    const appConfig = this.appConfig || await loadSavedAppConfig(this.config.configDir)
    const appId = await this.resolveRequiredValue(flags.appId, {
      fallbackValue: appConfig?.wechat.appId,
      flagName: 'appId',
      message: 'Enter the WeChat AppID',
      yes: flags.yes,
    })
    const appSecret = await this.resolveRequiredValue(flags.appSecret, {
      fallbackValue: appConfig?.wechat.appSecret,
      flagName: 'appSecret',
      message: 'Enter the WeChat AppSecret',
      yes: flags.yes,
    })
    const proxyOrigin = String(flags.proxyOrigin || appConfig?.wechat.proxyOrigin || DEFAULT_PROXY_ORIGIN).trim()
    const spinner = ora(flags.mode === 'publish' ? 'Publishing to WeChat' : 'Pushing to WeChat drafts').start()

    try {
      const htmlDocument = await fs.readFile(inputPath, 'utf8')
      spinner.text = 'Checking cover image'
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
            message: 'No usable cover image was found. Generate one with AI?',
          })
          spinner.start('Continuing the publishing flow')
        }

        if (shouldAutoCover) {
          spinner.text = 'Generating AI cover image'
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

      spinner.succeed(flags.mode === 'publish' ? 'WeChat publish request submitted' : 'WeChat draft created')
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
      spinner.fail(flags.mode === 'publish' ? 'WeChat publish failed' : 'WeChat draft creation failed')
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
      this.error(`Missing required flag --${input.flagName}`)
    }

    const prompted = String(await promptInput({message: input.message})).trim()
    if (prompted) return prompted

    this.error(`Missing required flag --${input.flagName}`)
  }
}
