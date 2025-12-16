# Android 配置调试指南

## 问题描述
在 Android 设备上，每次重新打开 APP 后，配置会自动切换到第一个配置，而不是最后保存的配置。

## 调试工具

### 1. 调试面板
现在 APP 中内置了一个屏幕调试面板，可以在 Android 设备上直接查看日志。

**使用方法**：
1. 打开 APP
2. 点击屏幕右下角的绿色 **"DEBUG"** 按钮
3. 底部会弹出黑色调试面板，显示实时日志
4. 再次点击 **"DEBUG"** 按钮可以隐藏面板

### 2. 配置调试信息
在配置面板中添加了"调试信息"按钮。

**使用方法**：
1. 打开 **API 配置** 面板
2. 点击左下角的 **"调试信息"** 按钮
3. 调试面板会自动显示并输出以下信息：
   - 配置总数
   - 当前活跃配置 ID
   - 当前活跃配置名称和 provider
   - 所有配置列表（标记当前配置）
   - localStorage 中的 activeProfileId

## 调试步骤

### 第一步：检查保存时的日志

1. 打开 APP，点击右下角 **"DEBUG"** 按钮显示调试面板
2. 打开 **API 配置** 面板
3. 切换到你想要的配置（例如 claude）
4. 修改任意设置（或不修改）
5. 点击 **"保存"** 按钮
6. **观察调试面板的日志**，应该看到：
   ```
   ✓ 保存配置: claude (ID: profile-xxx), 设置为活跃配置
   ✓ 持久化配置: activeProfileId=profile-xxx, profiles数量=2
   ✓ save_kv profiles 成功 (Tauri)
   ✓ localStorage profiles 保存成功（备份）
   ```

### 第二步：检查加载时的日志

1. **完全关闭** APP（从后台也关闭）
2. 重新打开 APP
3. 立即点击右下角 **"DEBUG"** 按钮查看日志
4. **观察调试面板的日志**，应该看到：
   ```
   ✓ load_kv profiles 成功 (Tauri): activeProfileId=profile-xxx, profiles数量=2
   ✓ 配置加载成功: claude (ID: profile-xxx), provider: anthropic
   ```

### 第三步：使用调试信息按钮

1. 打开 **API 配置** 面板
2. 点击 **"调试信息"** 按钮
3. 查看调试面板输出的详细信息：
   ```
   ✓ === 配置调试信息 ===
   ✓ 配置总数: 2
   ✓ 当前活跃ID: profile-xxx
   ✓ 当前活跃配置: claude (anthropic)
   ✓   1. claude (anthropic) ← 当前
   ✓   2. gemini (makersuite)
   ✓ localStorage activeProfileId: profile-xxx
   ✓ === 调试面板已打开 ===
   ```

## 问题诊断

### 情况 1：保存时没有看到持久化日志
**可能原因**：
- Tauri KV 存储失败
- localStorage 保存失败

**解决方案**：
- 检查应用权限（存储权限）
- 查看是否有错误日志（红色 ❌）

### 情况 2：重新打开时 activeProfileId 是 null 或错误的 ID
**可能原因**：
- 存储被清除
- activeProfileId 没有正确保存

**解决方案**：
- 查看加载日志中的 `activeProfileId` 值
- 如果是 null，说明存储没有保存成功
- 如果是错误的 ID，说明保存的是旧值

### 情况 3：加载了错误的配置
**可能原因**：
- activeProfileId 指向不存在的配置
- 自动选择逻辑选择了第一个而不是最近使用的

**解决方案**：
- 查看日志中是否有 "自动选择最近使用的配置" 消息
- 如果有，说明 activeProfileId 无效，系统自动选择了最近修改的配置
- 如果没有，检查加载的配置是否就是 activeProfileId 指向的配置

## 预期行为

### 正常情况
1. **保存 claude 配置**：
   ```
   持久化配置: activeProfileId=profile-claude-id, profiles数量=2
   save_kv profiles 成功 (Tauri)
   localStorage profiles 保存成功（备份）
   ```

2. **重新打开 APP**：
   ```
   load_kv profiles 成功 (Tauri): activeProfileId=profile-claude-id, profiles数量=2
   配置加载成功: claude (ID: profile-claude-id), provider: anthropic
   ```

### 异常情况
如果 activeProfileId 丢失，系统会自动选择最近修改的配置：
```
自动选择最近使用的配置: claude
配置加载成功: claude (ID: profile-claude-id), provider: anthropic
```

## NPM Dev 模式日志

如果你使用 `npm run dev` 启动，可以在终端中看到更详细的日志输出。

### 查看完整日志
1. 在电脑上运行 `npm run dev`
2. 在手机上打开开发版 APP
3. 终端会实时显示所有日志，包括：
   - 配置加载过程
   - 存储读写操作
   - 错误堆栈

## 报告问题

如果问题仍然存在，请提供以下信息：

1. **保存时的日志**（调试面板截图或复制文本）
2. **重新打开时的日志**（调试面板截图或复制文本）
3. **调试信息按钮的输出**（调试面板截图或复制文本）
4. **操作步骤**（例如：创建了哪些配置，最后保存的是哪个）
5. **设备信息**（例如：Pixel 10, Android 版本）

## 更新日志

- **2025-12-16**：
  - 添加屏幕调试面板（右下角 DEBUG 按钮）
  - 添加配置调试信息按钮
  - 增强持久化日志输出
  - 修复 activeProfileId 选择逻辑（按 updatedAt 排序）
