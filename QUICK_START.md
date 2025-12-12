# 🚀 快速启动指南

## 📋 前置检查清单

在开始之前，确保你已安装：

- [ ] Node.js 18+ （检查：`node --version`）
- [ ] Rust （检查：`rustc --version`）
- [ ] Tauri CLI 2.0+ （检查：`cargo tauri --version`）

**如果还未安装，请先查看 `INSTALL_GUIDE.md`**

---

## ⚡ 5 分钟快速启动

### 1. 安装依赖（首次运行）

```bash
cd tauri-chat-app

# 安装 Node 依赖
npm install

# 下载前端库
bash scripts/download-deps.sh
```

### 2. 启动开发服务器

```bash
npm run dev
```

**首次启动会比较慢（5-10分钟），Rust 需要编译。之后启动会很快。**

### 3. 配置 API

应用启动后：

1. 点击右上角 **⚙️ 配置** 按钮
2. 填写你的 API 信息：

   **OpenAI 示例：**
   ```
   服务商: OpenAI
   Base URL: https://api.openai.com/v1
   API Key: sk-你的密钥
   模型: gpt-3.5-turbo
   ```

   **Claude 示例：**
   ```
   服务商: Anthropic
   Base URL: https://api.anthropic.com/v1
   API Key: sk-ant-你的密钥
   模型: claude-3-5-sonnet-20241022
   ```

3. 点击 **测试连接** 验证
4. 点击 **保存**

### 4. 开始聊天！

在输入框输入消息，按回车或点击发送按钮。

---

## 🔧 常见问题速查

### 问题 1: `cargo tauri` 命令找不到

```bash
cargo install tauri-cli --version "^2.0"
```

### 问题 2: Rust 编译错误

```bash
# 更新 Rust
rustup update

# 清理并重新编译
cd src-tauri
cargo clean
cd ..
npm run dev
```

### 问题 3: 依赖下载失败

```bash
# 手动下载 jQuery
curl -L -o src/lib/jquery.min.js https://code.jquery.com/jquery-3.7.1.min.js

# 手动下载 Toastr
curl -L -o src/lib/toastr.min.js https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.js
curl -L -o src/assets/css/toastr.min.css https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.css
```

### 问题 4: 应用启动但无法发送消息

- 检查浏览器控制台（F12）是否有错误
- 确认已正确配置 API
- 检查网络连接

---

## 📦 打包应用

### 桌面版

```bash
npm run build
```

生成的文件位置：
- **Windows**: `src-tauri/target/release/bundle/msi/`
- **macOS**: `src-tauri/target/release/bundle/dmg/`
- **Linux**: `src-tauri/target/release/bundle/deb/`

### Android 版（可选）

**首次需要初始化：**

```bash
npm run android:init
```

**开发调试：**

```bash
npm run android:dev
```

**打包 APK：**

```bash
npm run android:build
```

APK 位置：`src-tauri/gen/android/app/build/outputs/apk/`

---

## 🎯 下一步

- 📖 阅读完整文档：`README.md`
- 🔍 了解项目结构
- 🎨 自定义 UI：编辑 `src/index.html` 和 `src/assets/css/main.css`
- 🔌 添加新的 LLM 提供商

---

## 💡 小提示

1. **开发模式下可以实时调试**：按 F12 打开开发者工具
2. **配置会自动保存**：重启应用后无需重新配置
3. **聊天记录存储在本地**：位于 `src-tauri/app.db`
4. **API Key 是加密存储的**：放心使用

---

## 📞 需要帮助？

- 查看详细文档：`README.md`
- 查看安装指南：`INSTALL_GUIDE.md`
- 检查浏览器控制台的错误信息
- 检查 Rust 编译输出

**祝你使用愉快！** 🎉
