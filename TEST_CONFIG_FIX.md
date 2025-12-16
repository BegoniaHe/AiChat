# 配置加载问题测试指南

## 已完成的修复

### 1. 按钮布局优化 ✅
- "调试信息" 按钮改为小按钮，独立放在上方
- 主要操作按钮（测试连接、取消、保存）统一样式，右对齐
- 按钮大小和间距协调

### 2. 调试面板增强 ✅
- APP 启动时自动显示 8 秒
- 显示配置加载日志
- 显示每个配置的最后修改时间
- 日志增加到 30 条

### 3. 防止配置意外切换 ✅
- 刷新配置选择器时不会触发配置切换
- 添加更多日志跟踪配置切换操作

## 测试步骤

### 步骤 1：重新构建并安装 APP

```bash
npm run tauri android build
```

安装到手机后打开 APP。

### 步骤 2：观察启动时的调试日志

1. **重新打开 APP**（完全关闭后台再打开）
2. APP 启动后，**调试面板会自动显示 8 秒**
3. **立即查看显示的日志**，应该包含：

```
✓ === APP 启动，调试面板已激活 ===
✓ load_kv profiles 成功 (Tauri): activeProfileId=profile-xxx, profiles数量=4
✓ 配置加载成功: [配置名] (ID: profile-xxx), provider: [provider]
```

**关键点**：
- 确认加载的配置名称是否是你最后保存的那个
- 如果不是，记录日志中显示的配置名称

### 步骤 3：查看详细配置状态

1. 打开 **API 配置** 面板
2. 点击左上角的 **"🔍 调试信息"** 按钮（现在是小按钮）
3. 调试面板会显示：

```
✓ === 配置调试信息 ===
✓ 配置总数: 4
✓ 当前活跃ID: profile-xxx...
✓ 当前活跃配置: Vertex (vertexai)
✓ --- 所有配置（按最后修改时间排序）---
✓   1. Vertex (vertexai) ← 当前 [最新]
✓      更新: 12/16 22:54
✓   2. Claude (anthropic)
✓      更新: 12/16 18:30
✓   3. Gemini (makersuite)
✓      更新: 12/16 10:15
✓   4. OpenAI (openai)
✓      更新: 12/15 14:20
```

**关键点**：
- 第一个配置应该是最近修改的（标记 [最新]）
- 当前配置（标记 ← 当前）应该也是第一个
- 如果不是，说明有问题

### 步骤 4：测试保存配置

1. 在配置面板中选择一个配置（例如 Claude）
2. 修改任意设置（或不修改）
3. 点击 **"保存"** 按钮
4. **观察调试面板的日志**：

```
✓ 用户切换配置: profile-yyy...  （如果你切换了配置）
✓ 切换活跃配置: Claude (ID: profile-yyy)
✓ 保存配置: Claude (ID: profile-yyy), 设置为活跃配置
✓ 持久化配置: activeProfileId=profile-yyy, profiles数量=4
✓ save_kv profiles 成功 (Tauri)
✓ localStorage profiles 保存成功（备份）
✓ 配置保存成功！
```

### 步骤 5：验证配置持久化

1. **完全关闭 APP**（从后台也关闭）
2. **重新打开 APP**
3. **立即查看调试面板**（自动显示 8 秒）
4. 确认加载的配置是否是 Claude：

```
✓ load_kv profiles 成功 (Tauri): activeProfileId=profile-yyy, profiles数量=4
✓ 配置加载成功: Claude (ID: profile-yyy), provider: anthropic
```

5. 打开配置面板，点击 **"🔍 调试信息"**，确认：
   - 当前活跃配置是 Claude
   - Claude 是最新修改的配置

## 预期结果

### ✅ 正确情况

1. **保存时**：activeProfileId 设置为你保存的配置
2. **重新打开时**：加载的配置就是你保存的那个
3. **调试信息**：当前配置 = 最新修改的配置

### ❌ 错误情况（如果仍然出现）

如果重新打开后配置错误，请提供以下信息：

1. **保存时的日志截图**（包含 activeProfileId）
2. **重新打开时的日志截图**（包含加载的配置）
3. **调试信息截图**（所有配置及修改时间）
4. **具体步骤**：
   - 你有哪些配置？
   - 你最后保存的是哪个？
   - 重新打开后变成了哪个？

## 可能的问题和解决方案

### 问题 1：调试面板没有自动显示

**解决**：手动点击右下角 **"DEBUG"** 按钮

### 问题 2：日志显示保存成功，但重新打开后配置错误

这说明问题可能在：
- Tauri KV 存储没有正确保存
- 加载时从错误的来源加载
- 某个地方在加载后又修改了配置

**需要的信息**：
- 保存时的 activeProfileId
- 加载时的 activeProfileId
- localStorage 中的 activeProfileId（从调试信息查看）

### 问题 3：配置总是变成第一个

如果调试信息显示：
```
自动选择最近使用的配置: [配置名]
```

说明 activeProfileId 丢失了，系统自动选择了最近修改的配置。

## 其他改进

### 按钮布局

现在配置面板底部的按钮布局更美观：
- 调试信息：小按钮，左上角
- 测试连接、取消、保存：统一大小，右对齐

### 日志详细程度

现在日志包含更多信息：
- 配置 ID（前 20 字符）
- 最后修改时间
- 是否是当前活跃配置
- 是否是最新修改的配置

## 最新修复（2025-12-16 23:10）

### Tauri 后端增强日志

现在 Rust 后端会在终端输出详细的保存/加载日志，帮助定位问题：

**保存时的终端输出**：
```
[save_kv] 文件: "/data/data/com.taurichat.app/files/llm_profiles_v1.json", 大小: 2345 bytes
[save_kv] activeProfileId: profile-1765814569599-2f6ecb
```

**加载时的终端输出**：
```
[load_kv] 文件: "/data/data/com.taurichat.app/files/llm_profiles_v1.json", 大小: 2345 bytes
[load_kv] activeProfileId: profile-1765814569599-2f6ecb
[load_kv] profiles数量: 4
```

### 测试步骤（使用终端日志）

1. **启动开发模式**（推荐）：
   ```bash
   npm run dev
   ```
   这样可以在电脑终端看到所有 Rust 后端日志。

2. **在手机上操作**：
   - 打开 APP（连接到 dev 服务器）
   - 打开 API 配置面板
   - 选择一个配置（例如 Vertex）
   - 点击保存

3. **查看终端日志**：
   - 应该看到 `[save_kv] activeProfileId: profile-xxx`
   - **记录这个 ID**

4. **关闭并重新打开 APP**：
   - 完全关闭 APP（从后台也关闭）
   - 重新打开 APP

5. **查看终端日志**：
   - 应该看到 `[load_kv] activeProfileId: profile-xxx`
   - **这个 ID 应该和第 3 步的 ID 完全一致**

6. **如果 ID 不一致**：
   - 说明存储仍然有问题
   - 提供终端日志的完整输出（包括 [save_kv] 和 [load_kv] 行）

### Android fsync 修复

为了解决 Android 文件系统缓存问题，现在 `save_kv` 在写入文件后会调用 `fsync()` 系统调用，强制将数据立即刷新到磁盘。这应该能解决数据未正确持久化的问题。

**需要重新构建 APK 才能测试此修复**：
```bash
npm run tauri android build
```

## 更新日期

2025-12-16 23:10
