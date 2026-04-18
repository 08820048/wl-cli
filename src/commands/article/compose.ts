import {confirm, input, select} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import boxen from 'boxen'
import chalk from 'chalk'
import fs from 'node:fs/promises'
import path from 'node:path'
import ora from 'ora'

import type {ComposeAction, LayoutMode, SourceMode} from '../../lib/article/types.js'

import BaseCommand from '../../base-command.js'
import {createArticleMarkdown, layoutArticleMarkdown} from '../../lib/ai/service.js'
import {createDefaultHtmlOutputPath, resolveHtmlOutputPath} from '../../lib/article/output.js'
import {createIdeaMarkdownTemplate, resolveArticleSource} from '../../lib/article/source.js'
import {loadSavedAppConfig} from '../../lib/config/store.js'
import {generateCoverImage, inspectCover} from '../../lib/cover/service.js'
import {buildThemedHtmlDocument} from '../../lib/render/document.js'
import {findTheme, formatThemeLabel, THEMES} from '../../lib/theme/catalog.js'
import {MarkdownStreamRenderer} from '../../lib/ui/markdown-stream.js'
import {DEFAULT_PROXY_ORIGIN} from '../../lib/wechat/api.js'
import {writeWechatHtmlToClipboard} from '../../lib/wechat/clipboard.js'
import {convertHtmlDocumentToWechatInline} from '../../lib/wechat/html.js'
import {publishWechatArticle, resolveWechatAssetBaseDir} from '../../lib/wechat/publish.js'

export default class ArticleCompose extends BaseCommand {
  static description = '运行公众号文章创作工作流向导'
  static flags = {
    action: Flags.string({
      description: '最终动作',
      options: ['copy', 'draft', 'publish', 'export-html'],
    }),
    appId: Flags.string({description: '发布到公众号时使用的 AppID'}),
    appSecret: Flags.string({description: '发布到公众号时使用的 AppSecret'}),
    author: Flags.string({description: '可选：发布时的文章作者'}),
    autoCover: Flags.boolean({description: '缺少封面时自动生成一张 AI 封面图'}),
    contentSourceUrl: Flags.string({description: '可选：发布时的原文地址'}),
    coverImage: Flags.string({description: '可选：发布时的封面图片路径或 URL'}),
    digest: Flags.string({description: '可选：发布时的文章摘要'}),
    fansCommentOnly: Flags.boolean({description: '发布时仅粉丝可评论'}),
    input: Flags.string({char: 'i', description: '本地 Markdown 文件路径'}),
    mode: Flags.string({
      description: '排版模式',
      options: ['smart', 'simple', 'minimal'],
    }),
    model: Flags.string({description: 'AI 模型标识'}),
    openComment: Flags.boolean({description: '发布时启用评论'}),
    output: Flags.string({char: 'o', description: '输出 HTML 文件路径'}),
    primaryColor: Flags.string({default: '#2a9d8f', description: '主题主色'}),
    prompt: Flags.string({char: 'p', description: '文章创意或创作提示词'}),
    proxyOrigin: Flags.string({
      description: '微信 API 代理地址',
    }),
    theme: Flags.string({char: 't', description: '主题 ID，如 w022'}),
    title: Flags.string({description: '手动指定文章标题'}),
    url: Flags.string({description: '文章来源 URL'}),
    webSearch: Flags.boolean({description: 'AI 创作时启用联网搜索'}),
    yes: Flags.boolean({char: 'y', description: '未提供的步骤使用默认值'}),
  }

  // eslint-disable-next-line complexity
  async run(): Promise<void> {
    const {flags} = await this.parse(ArticleCompose)
    const appConfig = this.appConfig || await loadSavedAppConfig(this.config.configDir)
    const localApiKey = appConfig?.ai.apiKey
    const model = String(flags.model || appConfig?.ai.defaultModel || 'qwen3-max').trim()
    const proxyOrigin = String(flags.proxyOrigin || appConfig?.wechat.proxyOrigin || DEFAULT_PROXY_ORIGIN).trim()
    const sourceMode = await this.resolveSourceMode(flags)
    const layoutMode = await this.resolveLayoutMode(flags)
    const theme = await this.resolveTheme(flags)
    const action = await this.resolveAction(flags)
    const useAi = flags.yes ? true : await confirm({default: true, message: '是否在流程中启用 AI 创作/改写步骤？'})
    const sourceDetail = await this.resolveSourceDetail(sourceMode, flags)
    const resolvedInputPath = sourceMode === 'markdown-file' ? sourceDetail : flags.input
    const resolvedPrompt = sourceMode === 'idea' ? sourceDetail : flags.prompt
    const resolvedUrl = sourceMode === 'url' ? sourceDetail : flags.url
    const spinner = ora('正在准备文章输入').start()
    const streamRenderer = new MarkdownStreamRenderer()

    try {
      const source = await resolveArticleSource({
        inputPath: resolvedInputPath,
        prompt: resolvedPrompt,
        title: flags.title,
        url: resolvedUrl,
      })

      let markdownText = source.markdown

      if (source.mode === 'idea') {
        if (useAi) {
          spinner.stop()
          this.writeStreamHeader('AI 正在创作文章...')
          markdownText = await createArticleMarkdown({
            localApiKey,
            model,
            onToken: token => streamRenderer.append(token),
            prompt: source.ideaPrompt || source.title,
            stream: true,
            webSearch: flags.webSearch,
          })
          streamRenderer.finish()
          spinner.start('正在处理文章内容')
        }
        else {
          markdownText = createIdeaMarkdownTemplate(source.ideaPrompt || source.title, source.title)
        }
      }

      if (useAi && markdownText.trim()) {
        spinner.stop()
        this.writeStreamHeader(`AI 正在应用 ${layoutMode} 排版...`)
        markdownText = await layoutArticleMarkdown({
          localApiKey,
          markdown: markdownText,
          mode: layoutMode,
          model,
          onToken: token => streamRenderer.append(token),
          stream: true,
        })
        streamRenderer.finish()
        spinner.start('正在渲染带主题的 HTML')
      }

      spinner.text = '正在渲染带主题的 HTML'
      const {html, title} = await buildThemedHtmlDocument({
        countStatus: true,
        fallbackTitle: source.title,
        markdownText,
        primaryColor: flags.primaryColor,
        themeId: theme.id,
      })

      const outputPath = resolveHtmlOutputPath(flags.output, {
        inputPath: resolvedInputPath,
        title,
      })

      await fs.mkdir(path.dirname(outputPath), {recursive: true})
      await fs.writeFile(outputPath, `${html}\n`, 'utf8')

      const notices: string[] = []
      if (action === 'copy') {
        spinner.text = '正在生成公众号兼容内容'
        const payload = convertHtmlDocumentToWechatInline(html)
        spinner.text = '正在写入系统剪贴板'
        await writeWechatHtmlToClipboard(payload)
        notices.push('公众号兼容内容已复制到系统剪贴板。')
      }

      if (action === 'draft' || action === 'publish') {
        spinner.text = '正在检查封面图'
        const inspectedCover = await inspectCover({
          explicitCoverImage: flags.coverImage,
          fileText: html,
          inputPath: outputPath,
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
            const {outputPath: generatedCoverPath} = await generateCoverImage({
              apiKey: appConfig?.ai.image?.apiKey,
              endpoint: appConfig?.ai.image?.endpoint,
              model: appConfig?.ai.image?.defaultModel,
              outputPath: path.join(path.dirname(outputPath), `${path.parse(outputPath).name}.cover.png`),
              size: appConfig?.ai.image?.defaultSize,
              style: 'editorial',
              summary: inspectedCover.summary,
              title: flags.title || title,
            })
            coverImage = generatedCoverPath
            notices.push(`cover: ${coverImage}`)
          }
        }

        const publishSettings = await this.resolveWechatPublishSettings({
          appConfig: appConfig || undefined,
          appId: flags.appId,
          appSecret: flags.appSecret,
          yes: flags.yes,
        })
        spinner.text = '正在准备发布参数'
        spinner.text = action === 'publish' ? '正在提交公众号发布' : '正在推送到公众号草稿箱'
        const result = await publishWechatArticle({
          appId: publishSettings.appId,
          appSecret: publishSettings.appSecret,
          assetBaseDir: resolveWechatAssetBaseDir(outputPath),
          author: flags.author,
          contentSourceUrl: flags.contentSourceUrl || source.url,
          coverImage,
          digest: flags.digest,
          fansCommentOnly: flags.fansCommentOnly,
          htmlDocument: html,
          log(message) {
            spinner.text = message
          },
          mode: action,
          openComment: flags.openComment,
          proxyOrigin,
          title: flags.title || title,
        })

        notices.push(action === 'publish' ? '公众号文章已提交发布。' : '公众号草稿已创建。', `draftMediaId: ${result.draftMediaId}`)
        if (result.publishId) {
          notices.push(`publishId: ${result.publishId}`)
        }

        if (result.previewUrl) {
          notices.push(`链接: ${result.previewUrl}`)
        }

        if (result.articleUrls.length > 0) {
          notices.push(`articleUrls: ${result.articleUrls.join(', ')}`)
        }
      }

      spinner.succeed(
        action === 'publish'
          ? '文章已完成发布链路'
          : action === 'draft'
            ? '文章已推送到公众号草稿箱'
            : action === 'copy'
              ? '文章已复制到公众号剪贴板'
              : '文章已导出为 HTML',
      )

      this.log(
        boxen(
          [
            chalk.bold('Article Ready'),
            '',
            `${chalk.bold('title')}   ${title}`,
            `${chalk.bold('source')}  ${source.mode} · ${source.sourceLabel}`,
            `${chalk.bold('ai')}      ${useAi ? 'enabled' : 'disabled'}`,
            `${chalk.bold('layout')}  ${layoutMode}`,
            `${chalk.bold('theme')}   ${theme.id} ${theme.name}`,
            `${chalk.bold('action')}  ${action}`,
            `${chalk.bold('output')}  ${outputPath}`,
            ...(notices.length > 0 ? ['', ...notices] : []),
          ].join('\n'),
          {
            borderColor: '#2a9d8f',
            padding: 1,
          },
        ),
      )

      if (action === 'export-html' && !flags.output && !flags.input) {
        this.log(`默认输出路径：${chalk.cyan(createDefaultHtmlOutputPath({title}))}`)
      }
    }
    catch (error) {
      spinner.fail('文章工作流执行失败')
      this.error(error instanceof Error ? error.message : String(error))
    }
  }

  private async resolveAction(flags: {action?: string; yes?: boolean}): Promise<ComposeAction> {
    if (flags.action) return flags.action as ComposeAction
    if (flags.yes) return 'export-html'

    return select<ComposeAction>({
      choices: [
        {name: '复制到公众号', value: 'copy'},
        {name: '发布到草稿箱', value: 'draft'},
        {name: '正式发布', value: 'publish'},
        {name: '导出 HTML', value: 'export-html'},
      ],
      message: '选择最终动作',
    })
  }

  private async resolveLayoutMode(flags: {mode?: string; yes?: boolean}): Promise<LayoutMode> {
    if (flags.mode) return flags.mode as LayoutMode
    if (flags.yes) return 'smart'

    return select<LayoutMode>({
      choices: [
        {name: 'smart - 智能排版', value: 'smart'},
        {name: 'simple - 基础排版', value: 'simple'},
        {name: 'minimal - 极简排版', value: 'minimal'},
      ],
      message: '选择排版模式',
    })
  }

  private async resolveRequiredValue(
    rawValue: string | undefined,
    inputValue: {fallbackValue?: string; flagName: string; message: string; yes?: boolean},
  ): Promise<string> {
    const directValue = String(rawValue || '').trim()
    if (directValue) return directValue

    const fallbackValue = String(inputValue.fallbackValue || '').trim()
    if (fallbackValue) return fallbackValue

    if (inputValue.yes) {
      this.error(`缺少必要参数 --${inputValue.flagName}`)
    }

    const prompted = String(await input({message: inputValue.message})).trim()
    if (prompted) return prompted

    this.error(`缺少必要参数 --${inputValue.flagName}`)
  }

  private async resolveSourceDetail(
    sourceMode: SourceMode,
    flags: {input?: string; prompt?: string; url?: string; yes?: boolean},
  ): Promise<string> {
    if (sourceMode === 'markdown-file') {
      const directValue = String(flags.input || '').trim()
      if (directValue) return directValue
      if (flags.yes) {
        this.error('缺少必要参数 --input')
      }

      const prompted = String(await input({message: '输入本地 Markdown 文件路径'})).trim()
      if (prompted) return prompted

      this.error('缺少必要参数 --input')
    }

    if (sourceMode === 'url') {
      const directValue = String(flags.url || '').trim()
      if (directValue) return directValue
      if (flags.yes) {
        this.error('缺少必要参数 --url')
      }

      const prompted = String(await input({message: '输入文章来源 URL'})).trim()
      if (prompted) return prompted

      this.error('缺少必要参数 --url')
    }

    if (flags.prompt) {
      return String(flags.prompt).trim()
    }

    if (flags.yes) {
      return '写一篇适合公众号发布的文章'
    }

    return input({message: '输入文章创意、主题或创作提示词'})
  }

  private async resolveSourceMode(flags: {input?: string; url?: string; yes?: boolean}): Promise<SourceMode> {
    if (flags.input) return 'markdown-file'
    if (flags.url) return 'url'
    if (flags.yes) return 'idea'

    return select<SourceMode>({
      choices: [
        {name: '从创意主题开始', value: 'idea'},
        {name: '从本地 Markdown 文件开始', value: 'markdown-file'},
        {name: '从 URL 开始', value: 'url'},
      ],
      message: '选择输入来源',
    })
  }

  private async resolveTheme(flags: {theme?: string; yes?: boolean}) {
    if (flags.theme) {
      const matched = findTheme(flags.theme)
      if (!matched) this.error(`未知主题：${flags.theme}`)
      return matched
    }

    if (flags.yes) return findTheme('w022')!

    const chosen = await select<string>({
      choices: THEMES.map(theme => ({name: formatThemeLabel(theme), value: theme.id})),
      message: '选择主题',
      pageSize: 12,
    })

    return findTheme(chosen)!
  }

  private async resolveWechatPublishSettings(input: {
    appConfig?: {wechat?: {appId?: string; appSecret?: string}}
    appId?: string
    appSecret?: string
    yes?: boolean
  }): Promise<{appId: string; appSecret: string}> {
    const appId = await this.resolveRequiredValue(input.appId, {
      fallbackValue: input.appConfig?.wechat?.appId,
      flagName: 'appId',
      message: '请输入公众号 AppID',
      yes: input.yes,
    })
    const appSecret = await this.resolveRequiredValue(input.appSecret, {
      fallbackValue: input.appConfig?.wechat?.appSecret,
      flagName: 'appSecret',
      message: '请输入公众号 AppSecret',
      yes: input.yes,
    })

    return {appId, appSecret}
  }

  private writeStreamHeader(title: string): void {
    this.log(chalk.cyan(`\n${title}\n`))
  }
}
