import {password, input as promptInput} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import boxen from 'boxen'
import chalk from 'chalk'
import path from 'node:path'
import ora from 'ora'

import BaseCommand from '../../base-command.js'
import {loadSavedAppConfig} from '../../lib/config/store.js'
import {createDefaultCoverOutputPath, generateCoverImage, inspectCover} from '../../lib/cover/service.js'

export default class CoverGenerate extends BaseCommand {
  static args = {
    input: Args.string({description: 'Optional article HTML or Markdown file path'}),
  }
  static description = 'Generate a WeChat cover image with AI'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %> --title "AI product trends in 2026"',
    '<%= config.bin %> <%= command.id %> ./article.html --output ./cover.png',
  ]
  static flags = {
    apiKey: Flags.string({description: 'Image model API key'}),
    endpoint: Flags.string({description: 'Image model endpoint'}),
    model: Flags.string({description: 'Image model identifier'}),
    output: Flags.string({char: 'o', description: 'Output image path'}),
    prompt: Flags.string({description: 'Manually override the generated image prompt'}),
    size: Flags.string({description: 'Image size, for example 1536x1024'}),
    style: Flags.string({
      description: 'Cover style',
      options: ['business', 'editorial', 'magazine', 'minimal'],
    }),
    summary: Flags.string({description: 'Article summary'}),
    title: Flags.string({description: 'Article title'}),
  }
  static requiresSetup = false

  async run(): Promise<Record<string, unknown> | void> {
    const {args, flags} = await this.parse(CoverGenerate)
    const appConfig = this.appConfig || await loadSavedAppConfig(this.config.configDir)
    const coverState = args.input
      ? await inspectCover({inputPath: args.input})
      : {source: undefined, status: 'missing' as const, summary: '', title: ''}
    const title = String(flags.title || coverState.title || await promptInput({message: 'Enter the article title'})).trim()
    const summary = String(flags.summary || coverState.summary).trim()
    const outputPath = flags.output
      ? path.resolve(flags.output)
      : createDefaultCoverOutputPath({
          directory: args.input ? path.dirname(path.resolve(args.input)) : process.cwd(),
          title,
        })
    const spinner = ora('Generating cover image').start()

    try {
      const result = await generateCoverImage({
        apiKey: String(flags.apiKey || appConfig?.ai.image?.apiKey || await password({mask: '*', message: 'Enter the image model API key'})).trim(),
        endpoint: flags.endpoint || appConfig?.ai.image?.endpoint,
        model: flags.model || appConfig?.ai.image?.defaultModel,
        outputPath,
        prompt: flags.prompt,
        size: flags.size ?? appConfig?.ai.image?.defaultSize,
        style: flags.style as 'business' | 'editorial' | 'magazine' | 'minimal' | undefined,
        summary,
        title,
      })

      spinner.succeed('Cover image generated')

      const payload = {
        ...result,
        input: args.input ?? null,
        summary,
        title,
      }

      if (this.jsonEnabled()) return payload

      this.log(
        boxen(
          [
            chalk.bold('Cover Ready'),
            '',
            `${chalk.bold('title')}   ${title}`,
            `${chalk.bold('model')}   ${result.model}`,
            `${chalk.bold('output')}  ${result.outputPath}`,
            `${chalk.bold('source')}  ${result.sourceUrl}`,
          ].join('\n'),
          {
            borderColor: '#2a9d8f',
            padding: 1,
          },
        ),
      )
    } catch (error) {
      spinner.fail('Cover generation failed')
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
