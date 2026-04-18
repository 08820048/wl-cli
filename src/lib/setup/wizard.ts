import {confirm, input, password, select} from '@inquirer/prompts'
import boxen from 'boxen'
import chalk from 'chalk'
import ora from 'ora'

import type {SavedCredentials} from '../auth/types.js'
import type {SavedAppConfig} from '../config/types.js'

import {modelRequiresApiKey, runAiChat, validateAiModelIdentifier} from '../ai/api-client.js'
import {loadSavedCredentials, saveCredentials} from '../auth/auth-store.js'
import {formatLicenseClientError, validateLicenseStatus} from '../auth/license-client.js'
import {loadSavedAppConfig, saveAppConfig} from '../config/store.js'
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
    description: '默认推荐，适合公众号横版封面',
    label: 'Qwen Image',
    value: 'Qwen/Qwen-Image',
  },
  {
    description: '风格更强，生成速度快',
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
  wechat: {
    appId: string
    appSecret: string
    proxyOrigin?: string
  }
}

function maskSecret(value?: string): string {
  const resolved = String(value || '').trim()
  if (!resolved) return '未配置'
  if (resolved.length <= 8) return `${resolved.slice(0, 2)}***${resolved.slice(-1)}`
  return `${resolved.slice(0, 4)}***${resolved.slice(-4)}`
}

async function promptProtectedValue(inputValue: {
  emptyMessage: string
  existingValue?: string
  message: string
}): Promise<string> {
  const existingValue = String(inputValue.existingValue || '').trim()
  const promptMessage = existingValue ? `${inputValue.message}（留空则保留当前值）` : inputValue.message

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

async function validateAiConfiguration(inputValue: {apiKey?: string; model: string}): Promise<void> {
  await validateAiModelIdentifier(inputValue.model)
  await runAiChat({
    localApiKey: inputValue.apiKey,
    messages: [
      {
        content: '你是 Welight CLI 的 AI 配置测试助手，只回复 OK。',
        role: 'system',
      },
      {
        content: '请只回复 OK',
        role: 'user',
      },
    ],
    model: inputValue.model,
  })
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
    throw new Error('当前还没有完整初始化，请先运行 `wl setup` 完成一次完整配置。')
  }

  inputValue.log(renderLogo())
  inputValue.log('')

  inputValue.log(
    centerBlock(boxen(
      [
        chalk.bold('Welight Setup'),
        '',
        '首次使用请先完成许可证、AI 和公众号配置。',
        '后续如果需要重新配置，随时可以运行 `wl setup`。',
        '也可以使用 `wl setup --section ai|license|wechat` 只重配某一段。',
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
      description: '确认当前设备的许可证状态。CLI 只做校验，不负责激活。',
      summary: [
        `${chalk.bold('已保存邮箱')}  ${draft.credentials.customerEmail || '未配置'}`,
        `${chalk.bold('许可证')}    ${maskSecret(draft.credentials.licenseKey)}`,
      ],
      title: 'License',
      total: sequence.length,
    }))

    draft.credentials.licenseKey = String(await input({
      default: draft.credentials.licenseKey,
      message: '许可证密钥',
    })).trim()
    draft.credentials.customerEmail = String(await input({
      default: draft.credentials.customerEmail,
      message: '购买邮箱',
    })).trim()

    const licenseSpinner = ora('正在验证许可证状态').start()

    let licenseCheck

    try {
      licenseCheck = await validateLicenseStatus(draft.credentials)
    } catch (error) {
      licenseSpinner.fail('许可证校验失败')
      throw new Error(formatLicenseClientError(error))
    }

    if (licenseCheck.state === 'invalid') {
      licenseSpinner.fail('许可证不可用')
      throw new Error(licenseCheck.message)
    }

    if (licenseCheck.state !== 'active') {
      licenseSpinner.fail('许可证尚未在当前设备激活')
      throw new Error(
        [
          '许可证验证通过，但当前设备尚未在 Welight 桌面版中激活。',
          '请先打开桌面版完成激活，然后重新运行 `wl setup`。',
        ].join('\n'),
      )
    }

    licenseSpinner.succeed('许可证验证通过')
  }

  if (sequence.includes('ai')) {
    const current = sequence.indexOf('ai') + 1
    inputValue.log('')
    inputValue.log(renderSetupStep({
      current,
      description: '配置默认 AI 模型，并对模型与 API Key 做实际可用性验证。',
      summary: [
        `${chalk.bold('当前模型')}  ${draft.ai.defaultModel || '未配置'}`,
        `${chalk.bold('AI Key')}   ${draft.ai.apiKey ? '已配置' : '未配置'}`,
        `${chalk.bold('封面图')}   ${draft.ai.image?.defaultModel || '未配置'}`,
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
        {name: 'Custom  手动输入模型标识', value: '__custom__'},
      ],
      default: resolveModelChoice(draft.ai.defaultModel || 'qwen3-max'),
      message: '选择默认 AI 模型',
    })

    draft.ai.defaultModel = modelChoice === '__custom__'
      ? String(await input({
          default: draft.ai.defaultModel,
          message: '输入默认 AI 模型标识',
        })).trim()
      : modelChoice

    draft.ai.apiKey = modelRequiresApiKey(draft.ai.defaultModel)
      ? await promptProtectedValue({
          emptyMessage: 'AI API Key 不能为空',
          existingValue: draft.ai.apiKey,
          message: '输入 AI API Key',
        })
      : undefined

    const aiSpinner = ora('正在验证 AI 配置').start()

    try {
      await validateAiConfiguration({
        apiKey: draft.ai.apiKey,
        model: draft.ai.defaultModel,
      })
      aiSpinner.succeed(`AI 配置验证通过：${draft.ai.defaultModel}`)
    } catch (error) {
      aiSpinner.fail('AI 配置验证失败')
      throw new Error(error instanceof Error ? error.message : String(error))
    }

    const configureImageModel = draft.ai.image
      ? await confirm({default: false, message: '是否更新 AI 封面图配置？'})
      : await confirm({default: true, message: '是否配置 AI 封面图生成（用于自动封面）？'})

    if (configureImageModel) {
      const imageModelChoice = await select<string>({
        choices: [
          ...PRESET_IMAGE_MODELS.map(item => ({
            description: item.description,
            name: `${item.label}  ${chalk.gray(item.value)}`,
            value: item.value,
          })),
          {name: 'Custom  手动输入图片模型标识', value: '__custom__'},
        ],
        default: resolveImageModelChoice(draft.ai.image?.defaultModel || 'Qwen/Qwen-Image'),
        message: '选择默认图片模型',
      })

      const imageModel = imageModelChoice === '__custom__'
        ? String(await input({
            default: draft.ai.image?.defaultModel || 'Qwen/Qwen-Image',
            message: '输入图片模型标识',
          })).trim()
        : imageModelChoice

      inputValue.log(chalk.gray(`将为 ${imageModel} 配置图片生成调用信息。`))

      draft.ai.image = {
        apiKey: await promptProtectedValue({
          emptyMessage: '图片模型 API Key 不能为空',
          existingValue: draft.ai.image?.apiKey,
          message: `输入 ${imageModel} 的 API Key`,
        }),
        defaultModel: imageModel,
        defaultSize: String(await input({
          default: draft.ai.image?.defaultSize || '1536x1024',
          message: '默认图片尺寸',
        })).trim(),
        endpoint: String(await input({
          default: draft.ai.image?.endpoint || 'https://api.siliconflow.cn/v1',
          message: '图片模型接口地址',
        })).trim(),
      }
    }
  }

  if (sequence.includes('wechat')) {
    const current = sequence.indexOf('wechat') + 1
    inputValue.log('')
    inputValue.log(renderSetupStep({
      current,
      description: '配置用于发布公众号文章的 AppID、AppSecret 和代理地址。',
      summary: [
        `${chalk.bold('AppID')}    ${draft.wechat.appId || '未配置'}`,
        `${chalk.bold('Secret')}   ${draft.wechat.appSecret ? '已配置' : '未配置'}`,
        `${chalk.bold('Proxy')}    ${draft.wechat.proxyOrigin || DEFAULT_PROXY_ORIGIN}`,
      ],
      title: 'WeChat',
      total: sequence.length,
    }))

    draft.wechat.appId = String(await input({
      default: draft.wechat.appId,
      message: '公众号 AppID',
    })).trim()
    draft.wechat.appSecret = await promptProtectedValue({
      emptyMessage: '公众号 AppSecret 不能为空',
      existingValue: draft.wechat.appSecret,
      message: '公众号 AppSecret',
    })
    draft.wechat.proxyOrigin = String(await input({
      default: draft.wechat.proxyOrigin || DEFAULT_PROXY_ORIGIN,
      message: '微信代理地址',
    })).trim()

    const wechatSpinner = ora('正在验证公众号配置').start()

    try {
      await getWechatAccessToken({
        appId: draft.wechat.appId,
        appSecret: draft.wechat.appSecret,
        proxyOrigin: draft.wechat.proxyOrigin,
      })
      wechatSpinner.succeed('公众号配置验证通过')
    } catch (error) {
      wechatSpinner.fail('公众号配置验证失败')
      throw new Error(error instanceof Error ? error.message : String(error))
    }
  }

  const credentials = await saveCredentials(inputValue.configDir, draft.credentials)

  const appConfig = await saveAppConfig(inputValue.configDir, {
    ai: draft.ai,
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
        `${chalk.bold('AI Image')}   ${appConfig.ai.image?.defaultModel || 'not configured'}`,
        `${chalk.bold('License')}    ${maskSecret(credentials.licenseKey)}`,
        `${chalk.bold('WeChat')}     ${appConfig.wechat.appId}`,
        `${chalk.bold('Proxy')}      ${appConfig.wechat.proxyOrigin || DEFAULT_PROXY_ORIGIN}`,
        '',
        `现在可以开始使用 ${chalk.cyan('wl article compose')} 了。`,
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
