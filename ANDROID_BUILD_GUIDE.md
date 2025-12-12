# 📱 Android 构建指南 (Pixel 10 专用)

> **目标**：在 Pixel 10 上运行聊天应用

## 前置条件检查

在开始之前，确保你已完成：

```powershell
# ✅ 验证所有工具已安装
node --version        # >= 18.0.0
rustc --version       # 任意版本
java -version         # 17.x.x
cargo tauri --version # 2.x.x

# ✅ 验证 Android 环境
echo $env:ANDROID_HOME
echo $env:NDK_HOME
adb devices          # 应该显示你的 Pixel 10
```

如果有任何问题，返回 `INSTALL_GUIDE.md` 检查。

---

## 🚀 构建步骤（从零开始）

### 步骤 1: 进入项目目录

```powershell
cd D:\my\手機\tauri-chat-app
```

### 步骤 2: 安装项目依赖

```powershell
# 安装 Node 依赖
npm install

# 下载前端库（jQuery, Toastr）
bash scripts/download-deps.sh
```

如果 `bash` 命令不可用，手动下载：

```powershell
# 创建目录
New-Item -ItemType Directory -Force -Path src/lib
New-Item -ItemType Directory -Force -Path src/assets/css

# 下载 jQuery
Invoke-WebRequest -Uri "https://code.jquery.com/jquery-3.7.1.min.js" -OutFile "src/lib/jquery.min.js"

# 下载 Toastr
Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.js" -OutFile "src/lib/toastr.min.js"
Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.css" -OutFile "src/assets/css/toastr.min.css"
```

### 步骤 3: 初始化 Android 项目

```powershell
npm run tauri android init
```

**这个步骤会：**
- 创建 `src-tauri/gen/android/` 目录
- 生成 Android 项目结构
- 配置 Gradle 构建脚本

⏰ **可能需要 5-10 分钟**，首次会下载很多 Gradle 依赖。

---

### 步骤 4: 连接 Pixel 10

**4.1 物理连接**

1. 用 USB 数据线连接 Pixel 10 到电脑
2. 在手机上点击**允许 USB 调试**

**4.2 验证连接**

```powershell
adb devices
```

应该显示：
```
List of devices attached
<你的设备ID>    device
```

如果显示 `unauthorized`，在手机上重新授权。

---

### 步骤 5: 开发模式运行（推荐先测试）

```powershell
npm run tauri android dev
```

**这个命令会：**
1. 编译 Rust 代码（首次很慢，10-20 分钟）
2. 构建 Android 应用
3. 安装到 Pixel 10
4. 启动应用并开启热重载

**⏰ 首次构建非常慢（20-30 分钟），请耐心等待！**

---

### 步骤 6: 测试应用

应用安装后会自动启动。测试以下功能：

1. ✅ 应用能否正常打开
2. ✅ 点击右上角 **⚙️ 配置** 能否弹出配置面板
3. ✅ 配置 API 后能否连接（测试连接按钮）
4. ✅ 发送消息是否正常

---

### 步骤 7: 打包发布版 APK

开发测试成功后，构建发布版：

```powershell
npm run tauri android build
```

**APK 位置：**

```
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
```

---

## 🔧 Tauri Android 配置优化

### 修改 Android 特定配置

编辑 `src-tauri/tauri.conf.json`，添加 Android 配置：

```json
{
  "bundle": {
    "android": {
      "minSdkVersion": 24,
      "versionCode": 1
    }
  }
}
```

### 网络权限配置

确保 `src-tauri/gen/android/app/src/main/AndroidManifest.xml` 有：

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### 允许明文 HTTP（开发环境）

创建 `src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml`：

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- 开发环境：允许本地 HTTP -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>
    </domain-config>

    <!-- 生产环境：仅 HTTPS -->
    <base-config cleartextTrafficPermitted="false" />
</network-security-config>
```

然后在 `AndroidManifest.xml` 中引用：

```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
</application>
```

---

## ⚠️ 常见问题与解决

### 问题 1: Gradle 构建超时

**症状**: 下载依赖超时

**解决方案**: 配置国内镜像

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

### 问题 2: NDK 错误

**症状**: `NDK not found` 或版本不匹配

**解决方案**: 确认 NDK 版本

```powershell
# 检查已安装的 NDK
dir "$env:LOCALAPPDATA\Android\Sdk\ndk"

# 如果没有 25.2.9519653，安装它
sdkmanager --install "ndk;25.2.9519653"

# 重新设置环境变量
$env:NDK_HOME = "$env:LOCALAPPDATA\Android\Sdk\ndk\25.2.9519653"
```

### 问题 3: Rust 编译错误

**症状**: 交叉编译到 Android 失败

**解决方案**: 添加 Android 目标

```powershell
# 添加 Android 编译目标
rustup target add aarch64-linux-android
rustup target add armv7-linux-androideabi
rustup target add i686-linux-android
rustup target add x86_64-linux-android

# 重新构建
npm run tauri android build
```

### 问题 4: 应用安装但无法打开

**症状**: 安装成功但点击图标闪退

**检查步骤**:

1. 查看日志：

```powershell
adb logcat | Select-String "ChatApp"
```

2. 检查 WebView：

Pixel 10 应该自带 Chrome WebView，但如果有问题：

- 设置 → 应用 → Chrome → 更新
- 或在 Play Store 搜索 "Android System WebView" 并更新

### 问题 5: API 调用失败

**症状**: 配置后无法发送消息

**检查网络**:

```powershell
# 在电脑上测试 API
curl https://api.openai.com/v1/models -H "Authorization: Bearer YOUR_API_KEY"
```

**检查 CSP 配置**:

确保 `src-tauri/tauri.conf.json` 的 `connect-src` 包含你的 API 域名。

---

## 🎯 性能优化

### 减少 APK 体积

编辑 `src-tauri/gen/android/app/build.gradle`：

```gradle
android {
    buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt')
        }
    }
}
```

### 启用 ProGuard 混淆

创建 `src-tauri/gen/android/app/proguard-rules.pro`：

```
-keep class com.chatapp.dev.** { *; }
-keep class rust.** { *; }
```

---

## 📱 发布到 Play Store（可选）

### 1. 生成签名密钥

```powershell
keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

### 2. 配置签名

编辑 `src-tauri/gen/android/app/build.gradle`：

```gradle
android {
    signingConfigs {
        release {
            storeFile file("path/to/my-release-key.keystore")
            storePassword "your_password"
            keyAlias "my-key-alias"
            keyPassword "your_password"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

### 3. 构建签名 APK

```powershell
npm run tauri android build -- --release
```

---

## 🚀 快速命令参考

```powershell
# 开发模式（热重载）
npm run tauri android dev

# 构建发布版
npm run tauri android build

# 查看日志
adb logcat

# 卸载应用
adb uninstall com.chatapp.dev

# 安装 APK
adb install path/to/app.apk

# 查看已安装的包
adb shell pm list packages | Select-String "chatapp"
```

---

## 📊 预期时间表

| 步骤 | 首次 | 后续 |
|------|------|------|
| 安装依赖 | 5 分钟 | - |
| Android 初始化 | 10 分钟 | - |
| 首次编译 | 20-30 分钟 | 2-5 分钟 |
| 增量编译 | - | 30 秒 - 2 分钟 |

---

## 🎉 成功标志

当你看到以下情况，说明成功了：

1. ✅ Pixel 10 上能打开应用
2. ✅ 配置面板可以正常使用
3. ✅ API 连接测试成功
4. ✅ 发送消息能收到回复
5. ✅ 流式响应逐字显示

---

## 💡 下一步

Android 版本成功后：

1. 🎨 **自定义 UI**: 将 `手机流式.html` 的样式迁移过来
2. 🔌 **添加功能**: 实现群聊、精灵系统等
3. 🖥️ **桌面版**: 考虑开发 Windows 版本
4. 📦 **发布**: 上传到 Play Store

---

**遇到问题？** 检查：
1. PowerShell 日志输出
2. `adb logcat` 手机日志
3. Android Studio 的 Logcat
4. Tauri 官方文档: https://v2.tauri.app/develop/android/

**加油！你很快就能在 Pixel 10 上运行你的聊天应用了！** 🚀
