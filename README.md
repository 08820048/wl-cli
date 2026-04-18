Welight CLI
===========

基于 `oclif` 的独立 Welight CLI 仓库。

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
