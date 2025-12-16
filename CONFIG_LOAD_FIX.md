# API 配置加载修复文档

## 问题描述

用户反映：有多个 API 配置（如 gemini 和 claude），最后一次保存的是 claude，但每次重新打开 APP 时，配置会自动切换回 gemini。

## 问题原因

在 `src/scripts/storage/config.js` 的 `ensureStores()` 方法中，当 `activeProfileId` 不存在或无效时，系统会自动选择一个配置作为活跃配置。

**原有逻辑**：
```javascript
// 按照插入顺序选择第一个配置
if (!this.profileStore.activeProfileId) {
    this.profileStore.activeProfileId = Object.keys(this.profileStore.profiles)[0] || null;
    await this.persistProfiles(this.profileStore);
}
```

问题在于：
1. `Object.keys()` 返回的顺序是**按照插入顺序**，而不是按照最后使用时间
2. 如果 gemini 是先创建的，它的 ID 会排在第一个
3. 当 `activeProfileId` 丢失或无效时，系统会自动选择 gemini（第一个），而不是 claude（最后使用的）

## 修复方案

### 1. 确保 activeProfileId 字段存在

```javascript
// 确保 activeProfileId 字段存在（防止 undefined）
if (!profiles.hasOwnProperty('activeProfileId')) {
    profiles.activeProfileId = null;
}
```

### 2. 按照 updatedAt 排序选择最近使用的配置

```javascript
// 按照 updatedAt 排序选择最近使用的
if (!this.profileStore.activeProfileId || !this.profileStore.profiles[this.profileStore.activeProfileId]) {
    const profileList = Object.values(this.profileStore.profiles).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    this.profileStore.activeProfileId = profileList[0]?.id || null;
    if (this.profileStore.activeProfileId) {
        logger.info(`自动选择最近使用的配置: ${profileList[0]?.name}`);
        await this.persistProfiles(this.profileStore);
    }
}
```

### 3. 添加调试日志

在关键方法中添加日志，方便追踪配置的加载和保存：

- `load()`: 显示加载的配置名称、ID 和 provider
- `save()`: 显示保存的配置名称和 ID
- `setActiveProfile()`: 显示切换的配置名称

## 修复后的行为

1. **正常情况**：如果 `activeProfileId` 存在且有效，使用该配置
2. **activeProfileId 丢失**：自动选择**最近保存/使用**的配置（按 `updatedAt` 降序）
3. **activeProfileId 指向不存在的配置**：自动选择最近使用的配置

## 验证步骤

### 测试场景 1：基本功能
1. 创建两个配置：gemini 和 claude
2. 保存 claude 配置
3. 关闭并重新打开 APP
4. **预期结果**：应该自动加载 claude 配置

### 测试场景 2：切换配置
1. 切换到 gemini 配置（不保存，只切换）
2. 关闭并重新打开 APP
3. **预期结果**：应该加载 gemini 配置（因为切换时会保存 activeProfileId）

### 测试场景 3：修改并保存
1. 切换到 claude 配置
2. 修改某些设置并保存
3. 关闭并重新打开 APP
4. **预期结果**：应该加载 claude 配置

### 测试场景 4：多次切换
1. 切换到 gemini
2. 切换到 claude
3. 切换回 gemini
4. 关闭并重新打开 APP
5. **预期结果**：应该加载 gemini 配置（最后切换的）

## 查看日志

打开浏览器/WebView 的开发者工具控制台，查看以下日志：

- `配置加载成功: [配置名] (ID: [ID]), provider: [provider]`
- `保存配置: [配置名] (ID: [ID]), 设置为活跃配置`
- `切换活跃配置: [配置名] (ID: [ID])`
- `自动选择最近使用的配置: [配置名]`（仅在 activeProfileId 无效时出现）

## 额外说明

### updatedAt 更新时机

`updatedAt` 字段会在以下情况下更新：
1. 保存配置时（`save()` 方法）
2. 创建新配置时（`createProfile()` 方法）
3. 重命名配置时（`renameProfile()` 方法）

**不会更新的情况**：
- 仅切换配置（`setActiveProfile()`）不会更新 `updatedAt`
- 这是正确的行为，因为切换配置不应该改变配置的"最后修改时间"

### 关于配置选择器的顺序

配置选择器下拉框中的配置顺序按照 `updatedAt` 降序排列（最近使用的在最上面），这与自动选择的逻辑一致。

## 相关文件

- `src/scripts/storage/config.js` - 配置管理核心逻辑
- `src/scripts/ui/config-panel.js` - 配置面板 UI

## 修复日期

2025-12-16
