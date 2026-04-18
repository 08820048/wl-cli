# Welight CLI

`Welight CLI` 是一个面向公众号创作流程的命令行工具。  
它把 `AI 创作 -> Markdown 排版 -> 套主题 -> 生成公众号 HTML -> 复制/发布` 串成了一条可自动化的生产链路。

## 安装

```bash
npm i -g welight-cli
```

安装后直接运行：

```bash
wl
wl --help
```

更完整的安装、升级和卸载说明见：[docs/installation.md](./docs/installation.md)

## 快速开始

首次使用：

```bash
wl
```

CLI 会自动进入初始化向导，依次完成：

- 许可证验证
- 默认 AI 模型配置
- AI 封面图模型配置
- 公众号 `AppID / AppSecret / 代理地址` 配置

初始化完成后，最常用的几个命令是：

```bash
wl article compose
wl ai create --prompt "写一篇关于 AI 工作流的公众号文章"
wl cover generate --title "AI 工作流趋势"
wl publish wechat article.html --mode draft
```

## 核心能力

当前版本已经支持：

- 首次运行自动进入 setup 引导
- 许可证登录与状态检查
- AI 文章创作
- AI Markdown 排版
- 公众号主题选择与 HTML 导出
- 公众号兼容 HTML 复制到剪贴板
- 发布到公众号草稿箱或正式发布
- AI 封面图检查与生成
- 本地环境与配置检查

`wl article compose` 当前可完成：

- 从创意提示词、本地 Markdown 或 URL 提取内容
- 可选 AI 创作 / AI 改写 / AI 排版
- 套用内置主题并导出独立 HTML
- 自动检查封面图并补齐封面
- 复制到公众号
- 推送到公众号草稿箱 / 正式发布

## 常用命令

```bash
wl setup
wl auth login
wl auth status
wl ai create --prompt "写一篇产品复盘"
wl theme list
wl article compose
wl cover check ./article.html
wl cover generate --title "2026 AI 趋势"
wl copy wechat ./article.html
wl publish wechat ./article.html --mode draft
wl doctor
```

## 发布维护

仓库已经配置好自动发布流程。

维护者发布新版本时只需要：

1. 修改 `package.json` 中的版本号
2. 提交并推送到 `main`

GitHub Actions 会自动执行：

- 安装依赖
- 构建与测试
- 创建 `vX.Y.Z` tag
- 发布 `welight-cli` 到 npm
- 创建同版本 GitHub Release

发布前需要在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 中配置：

- `NPM_TOKEN`

## 安装给用户

用户公开安装命令：

```bash
npm i -g welight-cli
```

安装后使用：

```bash
wl
wl --help
```
