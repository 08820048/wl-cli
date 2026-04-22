import {input as promptInput} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import boxen from 'boxen'
import chalk from 'chalk'
import fs from 'node:fs/promises'
import path from 'node:path'
import ora from 'ora'

import BaseCommand from '../../base-command.js'
import {loadRecommendationContent, recommendArticleTitles} from '../../lib/ai/title.js'
import {loadSavedAppConfig} from '../../lib/config/store.js'
import {recommendPixabayCover} from '../../lib/cover/recommend.js'
import {MarkdownStreamRenderer} from '../../lib/ui/markdown-stream.js'

export default class AiTitle extends BaseCommand {
  static args = {
    input: Args.string({description: 'Optional article Markdown or HTML file path'}),
  }
  static description = 'Generate title recommendations for a WeChat article'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %> ./article.md',
    '<%= config.bin %> <%= command.id %> --text "Paste the full article body here"',
    '<%= config.bin %> <%= command.id %> ./article.md --output ./titles.md',
  ]
  static flags = {
    coverApiKey: Flags.string({description: 'Pixabay API key used for the optional cover recommendation'}),
    model: Flags.string({description: 'AI model identifier'}),
    output: Flags.string({char: 'o', description: 'Optional file path to save the raw recommendation markdown'}),
    text: Flags.string({description: 'Article text or Markdown to analyze'}),
    withCover: Flags.boolean({allowNo: true, default: true, description: 'Also fetch a cover recommendation from Pixabay'}),
  }

  async run(): Promise<Record<string, unknown> | void> {
    const {args, flags} = await this.parse(AiTitle)
    const appConfig = this.appConfig || await loadSavedAppConfig(this.config.configDir)
    const model = String(flags.model || appConfig?.ai.defaultModel || 'deepseek-chat').trim()
    const localApiKey = appConfig?.ai.apiKey
    const contentSource = flags.text
      ? {content: String(flags.text).trim(), inputPath: undefined}
      : args.input
        ? await loadRecommendationContent({inputPath: args.input})
        : await loadRecommendationContent({
            text: await promptInput({message: 'Paste the article content to analyze'}),
          })
    const spinner = ora('Generating title recommendations').start()
    const streamRenderer = new MarkdownStreamRenderer()

    try {
      spinner.stop()
      this.writeStreamHeader('AI is generating title recommendations...')
      const result = await recommendArticleTitles({
        content: contentSource.content,
        localApiKey,
        model,
        onToken: token => streamRenderer.append(token),
        stream: true,
      })
      streamRenderer.finish()

      let coverRecommendation = null
      if (flags.withCover && result.coverPrompt) {
        const coverSpinner = ora('Fetching the recommended cover image').start()
        try {
          coverRecommendation = await recommendPixabayCover({
            apiKey: flags.coverApiKey,
            orientation: result.coverPrompt.orientation,
            query: result.coverPrompt.query,
          })
          coverSpinner.succeed(
            coverRecommendation
              ? 'Cover recommendation ready'
              : 'No suitable cover recommendation was found',
          )
        } catch (error) {
          coverSpinner.fail('Cover recommendation failed')
          this.warn(error instanceof Error ? error.message : String(error))
        }
      }

      if (flags.output) {
        const outputPath = path.resolve(flags.output)
        await fs.mkdir(path.dirname(outputPath), {recursive: true})
        await fs.writeFile(outputPath, `${result.rawMarkdown.trim()}\n`, 'utf8')
      }

      const payload = {
        coverPrompt: result.coverPrompt,
        coverRecommendation,
        input: contentSource.inputPath || null,
        model,
        output: flags.output ? path.resolve(flags.output) : null,
        titles: result.titles,
      }

      if (this.jsonEnabled()) return payload

      this.log(
        boxen(
          [
            chalk.bold('Title Recommendations'),
            '',
            ...result.titles.flatMap((item, index) => {
              const titleLine = `${index + 1}. ${item.stars ? `${'★'.repeat(item.stars)} ` : ''}${item.title}`
              const detailLine = typeof item.score === 'number'
                ? `   score: ${item.score}${item.reason ? ` · ${item.reason}` : ''}`
                : item.reason
                  ? `   ${item.reason}`
                  : ''
              return detailLine ? [titleLine, detailLine] : [titleLine]
            }),
            result.titles.length === 0 ? 'No titles were parsed from the model output.' : '',
            '',
            chalk.bold('Cover Query'),
            `${chalk.bold('query')}        ${result.coverPrompt?.query || 'none'}`,
            `${chalk.bold('orientation')}  ${result.coverPrompt?.orientation || 'none'}`,
            coverRecommendation
              ? `${chalk.bold('preview')}      ${coverRecommendation.previewUrl}`
              : `${chalk.bold('preview')}      none`,
            coverRecommendation
              ? `${chalk.bold('source')}       ${coverRecommendation.pageUrl}`
              : `${chalk.bold('source')}       none`,
            flags.output ? `${chalk.bold('raw output')}   ${path.resolve(flags.output)}` : '',
          ].filter(Boolean).join('\n'),
          {
            borderColor: '#2a9d8f',
            padding: 1,
          },
        ),
      )
    } catch (error) {
      spinner.fail('Title recommendation failed')
      this.error(error instanceof Error ? error.message : String(error))
    }
  }

  private writeStreamHeader(title: string): void {
    this.log(chalk.cyan(`\n${title}\n`))
  }
}
