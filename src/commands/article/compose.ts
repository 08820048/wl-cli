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
  static description = 'Run the WeChat article creation workflow'
  static flags = {
    action: Flags.string({
      description: 'Final action',
      options: ['copy', 'draft', 'publish', 'export-html'],
    }),
    appId: Flags.string({description: 'AppID used for WeChat publishing'}),
    appSecret: Flags.string({description: 'AppSecret used for WeChat publishing'}),
    author: Flags.string({description: 'Optional article author for publishing'}),
    autoCover: Flags.boolean({description: 'Automatically generate an AI cover if none is available'}),
    contentSourceUrl: Flags.string({description: 'Optional original article URL for publishing'}),
    coverImage: Flags.string({description: 'Optional cover image path or URL for publishing'}),
    digest: Flags.string({description: 'Optional article summary for publishing'}),
    fansCommentOnly: Flags.boolean({description: 'Allow comments from followers only'}),
    input: Flags.string({char: 'i', description: 'Local Markdown file path'}),
    mode: Flags.string({
      description: 'Layout mode',
      options: ['smart', 'simple', 'minimal'],
    }),
    model: Flags.string({description: 'AI model identifier'}),
    openComment: Flags.boolean({description: 'Enable comments when publishing'}),
    output: Flags.string({char: 'o', description: 'Output HTML file path'}),
    primaryColor: Flags.string({default: '#2a9d8f', description: 'Theme primary color'}),
    prompt: Flags.string({char: 'p', description: 'Article idea or writing prompt'}),
    proxyOrigin: Flags.string({
      description: 'WeChat API proxy origin',
    }),
    theme: Flags.string({char: 't', description: 'Theme ID, for example w022'}),
    title: Flags.string({description: 'Manually specify the article title'}),
    url: Flags.string({description: 'Article source URL'}),
    webSearch: Flags.boolean({description: 'Enable web search during AI generation'}),
    yes: Flags.boolean({char: 'y', description: 'Use defaults for any missing interactive step'}),
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
    const useAi = flags.yes ? true : await confirm({default: true, message: 'Enable the AI writing / rewriting step in this workflow?'})
    const sourceDetail = await this.resolveSourceDetail(sourceMode, flags)
    const resolvedInputPath = sourceMode === 'markdown-file' ? sourceDetail : flags.input
    const resolvedPrompt = sourceMode === 'idea' ? sourceDetail : flags.prompt
    const resolvedUrl = sourceMode === 'url' ? sourceDetail : flags.url
    const spinner = ora('Preparing article input').start()
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
          this.writeStreamHeader('AI is writing the article...')
          markdownText = await createArticleMarkdown({
            localApiKey,
            model,
            onToken: token => streamRenderer.append(token),
            prompt: source.ideaPrompt || source.title,
            stream: true,
            webSearch: flags.webSearch,
          })
          streamRenderer.finish()
          spinner.start('Processing article content')
        }
        else {
          markdownText = createIdeaMarkdownTemplate(source.ideaPrompt || source.title, source.title)
        }
      }

      if (useAi && markdownText.trim()) {
        spinner.stop()
        this.writeStreamHeader(`AI is applying the ${layoutMode} layout...`)
        markdownText = await layoutArticleMarkdown({
          localApiKey,
          markdown: markdownText,
          mode: layoutMode,
          model,
          onToken: token => streamRenderer.append(token),
          stream: true,
        })
        streamRenderer.finish()
        spinner.start('Rendering themed HTML')
      }

      spinner.text = 'Rendering themed HTML'
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
        spinner.text = 'Generating WeChat-compatible content'
        const payload = convertHtmlDocumentToWechatInline(html)
        spinner.text = 'Writing to the system clipboard'
        await writeWechatHtmlToClipboard(payload)
        notices.push('WeChat-compatible content has been copied to the system clipboard.')
      }

      if (action === 'draft' || action === 'publish') {
        spinner.text = 'Checking cover image'
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
              message: 'No usable cover image was found. Generate one with AI?',
            })
            spinner.start('Continuing the publishing flow')
          }

          if (shouldAutoCover) {
            spinner.text = 'Generating AI cover image'
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
        spinner.text = 'Preparing publishing parameters'
        spinner.text = action === 'publish' ? 'Submitting WeChat publish request' : 'Pushing article to WeChat drafts'
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

        notices.push(action === 'publish' ? 'The WeChat article has been submitted for publishing.' : 'A WeChat draft has been created.', `draftMediaId: ${result.draftMediaId}`)
        if (result.publishId) {
          notices.push(`publishId: ${result.publishId}`)
        }

        if (result.previewUrl) {
          notices.push(`preview: ${result.previewUrl}`)
        }

        if (result.articleUrls.length > 0) {
          notices.push(`articleUrls: ${result.articleUrls.join(', ')}`)
        }
      }

      spinner.succeed(
        action === 'publish'
          ? 'The publishing flow completed successfully'
          : action === 'draft'
            ? 'The article has been pushed to WeChat drafts'
            : action === 'copy'
              ? 'The article has been copied for WeChat'
              : 'The article has been exported as HTML',
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
        this.log(`Default output path: ${chalk.cyan(createDefaultHtmlOutputPath({title}))}`)
      }
    }
    catch (error) {
      spinner.fail('Article workflow failed')
      this.error(error instanceof Error ? error.message : String(error))
    }
  }

  private async resolveAction(flags: {action?: string; yes?: boolean}): Promise<ComposeAction> {
    if (flags.action) return flags.action as ComposeAction
    if (flags.yes) return 'export-html'

    return select<ComposeAction>({
      choices: [
        {name: 'Copy to WeChat', value: 'copy'},
        {name: 'Publish to draft', value: 'draft'},
        {name: 'Publish live', value: 'publish'},
        {name: 'Export HTML', value: 'export-html'},
      ],
      message: 'Choose the final action',
    })
  }

  private async resolveLayoutMode(flags: {mode?: string; yes?: boolean}): Promise<LayoutMode> {
    if (flags.mode) return flags.mode as LayoutMode
    if (flags.yes) return 'smart'

    return select<LayoutMode>({
      choices: [
        {name: 'smart - intelligent layout', value: 'smart'},
        {name: 'simple - clean layout', value: 'simple'},
        {name: 'minimal - minimal layout', value: 'minimal'},
      ],
      message: 'Choose a layout mode',
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
      this.error(`Missing required flag --${inputValue.flagName}`)
    }

    const prompted = String(await input({message: inputValue.message})).trim()
    if (prompted) return prompted

    this.error(`Missing required flag --${inputValue.flagName}`)
  }

  private async resolveSourceDetail(
    sourceMode: SourceMode,
    flags: {input?: string; prompt?: string; url?: string; yes?: boolean},
  ): Promise<string> {
    if (sourceMode === 'markdown-file') {
      const directValue = String(flags.input || '').trim()
      if (directValue) return directValue
      if (flags.yes) {
        this.error('Missing required flag --input')
      }

      const prompted = String(await input({message: 'Enter a local Markdown file path'})).trim()
      if (prompted) return prompted

      this.error('Missing required flag --input')
    }

    if (sourceMode === 'url') {
      const directValue = String(flags.url || '').trim()
      if (directValue) return directValue
      if (flags.yes) {
        this.error('Missing required flag --url')
      }

      const prompted = String(await input({message: 'Enter an article source URL'})).trim()
      if (prompted) return prompted

      this.error('Missing required flag --url')
    }

    if (flags.prompt) {
      return String(flags.prompt).trim()
    }

    if (flags.yes) {
      return 'Write an article suitable for a WeChat Official Account'
    }

    return input({message: 'Enter an article idea, topic, or writing prompt'})
  }

  private async resolveSourceMode(flags: {input?: string; url?: string; yes?: boolean}): Promise<SourceMode> {
    if (flags.input) return 'markdown-file'
    if (flags.url) return 'url'
    if (flags.yes) return 'idea'

    return select<SourceMode>({
      choices: [
        {name: 'Start from an idea or topic', value: 'idea'},
        {name: 'Start from a local Markdown file', value: 'markdown-file'},
        {name: 'Start from a URL', value: 'url'},
      ],
      message: 'Choose the input source',
    })
  }

  private async resolveTheme(flags: {theme?: string; yes?: boolean}) {
    if (flags.theme) {
      const matched = findTheme(flags.theme)
      if (!matched) this.error(`Unknown theme: ${flags.theme}`)
      return matched
    }

    if (flags.yes) return findTheme('w022')!

    const chosen = await select<string>({
      choices: THEMES.map(theme => ({name: formatThemeLabel(theme), value: theme.id})),
      message: 'Choose a theme',
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
      message: 'Enter the WeChat AppID',
      yes: input.yes,
    })
    const appSecret = await this.resolveRequiredValue(input.appSecret, {
      fallbackValue: input.appConfig?.wechat?.appSecret,
      flagName: 'appSecret',
      message: 'Enter the WeChat AppSecret',
      yes: input.yes,
    })

    return {appId, appSecret}
  }

  private writeStreamHeader(title: string): void {
    this.log(chalk.cyan(`\n${title}\n`))
  }
}
