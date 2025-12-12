# 📱 Tauri Chat App

一个基于 Tauri 2.0 构建的跨平台聊天应用，支持桌面（Windows/macOS/Linux）和 Android。

## ✨ 特性

- 🚀 **跨平台**：一套代码，同时支持桌面和 Android
- 🔌 **多 LLM 支持**：兼容 OpenAI、Anthropic (Claude)、自定义 API
- 💬 **流式响应**：实时显示 AI 回复
- 💾 **本地存储**：聊天记录加密保存在本地数据库
- 🎨 **现代 UI**：响应式设计，支持移动端
- 🔒 **安全**：API Key 加密存储

## 📦 项目结构

```
tauri-chat-app/
├── src/                      # 前端代码
│   ├── index.html           # 主页面
│   ├── assets/              # 静态资源
│   │   ├── css/            # 样式文件
│   │   └── images/         # 图片
│   ├── lib/                # 第三方库（本地化）
│   └── scripts/            # JavaScript 代码
│       ├── api/            # LLM API 客户端
│       │   ├── client.js   # 统一接口
│       │   ├── stream.js   # 流式处理
│       │   └── providers/  # API 适配器
│       │       ├── openai.js
│       │       ├── anthropic.js
│       │       └── custom.js
│       ├── storage/        # 存储管理
│       │   ├── config.js   # 配置管理
│       │   └── chat.js     # 聊天记录
│       ├── ui/             # UI 组件
│       │   ├── bridge.js   # 桥接层
│       │   └── config-panel.js
│       └── utils/          # 工具函数
│           ├── logger.js
│           └── retry.js
│
├── src-tauri/               # Rust 后端
│   ├── src/
│   │   ├── main.rs         # 入口
│   │   ├── commands.rs     # Tauri 命令
│   │   └── storage.rs      # 数据库管理
│   ├── Cargo.toml
│   └── tauri.conf.json     # Tauri 配置
│
├── scripts/                 # 工具脚本
│   ├── download-deps.sh    # 下载依赖
│   └── fix-paths.js        # 修复路径
│
├── package.json
└── README.md
```

## 🚀 快速开始

### 1. 安装环境

**首先安装必要的工具链：**

```bash
# 查看详细安装指南
cat INSTALL_GUIDE.md
```

必需：
- ✅ Node.js 18+
- ✅ Rust
- ✅ Tauri CLI 2.0+

Android 开发（可选）：
- Java 17
- Android Studio (SDK 33+, NDK 25.2.x)

### 2. 安装项目依赖

```bash
cd tauri-chat-app

# 安装 Node 依赖
npm install

# 下载前端库（jQuery, Toastr）
bash scripts/download-deps.sh
```

### 3. 开发模式运行

```bash
# 桌面版
npm run dev

# Android (需先初始化)
npm run android:init
npm run android:dev
```

### 4. 打包发布

```bash
# 桌面版
npm run build

# 生成的文件在：
# - Windows: src-tauri/target/release/bundle/msi/
# - macOS: src-tauri/target/release/bundle/dmg/
# - Linux: src-tauri/target/release/bundle/deb/

# Android
npm run android:build
# APK 位置: src-tauri/gen/android/app/build/outputs/apk/
```

## 🔧 配置说明

### 首次使用

1. 启动应用后，点击右上角 **⚙️ 配置** 按钮
2. 选择 LLM 服务商（OpenAI / Anthropic / 自定义）
3. 填写 API 信息：
   - **API Base URL**: API 服务器地址
   - **API Key**: 你的 API 密钥
   - **模型**: 使用的模型名称
4. 点击 **测试连接** 验证配置
5. 保存配置

### 支持的 LLM 服务商

#### OpenAI
```
Base URL: https://api.openai.com/v1
模型示例: gpt-3.5-turbo, gpt-4, gpt-4-turbo
```

#### Anthropic (Claude)
```
Base URL: https://api.anthropic.com/v1
模型示例: claude-3-5-sonnet-20241022
```

#### 自定义 API
支持任何兼容 OpenAI 格式的 API：
```
Base URL: http://your-server.com/v1
模型: 根据你的服务器设置
```

## 💻 开发指南

### 添加新的 LLM 提供商

1. 在 `src/scripts/api/providers/` 创建新文件，如 `myprovider.js`
2. 实现以下接口：

```javascript
export class MyProvider {
    constructor(config) { ... }
    async chat(messages, options) { ... }
    async *streamChat(messages, options) { ... }
    async listModels() { ... }
    async healthCheck() { ... }
}
```

3. 在 `src/scripts/api/client.js` 注册：

```javascript
const providers = {
    'openai': OpenAIProvider,
    'anthropic': AnthropicProvider,
    'myprovider': MyProvider  // 添加这行
};
```

### 自定义 UI

- 修改 `src/index.html` - 主界面结构
- 修改 `src/assets/css/main.css` - 样式
- 修改 `src/scripts/ui/` - UI 组件逻辑

### 调试技巧

```javascript
// 在浏览器控制台中

// 查看当前配置
window.appBridge.config.get()

// 设置日志级别
import { logger, LogLevel } from './scripts/utils/logger.js';
logger.setLevel(LogLevel.DEBUG);

// 查看聊天历史
await window.appBridge.getChatHistory('default')

// 清除聊天历史
await window.appBridge.clearChatHistory('default')
```

## 📱 Android 特别说明

### 环境配置

```bash
# 设置环境变量（Linux/macOS）
export ANDROID_HOME=$HOME/Android/Sdk
export NDK_HOME=$ANDROID_HOME/ndk/25.2.9519653

# Windows PowerShell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\25.2.9519653"
```

### 常见问题

**问题 1**: 找不到 NDK
```bash
# 安装指定版本的 NDK
sdkmanager --install "ndk;25.2.9519653"
```

**问题 2**: WebView 无法加载
- 检查 `src-tauri/tauri.conf.json` 中的 CSP 配置
- 确保 API 域名已添加到 `connect-src`

**问题 3**: 网络请求失败
- 检查 `AndroidManifest.xml` 中的网络权限
- 开发环境需允许明文 HTTP（见 `network_security_config.xml`）

## 🛠️ 故障排除

### 编译错误

```bash
# 清理缓存
rm -rf node_modules src-tauri/target
npm install
cargo clean
```

### 数据库问题

```bash
# 重置数据库（⚠️ 会删除所有数据）
rm -rf src-tauri/app.db*
```

### 前端依赖缺失

```bash
# 重新下载依赖
bash scripts/download-deps.sh
```

## 📖 API 参考

### ConfigManager

```javascript
import { ConfigManager } from './scripts/storage/config.js';

const config = new ConfigManager();

// 加载配置
await config.load();

// 保存配置
await config.save({ provider: 'openai', apiKey: '...', ... });

// 获取当前配置
const current = config.get();

// 重置为默认值
await config.reset();
```

### LLMClient

```javascript
import { LLMClient } from './scripts/api/client.js';

const client = new LLMClient({
    provider: 'openai',
    apiKey: 'sk-...',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-3.5-turbo'
});

// 非流式
const response = await client.chat([
    { role: 'user', content: 'Hello!' }
]);

// 流式
for await (const chunk of client.streamChat(messages)) {
    console.log(chunk);
}
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🔗 相关链接

- [Tauri 官方文档](https://tauri.app/)
- [OpenAI API 文档](https://platform.openai.com/docs/api-reference)
- [Anthropic API 文档](https://docs.anthropic.com/)

---

**注意**: 这是一个独立的应用，不依赖 SillyTavern。所有 LLM API 调用都是直接从应用发起的。
