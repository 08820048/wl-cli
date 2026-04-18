Welight CLI
===========

基于 `oclif` 的独立 Welight CLI 仓库。

安装：

```bash
npm i -g welight-cli
```

安装后直接运行：

```bash
wl
wl --help
```

当前已落地的第一批能力：

- 首次运行 `wl` 自动进入初始化配置向导
- `wl setup`
- `wl auth login`
- `wl auth status`
- `wl auth logout`
- `wl ai create`
- `wl theme list`
- `wl article compose`
- `wl copy wechat`
- `wl publish wechat`
- `wl doctor`

当前 `wl article compose` 已经可以完成：

- 从创意提示词、本地 Markdown 或 URL 提取内容
- 可选 AI 创作 / AI 排版
- 套用内置主题并导出独立 HTML
- 将公众号兼容 HTML 复制到系统剪贴板
- 推送到公众号草稿箱 / 正式发布

首次使用建议：

1. 直接运行 `wl`
2. 按引导完成许可证、默认 AI 模型、公众号 AppID / AppSecret 配置
3. 配置完成后再使用 `wl article compose` 或 `wl ai create`

发布：

```bash
pnpm build
npm publish
```

自动发布
--------

仓库已经配置好 GitHub Actions 自动发布流程。

前置条件：

- 在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 中添加 `NPM_TOKEN`
- `NPM_TOKEN` 需要是有 npm 发布权限的 token

维护者发布步骤：

1. 修改 `package.json` 中的版本号
2. 提交并推送到 `main`
3. GitHub Actions 会自动执行：
   - 安装依赖
   - 构建与测试
   - 创建 `vX.Y.Z` tag
   - 发布 `welight-cli` 到 npm
   - 创建同版本 GitHub Release

用户安装：

```bash
npm i -g welight-cli
```
