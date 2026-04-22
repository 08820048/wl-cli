import {input as promptInput} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import boxen from 'boxen'
import chalk from 'chalk'
import ora from 'ora'

import BaseCommand from '../../base-command.js'
import {loadRecommendationContent, recommendArticleTitles} from '../../lib/ai/title.js'
import {loadSavedAppConfig} from '../../lib/config/store.js'
import {recommendPixabayCover} from '../../lib/cover/recommend.js'

export default class CoverRecommend extends BaseCommand {
  static args = {
    input: Args.string({description: 'Optional article Markdown or HTML file path'}),
  }
  static description = 'Recommend a cover image for an article'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %> ./article.md',
    '<%= config.bin %> <%= command.id %> --query "ai workflow laptop dashboard"',
  ]
  static flags = {
    apiKey: Flags.string({description: 'Pixabay API key'}),
    model: Flags.string({description: 'AI model identifier used when deriving a query from article content'}),
    orientation: Flags.string({
      description: 'Force a specific image orientation',
      options: ['all', 'horizontal', 'vertical'],
    }),
    query: Flags.string({description: 'Use this query directly instead of deriving one from the article'}),
    text: Flags.string({description: 'Article text or Markdown used to derive a cover recommendation'}),
  }

  async run(): Promise<Record<string, unknown> | void> {
    const {args, flags} = await this.parse(CoverRecommend)
    const appConfig = this.appConfig || await loadSavedAppConfig(this.config.configDir)
    const model = String(flags.model || appConfig?.ai.defaultModel || 'deepseek-chat').trim()
    const localApiKey = appConfig?.ai.apiKey
    const spinner = ora(flags.query ? 'Fetching cover recommendation' : 'Deriving a cover query').start()

    try {
      let query = String(flags.query || '').trim()
      let orientation = (flags.orientation || 'horizontal') as 'all' | 'horizontal' | 'vertical'
      let inputPath: null | string = null

      if (!query) {
        const source = flags.text
          ? {content: String(flags.text).trim(), inputPath: undefined}
          : args.input
            ? await loadRecommendationContent({inputPath: args.input})
            : await loadRecommendationContent({
                text: await promptInput({message: 'Paste the article content for cover recommendation'}),
              })
        inputPath = source.inputPath || null
        const titleResult = await recommendArticleTitles({
          content: source.content,
          localApiKey,
          model,
          stream: false,
        })
        query = String(titleResult.coverPrompt?.query || '').trim()
        orientation = titleResult.coverPrompt?.orientation || orientation
        if (!query) {
          throw new Error('The AI response did not contain a usable [COVER] query block')
        }
      }

      spinner.text = 'Fetching cover recommendation from Pixabay'
      const recommendation = await recommendPixabayCover({
        apiKey: flags.apiKey,
        orientation,
        query,
      })

      if (!recommendation) {
        throw new Error('No suitable cover recommendation was found')
      }

      spinner.succeed('Cover recommendation ready')

      const payload = {
        input: inputPath,
        ...recommendation,
      }

      if (this.jsonEnabled()) return payload

      this.log(
        boxen(
          [
            chalk.bold('Cover Recommendation'),
            '',
            `${chalk.bold('query')}        ${recommendation.query}`,
            `${chalk.bold('orientation')}  ${recommendation.orientation}`,
            `${chalk.bold('preview')}      ${recommendation.previewUrl}`,
            `${chalk.bold('source')}       ${recommendation.pageUrl}`,
            `${chalk.bold('tags')}         ${recommendation.tags || 'none'}`,
            `${chalk.bold('user')}         ${recommendation.user || 'unknown'}`,
          ].join('\n'),
          {
            borderColor: '#2a9d8f',
            padding: 1,
          },
        ),
      )
    } catch (error) {
      spinner.fail('Cover recommendation failed')
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
