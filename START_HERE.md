# 🎯 从这里开始 (Pixel 10 专用)

> **目标**：在 Pixel 10 上运行聊天应用

---

## 📋 快速启动检查清单

### ✅ 第一步：安装开发环境

```powershell
# 检查是否已安装
node --version    # >= 18.0.0
rustc --version   # 任意版本
java -version     # 17.x.x
adb devices       # 应该显示你的 Pixel 10
```

**如果有任何缺失，查看：**

👉 **`../INSTALL_GUIDE.md`** - 完整的 Windows 11 环境安装指南

---

### ✅ 第二步：安装项目依赖

```powershell
cd D:\my\手機\tauri-chat-app

# 安装 Node 依赖
npm install

# 下载前端库
bash scripts/download-deps.sh
```

**如果没有 bash：**

```powershell
# 手动下载
New-Item -ItemType Directory -Force -Path src/lib, src/assets/css

Invoke-WebRequest -Uri "https://code.jquery.com/jquery-3.7.1.min.js" -OutFile "src/lib/jquery.min.js"
Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.js" -OutFile "src/lib/toastr.min.js"
Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.css" -OutFile "src/assets/css/toastr.min.css"
```

---

### ✅ 第三步：初始化 Android 项目

```powershell
npm run tauri android init
```

⏰ **首次需要 5-10 分钟**（下载 Gradle 依赖）

---

### ✅ 第四步：连接 Pixel 10

1. 用 USB 连接手机到电脑
2. 在手机上允许 USB 调试
3. 验证连接：

```powershell
adb devices
```

---

### ✅ 第五步：启动应用！

```powershell
npm run tauri android dev
```

⏰ **首次编译需要 20-30 分钟**（Rust + Android），请耐心等待！

**成功标志：**
- 应用自动安装到 Pixel 10
- 手机上应用自动打开
- 看到聊天界面

---

## 🎨 第六步：配置 API

应用启动后：

1. 点击右上角 **⚙️ 配置**
2. 填写你的 API 信息
3. 测试连接
4. 保存

### 配置示例

**OpenAI:**
```
Provider: OpenAI
Base URL: https://api.openai.com/v1
API Key: sk-你的密钥
Model: gpt-3.5-turbo
Stream: ✓
```

**Claude:**
```
Provider: Anthropic
Base URL: https://api.anthropic.com/v1
API Key: sk-ant-你的密钥
Model: claude-3-5-sonnet-20241022
Stream: ✓
```

---

## 🚀 第七步：测试聊天

输入消息，测试：
- ✅ 消息能正常发送
- ✅ AI 回复逐字显示（流式）
- ✅ 聊天记录保存

---

## 📱 打包发布版（可选）

开发测试成功后：

```powershell
npm run tauri android build
```

APK 位置：
```
src-tauri/gen/android/app/build/outputs/apk/universal/release/
```

---

## ⚠️ 遇到问题？

### 常见问题速查

**1. Gradle 下载超时**

编辑 `src-tauri/gen/android/build.gradle`，添加阿里云镜像：

```gradle
allprojects {
    repositories {
        maven { url 'https://maven.aliyun.com/repository/public/' }
        maven { url 'https://maven.aliyun.com/repository/google/' }
        google()
        mavenCentral()
    }
}
```

**2. NDK 版本错误**

```powershell
# 确认 NDK 版本
dir "$env:LOCALAPPDATA\Android\Sdk\ndk"

# 应该有 25.2.9519653，没有就安装
sdkmanager --install "ndk;25.2.9519653"
```

**3. Rust 交叉编译失败**

```powershell
# 添加 Android 编译目标
rustup target add aarch64-linux-android
rustup target add armv7-linux-androideabi
```

**4. 应用闪退**

查看日志：

```powershell
adb logcat | Select-String "ChatApp"
```

---

## 📚 详细文档

- **📱 `ANDROID_BUILD_GUIDE.md`** - 完整的 Android 构建指南
- **🔧 `INSTALL_GUIDE.md`** - 环境安装详解
- **📖 `README.md`** - 项目功能和 API 文档

---

## 💡 小贴士

1. **首次编译很慢**：Rust 需要交叉编译到 ARM64，要 20-30 分钟
2. **后续快速**：增量编译只需 30 秒 - 2 分钟
3. **开发模式**：代码修改后会自动热重载
4. **查看日志**：用 `adb logcat` 查看详细错误

---

## 🎯 时间表

| 任务 | 预计时间 |
|------|---------|
| 安装环境 | 30-60 分钟 |
| 安装依赖 | 5 分钟 |
| 首次编译 | 20-30 分钟 |
| 配置测试 | 5 分钟 |
| **总计** | **1-2 小时** |

---

## 🎉 成功后

Android 版本成功运行后，你可以：

1. 🎨 **迁移 UI**：将 `手机流式.html` 的样式复制过来
2. ⚡ **添加功能**：群聊、精灵、世界书等
3. 🖥️ **考虑桌面版**：Windows/macOS 版本
4. 📦 **发布应用**：上传到 Play Store

---

**准备好了吗？开始你的第一次构建吧！** 🚀

```powershell
npm run tauri android dev
```

**有问题随时查看详细文档，祝你成功！** 💪
