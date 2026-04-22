import {confirm, input, password, select} from '@inquirer/prompts'
import boxen from 'boxen'
import chalk from 'chalk'
import ora from 'ora'

import type {SavedCredentials} from '../auth/types.js'
import type {SavedAppConfig} from '../config/types.js'

import {modelRequiresApiKey, runAiChat, supportsNativeWebSearch, validateAiModelIdentifier} from '../ai/api-client.js'
import {loadSavedCredentials, saveCredentials} from '../auth/auth-store.js'
import {formatLicenseClientError, validateLicenseStatus} from '../auth/license-client.js'
import {loadSavedAppConfig, saveAppConfig} from '../config/store.js'
import {validateTavilyApiKey} from '../search/tavily.js'
import {centerBlock, getAdaptiveBoxWidth, renderLogo} from '../ui/banner.js'
import {DEFAULT_PROXY_ORIGIN, getWechatAccessToken} from '../wechat/api.js'

const PRESET_MODELS = [
  {label: 'Qwen Max', value: 'qwen3-max'},
  {label: 'DeepSeek Chat', value: 'deepseek-chat'},
  {label: 'Kimi K2', value: 'kimi-k2-0905-preview'},
  {label: 'GLM 4.6', value: 'glm-46'},
  {label: 'Ollama Local', value: 'ollama'},
]

const PRESET_IMAGE_MODELS = [
  {
    description: 'Recommended default for wide WeChat cover images',
    label: 'Qwen Image',
    value: 'Qwen/Qwen-Image',
  },
  {
    description: 'Stronger visual style with fast generation',
    label: 'Kolors',
    value: 'Kwai-Kolors/Kolors',
  },
]

interface SetupWizardInput {
  configDir: string
  log: (message: string) => void
  section?: 'ai' | 'all' | 'license' | 'wechat'
}

interface SetupWizardResult {
  appConfig: SavedAppConfig
  credentials: SavedCredentials
}

interface SetupDraft {
  ai: {
    apiKey?: string
    defaultModel: string
    image?: {
      apiKey?: string
      defaultModel?: string
      defaultSize?: string
      endpoint?: string
    }
  }
  credentials: {
    customerEmail: string
    licenseKey: string
  }
  search: {
    apiKey?: string
    provider?: 'tavily'
  }
  wechat: {
    appId: string
    appSecret: string
    proxyOrigin?: string
  }
}

function maskSecret(value?: string): string {
  const resolved = String(value || '').trim()
  if (!resolved) return 'not configured'
  if (resolved.length <= 8) return `${resolved.slice(0, 2)}***${resolved.slice(-1)}`
  return `${resolved.slice(0, 4)}***${resolved.slice(-4)}`
}

async function promptProtectedValue(inputValue: {
  emptyMessage: string
  existingValue?: string
  message: string
}): Promise<string> {
  const existingValue = String(inputValue.existingValue || '').trim()
  const promptMessage = existingValue ? `${inputValue.message} (leave blank to keep the current value)` : inputValue.message

  const nextValue = String(await password({
    mask: '*',
    message: promptMessage,
    validate(value) {
      if (String(value || '').trim()) return true
      return existingValue ? true : inputValue.emptyMessage
    },
  })).trim()

  return nextValue || existingValue
}

function resolveModelChoice(defaultModel?: string): string {
  const matched = PRESET_MODELS.find(item => item.value === defaultModel)
  return matched ? matched.value : '__custom__'
}

function resolveImageModelChoice(defaultModel?: string): string {
  const matched = PRESET_IMAGE_MODELS.find(item => item.value === defaultModel)
  return matched ? matched.value : '__custom__'
}

function renderSetupStep(inputValue: {
  current: number
  description: string
  summary: string[]
  title: string
  total: number
}): string {
  return centerBlock(boxen(
    [
      `${chalk.bold(`STEP ${inputValue.current}/${inputValue.total}`)}  ${chalk.hex('#f4a261')(inputValue.title)}`,
      chalk.gray(inputValue.description),
      '',
      ...inputValue.summary,
    ].join('\n'),
    {
      borderColor: '#f4a261',
      padding: {bottom: 0, left: 1, right: 1, top: 0},
      width: getAdaptiveBoxWidth(),
    },
  ))
}

async function validateAiConfiguration(inputValue: {apiKey?: string; model: string}): Promise<{identifier: string; provider: string}> {
  const resolvedModel = await validateAiModelIdentifier(inputValue.model)
  await runAiChat({
    localApiKey: inputValue.apiKey,
    messages: [
      {
        content: 'You are the AI configuration test assistant for Welight CLI. Reply with OK only.',
        role: 'system',
      },
      {
        content: 'Reply with OK only',
        role: 'user',
      },
    ],
    model: inputValue.model,
  })

  return resolvedModel
}

function createInitialDraft(
  existingConfig: null | SavedAppConfig,
  existingCredentials: null | SavedCredentials,
): SetupDraft {
  return {
    ai: {
      apiKey: existingConfig?.ai.apiKey,
      defaultModel: existingConfig?.ai.defaultModel || 'qwen3-max',
      image: existingConfig?.ai.image,
    },
    credentials: {
      customerEmail: existingCredentials?.customerEmail || '',
      licenseKey: existingCredentials?.licenseKey || '',
    },
    search: existingConfig?.search || {},
    wechat: {
      appId: existingConfig?.wechat.appId || '',
      appSecret: existingConfig?.wechat.appSecret || '',
      proxyOrigin: existingConfig?.wechat.proxyOrigin || DEFAULT_PROXY_ORIGIN,
    },
  }
}

function resolveSetupSequence(section: 'ai' | 'all' | 'license' | 'wechat'): Array<'ai' | 'license' | 'wechat'> {
  if (section === 'all') return ['license', 'ai', 'wechat']
  return [section]
}

export async function runSetupWizard(inputValue: SetupWizardInput): Promise<SetupWizardResult> {
  const existingCredentials = await loadSavedCredentials(inputValue.configDir)
  const existingConfig = await loadSavedAppConfig(inputValue.configDir)
  const section = inputValue.section || 'all'
  const draft = createInitialDraft(existingConfig, existingCredentials)
  const sequence = resolveSetupSequence(section)

  if (section !== 'all' && (!existingCredentials || !existingConfig)) {
    throw new Error('The CLI has not been fully initialized yet. Run `wl setup` to complete the initial configuration first.')
  }

  inputValue.log(renderLogo())
  inputValue.log('')

  inputValue.log(
    centerBlock(boxen(
      [
        chalk.bold('Welight Setup'),
        '',
        'Complete the license, AI, and WeChat configuration before using the CLI.',
        'You can run `wl setup` again anytime to update the configuration.',
        'You can also use `wl setup --section ai|license|wechat` to reconfigure only one section.',
      ].join('\n'),
      {
        borderColor: '#f4a261',
        padding: 1,
        width: getAdaptiveBoxWidth(),
      },
    )),
  )

  if (sequence.includes('license')) {
    const current = sequence.indexOf('license') + 1
    inputValue.log(renderSetupStep({
      current,
      description: 'Check the license status for this device. The CLI validates licenses, but does not activate devices.',
      summary: [
        `${chalk.bold('Saved email')}  ${draft.credentials.customerEmail || 'not configured'}`,
        `${chalk.bold('License')}      ${maskSecret(draft.credentials.licenseKey)}`,
      ],
      title: 'License',
      total: sequence.length,
    }))

    draft.credentials.licenseKey = String(await input({
      default: draft.credentials.licenseKey,
      message: 'License key',
    })).trim()
    draft.credentials.customerEmail = String(await input({
      default: draft.credentials.customerEmail,
      message: 'Purchase email',
    })).trim()

    const licenseSpinner = ora('Validating license status').start()

    let licenseCheck

    try {
      licenseCheck = await validateLicenseStatus(draft.credentials)
    } catch (error) {
      licenseSpinner.fail('License validation failed')
      throw new Error(formatLicenseClientError(error))
    }

    if (licenseCheck.state === 'invalid') {
      licenseSpinner.fail('License is not valid')
      throw new Error(licenseCheck.message)
    }

    if (licenseCheck.state !== 'active') {
      licenseSpinner.fail('This device is not activated yet')
      throw new Error(
        [
          'The license is valid, but this device has not been activated in the Welight desktop app yet.',
          'Open the desktop app, activate this device, then run `wl setup` again.',
        ].join('\n'),
      )
    }

    licenseSpinner.succeed('License validation passed')
  }

  if (sequence.includes('ai')) {
    const current = sequence.indexOf('ai') + 1
    inputValue.log('')
    inputValue.log(renderSetupStep({
      current,
      description: 'Configure the default AI model and verify that the model and API key are actually usable.',
      summary: [
        `${chalk.bold('Current model')}  ${draft.ai.defaultModel || 'not configured'}`,
        `${chalk.bold('AI Key')}         ${draft.ai.apiKey ? 'configured' : 'not configured'}`,
        `${chalk.bold('Cover model')}    ${draft.ai.image?.defaultModel || 'not configured'}`,
        `${chalk.bold('Web Search')}     ${draft.search.provider === 'tavily' ? `Tavily (${draft.search.apiKey ? 'configured' : 'missing key'})` : 'not configured'}`,
      ],
      title: 'AI',
      total: sequence.length,
    }))

    const modelChoice = await select<string>({
      choices: [
        ...PRESET_MODELS.map(item => ({
          name: `${item.label}  ${chalk.gray(item.value)}`,
          value: item.value,
        })),
        {name: 'Custom  enter a model identifier manually', value: '__custom__'},
      ],
      default: resolveModelChoice(draft.ai.defaultModel || 'qwen3-max'),
      message: 'Choose the default AI model',
    })

    draft.ai.defaultModel = modelChoice === '__custom__'
      ? String(await input({
          default: draft.ai.defaultModel,
          message: 'Enter the default AI model identifier',
        })).trim()
      : modelChoice

    draft.ai.apiKey = modelRequiresApiKey(draft.ai.defaultModel)
      ? await promptProtectedValue({
          emptyMessage: 'AI API key cannot be empty',
          existingValue: draft.ai.apiKey,
          message: 'Enter the AI API key',
        })
      : undefined

    const aiSpinner = ora('Validating AI configuration').start()

    let resolvedModel

    try {
      resolvedModel = await validateAiConfiguration({
        apiKey: draft.ai.apiKey,
        model: draft.ai.defaultModel,
      })
      aiSpinner.succeed(`AI configuration validated: ${draft.ai.defaultModel}`)
    } catch (error) {
      aiSpinner.fail('AI configuration validation failed')
      throw new Error(error instanceof Error ? error.message : String(error))
    }

    const nativeWebSearchSupported = supportsNativeWebSearch(resolvedModel)
    const configureSearchFallback = draft.search.provider === 'tavily'
      ? await confirm({default: true, message: 'Update the Tavily real-time web search configuration?'})
      : await confirm({
        default: true,
        message: nativeWebSearchSupported
            ? 'Configure Tavily real-time web search? Welight uses it before AI article generation by default.'
            : 'This model does not support native web search. Configure Tavily real-time search now?',
        })

    if (configureSearchFallback) {
      draft.search.provider = 'tavily'
      draft.search.apiKey = await promptProtectedValue({
        emptyMessage: 'Tavily API key cannot be empty',
        existingValue: draft.search.apiKey,
        message: 'Enter the Tavily API key for real-time web search',
      })

      const searchSpinner = ora('Validating Tavily configuration').start()

      try {
        await validateTavilyApiKey(draft.search.apiKey)
        searchSpinner.succeed('Tavily configuration validated')
      } catch (error) {
        searchSpinner.fail('Tavily configuration validation failed')
        throw new Error(error instanceof Error ? error.message : String(error))
      }
    }

    const configureImageModel = draft.ai.image
      ? await confirm({default: false, message: 'Update the AI cover image configuration?'})
      : await confirm({default: true, message: 'Configure AI cover image generation for automatic covers?'})

    if (configureImageModel) {
      const imageModelChoice = await select<string>({
        choices: [
          ...PRESET_IMAGE_MODELS.map(item => ({
            description: item.description,
            name: `${item.label}  ${chalk.gray(item.value)}`,
            value: item.value,
          })),
          {name: 'Custom  enter an image model identifier manually', value: '__custom__'},
        ],
        default: resolveImageModelChoice(draft.ai.image?.defaultModel || 'Qwen/Qwen-Image'),
        message: 'Choose the default image model',
      })

      const imageModel = imageModelChoice === '__custom__'
        ? String(await input({
            default: draft.ai.image?.defaultModel || 'Qwen/Qwen-Image',
            message: 'Enter the image model identifier',
          })).trim()
        : imageModelChoice

      inputValue.log(chalk.gray(`Configure the image generation settings for ${imageModel}.`))

      draft.ai.image = {
        apiKey: await promptProtectedValue({
          emptyMessage: 'Image model API key cannot be empty',
          existingValue: draft.ai.image?.apiKey,
          message: `Enter the API key for ${imageModel}`,
        }),
        defaultModel: imageModel,
        defaultSize: String(await input({
          default: draft.ai.image?.defaultSize || '1536x1024',
          message: 'Default image size',
        })).trim(),
        endpoint: String(await input({
          default: draft.ai.image?.endpoint || 'https://api.siliconflow.cn/v1',
          message: 'Image model endpoint',
        })).trim(),
      }
    }
  }

  if (sequence.includes('wechat')) {
    const current = sequence.indexOf('wechat') + 1
    inputValue.log('')
    inputValue.log(renderSetupStep({
      current,
      description: 'Configure the AppID, AppSecret, and proxy origin used to publish WeChat articles.',
      summary: [
        `${chalk.bold('AppID')}    ${draft.wechat.appId || 'not configured'}`,
        `${chalk.bold('Secret')}   ${draft.wechat.appSecret ? 'configured' : 'not configured'}`,
        `${chalk.bold('Proxy')}    ${draft.wechat.proxyOrigin || DEFAULT_PROXY_ORIGIN}`,
      ],
      title: 'WeChat',
      total: sequence.length,
    }))

    draft.wechat.appId = String(await input({
      default: draft.wechat.appId,
      message: 'WeChat AppID',
    })).trim()
    draft.wechat.appSecret = await promptProtectedValue({
      emptyMessage: 'WeChat AppSecret cannot be empty',
      existingValue: draft.wechat.appSecret,
      message: 'WeChat AppSecret',
    })
    draft.wechat.proxyOrigin = String(await input({
      default: draft.wechat.proxyOrigin || DEFAULT_PROXY_ORIGIN,
      message: 'WeChat proxy origin',
    })).trim()

    const wechatSpinner = ora('Validating WeChat configuration').start()

    try {
      await getWechatAccessToken({
        appId: draft.wechat.appId,
        appSecret: draft.wechat.appSecret,
        proxyOrigin: draft.wechat.proxyOrigin,
      })
      wechatSpinner.succeed('WeChat configuration validated')
    } catch (error) {
      wechatSpinner.fail('WeChat configuration validation failed')
      throw new Error(error instanceof Error ? error.message : String(error))
    }
  }

  const credentials = await saveCredentials(inputValue.configDir, draft.credentials)

  const appConfig = await saveAppConfig(inputValue.configDir, {
    ai: draft.ai,
    search: draft.search,
    wechat: draft.wechat,
  })

  inputValue.log('')
  inputValue.log(
    centerBlock(boxen(
      [
        chalk.bold.green('Setup Complete'),
        '',
        `${chalk.bold('AI Model')}   ${appConfig.ai.defaultModel}`,
        `${chalk.bold('AI Key')}     ${appConfig.ai.apiKey ? 'configured' : 'not required'}`,
        `${chalk.bold('Search')}     ${appConfig.search?.provider === 'tavily' ? 'Tavily configured' : 'not configured'}`,
        `${chalk.bold('AI Image')}   ${appConfig.ai.image?.defaultModel || 'not configured'}`,
        `${chalk.bold('License')}    ${maskSecret(credentials.licenseKey)}`,
        `${chalk.bold('WeChat')}     ${appConfig.wechat.appId}`,
        `${chalk.bold('Proxy')}      ${appConfig.wechat.proxyOrigin || DEFAULT_PROXY_ORIGIN}`,
        '',
        `You can now start with ${chalk.cyan('wl article compose')}.`,
      ].join('\n'),
      {
        borderColor: '#2a9d8f',
        padding: 1,
        width: getAdaptiveBoxWidth(),
      },
    )),
  )

  return {
    appConfig,
    credentials,
  }
}
