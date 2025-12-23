# ChatApp

本项目启发于 SillyTavern，灵感多数来自 Discord 的“类脑”相关讨论。

一个基于 Tauri 的聊天应用，支持多模型对话、流式回复、动态与群聊，并提供贴图与多媒体渲染。

## 下载与安装（Android）

1. 打开 GitHub Pages 下载页（示例）：
   - `https://<owner>.github.io/<repo>/`
2. 下载最新版 APK：
   - `https://github.com/<owner>/<repo>/releases/latest/download/app-universal-release.apk`
3. 如果手机里已安装开发版（`npm run dev` 安装的 Debug 包）或签名不同，先卸载旧版。
4. 在手机系统中允许“安装未知来源应用”。
5. 点击 APK 完成安装。

### 更新方式

- 直接下载最新版 APK 覆盖安装即可（同包名 + 同签名 + 版本号递增）。
- 如果提示“签名不一致/无法更新”，卸载旧版后再安装。

## 功能简介

- 多模型配置：OpenAI、Anthropic、兼容 OpenAI 协议的自定义服务。
- 流式回复：边生成边显示，阅读不中断。
- 多会话/群聊/动态：支持私聊、群聊与动态评论。
- 贴图与多媒体：`[bqb-关键词]`、图片、语音等渲染。
- 本地存储：聊天历史与配置存本地，不依赖云端。

## 首次使用配置

1. 打开应用，点击右上角 **⚙️ 配置**。
2. 填写 API Base URL / API Key / 模型名称。
3. 点击 **测试连接**，成功后保存。

## 下载入口（建议）

- GitHub Releases（上传 APK 与桌面安装包）
- GitHub Pages（作为下载页，按钮直链 Releases 最新包）

> 本仓库的发布流程以 APK 下载为主，构建/调试说明已归档。

## 许可证

AGPL-3.0，详见 `LICENSE`。
