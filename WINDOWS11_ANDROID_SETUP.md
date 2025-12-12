# 🚀 Windows 11 + Pixel 10 完整启动指南

> **一站式指南**：从零开始，在 Pixel 10 上运行你的聊天应用

## 📊 你的系统配置

- **OS**: Windows 11
- **GPU**: NVIDIA GeForce RTX 4060
- **CUDA**: 13.0
- **目标设备**: Google Pixel 10

---

## 🎯 整体流程概览

```
[安装环境] → [配置 Android] → [构建项目] → [测试应用] → [迁移 UI]
  30-60分钟     10分钟           30分钟        5分钟        按需
```

---

## 第一阶段：环境安装 (30-60 分钟)

### 1️⃣ Node.js ✅ (你已安装)

验证版本：
```powershell
node --version  # 应该 >= 18.0.0
```

### 2️⃣ 安装 Rust

```powershell
# 下载并运行安装器
Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile "$env:TEMP\rustup-init.exe"
& "$env:TEMP\rustup-init.exe"
```

选择 `1) Proceed with installation`，然后**重启 PowerShell**。

### 3️⃣ 安装 Java 17

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
```

重启 PowerShell 后验证：
```powershell
java -version  # 应显示 17.x.x
```

### 4️⃣ 安装 Android Studio

1. 下载：https://developer.android.com/studio
2. 运行安装（默认选项即可）
3. 打开 Android Studio → **More Actions → SDK Manager**
4. 安装以下组件：

**SDK Platforms:**
- ✅ Android 13.0 (API 33)
- ✅ Android 14.0 (API 34)

**SDK Tools:**
- ✅ Android SDK Build-Tools 34
- ✅ NDK (Side by side) - **25.2.9519653**
- ✅ Android SDK Command-line Tools
- ✅ Android SDK Platform-Tools

### 5️⃣ 配置环境变量

**PowerShell (管理员模式)：**

```powershell
# 设置 ANDROID_HOME
[System.Environment]::SetEnvironmentVariable(
    "ANDROID_HOME",
    "$env:LOCALAPPDATA\Android\Sdk",
    "User"
)

# 设置 NDK_HOME
[System.Environment]::SetEnvironmentVariable(
    "NDK_HOME",
    "$env:LOCALAPPDATA\Android\Sdk\ndk\25.2.9519653",
    "User"
)

# 添加到 PATH
$currentPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$newPaths = @(
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools",
    "$env:LOCALAPPDATA\Android\Sdk\cmdline-tools\latest\bin"
)
foreach ($path in $newPaths) {
    if ($currentPath -notlike "*$path*") {
        $currentPath = "$currentPath;$path"
    }
}
[System.Environment]::SetEnvironmentVariable("Path", $currentPath, "User")
```

**重启 PowerShell 后验证：**

```powershell
echo $env:ANDROID_HOME
echo $env:NDK_HOME
adb --version
```

### 6️⃣ 安装 Tauri CLI

```powershell
cargo install tauri-cli --version "^2.0"
```

⏰ 这个过程需要 10-20 分钟，请耐心等待。

---

## 第二阶段：配置 Pixel 10 (5 分钟)

### 启用开发者选项

1. 在 Pixel 10：**设置 → 关于手机 → 版本号**
2. 连续点击**版本号** 7 次
3. 返回：**设置 → 系统 → 开发者选项**
4. 开启：
   - ✅ USB 调试
   - ✅ USB 安装

### 连接测试

```powershell
# 连接 USB 后
adb devices
```

应显示：
```
List of devices attached
<设备ID>    device
```

---

## 第三阶段：构建项目 (30 分钟)

### 1. 进入项目

```powershell
cd D:\my\手機\tauri-chat-app
```

### 2. 安装依赖

```powershell
# Node 依赖
npm install

# 前端库（如果 bash 不可用，用下面的方法）
New-Item -ItemType Directory -Force -Path src/lib, src/assets/css

Invoke-WebRequest -Uri "https://code.jquery.com/jquery-3.7.1.min.js" -OutFile "src/lib/jquery.min.js"
Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.js" -OutFile "src/lib/toastr.min.js"
Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.css" -OutFile "src/assets/css/toastr.min.css"
```

### 3. 初始化 Android

```powershell
npm run tauri android init
```

⏰ 首次需要 5-10 分钟（下载 Gradle）

### 4. 添加 Rust 编译目标

```powershell
rustup target add aarch64-linux-android
rustup target add armv7-linux-androideabi
```

### 5. 启动开发模式

```powershell
npm run tauri android dev
```

⏰ **首次编译需要 20-30 分钟**，之后只需 1-2 分钟。

---

## 第四阶段：测试应用 (5 分钟)

应用会自动安装到 Pixel 10 并启动。

### 配置 API

1. 点击右上角 **⚙️ 配置**
2. 选择服务商（OpenAI/Anthropic）
3. 填写 API 信息
4. 点击**测试连接**
5. 保存

### 测试聊天

- 发送消息
- 观察 AI 回复是否逐字显示
- 检查聊天记录保存

---

## ⚠️ 常见问题速查

### Gradle 下载超时

编辑 `src-tauri/gen/android/build.gradle`：

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

### NDK 找不到

```powershell
# 检查
dir "$env:LOCALAPPDATA\Android\Sdk\ndk"

# 如果没有 25.2.9519653
sdkmanager --install "ndk;25.2.9519653"
```

### 应用闪退

查看日志：
```powershell
adb logcat | Select-String "ChatApp"
```

---

## 📱 打包发布版

测试成功后：

```powershell
npm run tauri android build
```

APK 位置：
```
src-tauri/gen/android/app/build/outputs/apk/universal/release/
```

---

## 🎨 下一步：迁移 UI

Android 版本成功后，可以开始迁移 `手机流式.html` 的功能：

1. **样式迁移**
   - 复制 CSS 到 `src/assets/css/`
   - 调整响应式布局

2. **功能迁移**
   - QQ 风格聊天界面
   - 群聊功能
   - 精灵系统
   - 世界书数据

3. **逐步测试**
   - 每迁移一个功能就测试
   - 确保 Android 上正常工作

---

## 📚 详细文档链接

- **`INSTALL_GUIDE.md`** - 完整环境安装指南
- **`ANDROID_BUILD_GUIDE.md`** - Android 构建详解
- **`START_HERE.md`** - 快速启动检查清单
- **`README.md`** - 项目功能文档

---

## 💡 关于你的 GPU

你的 RTX 4060 + CUDA 13.0 对这个项目**不是必需的**：

- ✅ 当前项目调用云端 API（OpenAI/Claude）
- ✅ 不需要本地 LLM 推理
- ⏭️ 如果以后想跑 Llama 等本地模型，GPU 才会用上

---

## 🎯 预期时间线

| 阶段 | 时间 | 状态 |
|------|------|------|
| 环境安装 | 30-60 分钟 | ⏳ 待开始 |
| Android 配置 | 5 分钟 | ⏳ 待开始 |
| 项目构建 | 30 分钟 | ⏳ 待开始 |
| 测试应用 | 5 分钟 | ⏳ 待开始 |
| **总计** | **1-2 小时** | |

---

## ✅ 成功检查清单

- [ ] Pixel 10 上能打开应用
- [ ] 配置界面正常显示
- [ ] API 连接测试成功
- [ ] 发送消息能收到回复
- [ ] 流式响应逐字显示
- [ ] 聊天记录能保存

全部打勾后，你就成功了！🎉

---

**准备好开始了吗？** 从第一阶段开始，按步骤执行！

有任何问题随时查看详细文档或提问。加油！💪
