# 安装与升级

## 安装要求

- Node.js `>= 18`
- 建议使用最新 LTS
- 需要可以访问 npm 官方源

## 全局安装

```bash
npm i -g welight-cli
```

安装完成后验证：

```bash
wl --version
wl --help
```

## 首次启动

首次运行直接执行：

```bash
wl
```

CLI 会自动进入初始化向导，完成：

- 许可证验证
- AI 模型配置
- AI 封面图配置
- 公众号配置

## 升级

推荐直接安装最新版本：

```bash
npm i -g welight-cli@latest
```

升级后检查版本：

```bash
wl --version
```

也可以使用 `npm update`：

```bash
npm update -g welight-cli
```

## 卸载

```bash
npm uninstall -g welight-cli
```

## 常见问题

### 1. 安装成功后找不到 `wl`

先检查全局安装目录是否在 PATH 中：

```bash
npm prefix -g
```

然后确认这个目录下的 `bin` 已加入系统 PATH。

### 2. 首次运行提示许可证未激活

CLI 只负责校验许可证，不负责设备激活。  
如果许可证有效但设备未激活，请先在 Welight 桌面版中完成激活。

### 3. 发布到公众号前提示缺少封面图

可以：

- 手动传入封面图
- 在正文中至少插入一张图片
- 使用 `wl cover generate` 自动生成封面图

### 4. 查看当前配置是否正常

```bash
wl doctor
```
