import {input as promptInput} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import chalk from 'chalk'
import fs from 'node:fs/promises'
import path from 'node:path'
import ora from 'ora'

import type {LayoutMode} from '../../lib/article/types.js'

import BaseCommand from '../../base-command.js'
import {createArticleMarkdown, layoutArticleMarkdown} from '../../lib/ai/service.js'
import {loadSavedAppConfig} from '../../lib/config/store.js'
import {MarkdownStreamRenderer} from '../../lib/ui/markdown-stream.js'

export default class AiCreate extends BaseCommand {
  static description = 'Create article Markdown with AI'
  static examples = [
    '<%= config.bin %> <%= command.id %> --prompt "Write a WeChat article about personal knowledge management"',
    '<%= config.bin %> <%= command.id %> --prompt "Write a product retrospective" --layout smart --output article.md',
  ]
  static flags = {
    layout: Flags.string({
      description: 'Optionally apply a Markdown layout pass after generation',
      options: ['minimal', 'simple', 'smart'],
    }),
    model: Flags.string({description: 'AI model identifier'}),
    output: Flags.string({char: 'o', description: 'Output Markdown file path'}),
    prompt: Flags.string({char: 'p', description: 'Topic or writing prompt'}),
    webSearch: Flags.boolean({description: 'Enable web search during generation'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AiCreate)
    const appConfig = this.appConfig || await loadSavedAppConfig(this.config.configDir)
    const model = String(flags.model || appConfig?.ai.defaultModel || 'qwen3-max').trim()
    const localApiKey = appConfig?.ai.apiKey
    const prompt = String(flags.prompt || await promptInput({message: 'Enter a topic or writing prompt'})).trim()
    const spinner = ora('Generating article with AI').start()
    const streamRenderer = new MarkdownStreamRenderer()

    try {
      spinner.stop()
      this.writeStreamHeader('AI is generating the article...')
      let markdown = await createArticleMarkdown({
        localApiKey,
        model,
        onToken: token => streamRenderer.append(token),
        prompt,
        stream: true,
        webSearch: flags.webSearch,
      })
      streamRenderer.finish()

      if (flags.layout) {
        this.writeStreamHeader(`AI is applying the ${flags.layout} layout...`)
        markdown = await layoutArticleMarkdown({
          localApiKey,
          markdown,
          mode: flags.layout as LayoutMode,
          model,
          onToken: token => streamRenderer.append(token),
          stream: true,
        })
        streamRenderer.finish()
      }

      spinner.succeed('AI generation complete')

      if (flags.output) {
        const outputPath = path.resolve(flags.output)
        await fs.mkdir(path.dirname(outputPath), {recursive: true})
        await fs.writeFile(outputPath, `${markdown.trim()}\n`, 'utf8')
        this.log(`Written to ${chalk.cyan(outputPath)}`)
      }
    } catch (error) {
      spinner.fail('AI generation failed')
      this.error(error instanceof Error ? error.message : String(error))
    }
  }

  private writeStreamHeader(title: string): void {
    this.log(chalk.cyan(`\n${title}\n`))
  }
}
