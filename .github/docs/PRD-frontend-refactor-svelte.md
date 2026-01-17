# PRD: 前端重构 - Svelte + npm 工程化迁移

> **版本**: 1.0.0  
> **日期**: 2026-01-17  
> **状态**: Draft  
> **负责人**: AI Assistant

---

## 一、项目背景

### 1.1 现状问题

当前项目前端采用**散装依赖管理**，存在以下问题：

1. **无包管理器管理前端依赖**
   - 依赖通过shell脚本手动下载: `scripts/download-deps.sh:1-40`
   - jQuery和Toastr直接存放在: `src/lib/`
   - 无版本锁定，无依赖树管理

2. **无构建工具**
   - 直接使用浏览器原生ES Modules
   - 无Tree-shaking、代码分割、压缩优化
   - 开发时无热重载(HMR)

3. **巨型文件反模式**
   - 主入口文件过大: `src/scripts/ui/app.js` (8410行)
   - 桥接层过大: `src/scripts/ui/bridge.js` (3307行)
   - 难以维护和测试

4. **emoji作为UI图标**
   - 非标准做法，跨平台显示可能不一致
   - 示例: `src/index.html:147-153`

### 1.2 重构目标

| 目标 | 描述 |
|------|------|
| **工程化** | 使用npm/pnpm管理依赖，Vite构建 |
| **组件化** | 迁移到Svelte组件架构 |
| **可维护性** | 拆分巨型文件，单文件<500行 |
| **类型安全** | 可选TypeScript/JSDoc类型注解 |
| **测试覆盖** | 添加单元测试和E2E测试 |

---

## 二、现有架构分析

### 2.1 项目结构

```
src/
├── index.html                    # 主入口 (278行)
├── lib/                          # 散装依赖 ❌ 需移除
│   ├── jquery.min.js            # 未使用但引入
│   └── toastr.min.js            # 唯一实际使用的库
├── assets/css/                   # 样式文件 (7个, 3820行)
└── scripts/
    ├── api/                      # API层 (10文件: 3核心+7providers)
    ├── storage/                  # 数据层 (16文件, 7066行)
    ├── ui/                       # UI层 (30文件: 26根+4chat子模块) ⚠️ 重点重构
    ├── memory/                   # 记忆系统 (4文件)
    └── utils/                    # 工具函数 (6文件)
```

### 2.2 核心文件代码量

| 文件 | 行数 | 状态 | 迁移策略 |
|------|------|------|----------|
| `src/scripts/ui/app.js` | 8409 | ⚠️ 超大 | 拆分为30+组件 |
| `src/scripts/ui/bridge.js` | 3306 | ⚠️ 超大 | 拆分为工具模块 |
| `src/scripts/storage/chat-store.js` | 2594 | ⚠️ 超大 | 包装Svelte Store |
| `src/scripts/ui/memory-template-panel.js` | 1991 | ⚠️ 大 | 单独组件 |
| `src/scripts/ui/preset-panel.js` | 1873 | ⚠️ 大 | 单独组件 |
| `src/scripts/ui/chat/chat-ui.js` | 1744 | ⚠️ 大 | 拆分为5+组件 |
| `src/scripts/ui/chat/rich-text-renderer.js` | 1332 | ⚠️ 大 | 封装为组件 |
| `src/scripts/ui/config-panel.js` | 1224 | ⚠️ 大 | 单独组件 |
| `src/scripts/ui/contact-settings-panel.js` | 992 | 中等 | 单独组件 |
| `src/scripts/ui/moments-panel.js` | 939 | 中等 | 单独组件 |
| `src/scripts/ui/general-settings-panel.js` | 781 | 中等 | 单独组件 |
| `src/scripts/ui/persona-panel.js` | 743 | 中等 | 单独组件 |

### 2.3 依赖关系图

```
┌─────────────────────────────────────────────────────────────┐
│                        app.js (入口)                         │
│  src/scripts/ui/app.js:1-100                                │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Store 层    │   │   Panel 层    │   │   Chat UI     │
│ storage/*.js  │   │ ui/*-panel.js │   │ ui/chat/*.js  │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                     bridge.js (桥接层)                       │
│  src/scripts/ui/bridge.js:1-3307                            │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Tauri API 层                             │
│  src/scripts/utils/tauri.js:1-21                            │
│  src-tauri/src/commands.rs:1-1849                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、技术方案

### 3.1 技术栈选型

| 类别 | 现有 | 目标 | 理由 |
|------|------|------|------|
| **框架** | Vanilla JS | Svelte 5 | 轻量、高性能、原生编译 |
| **构建** | 无 | Vite 6 | 快速HMR、Tauri官方支持 |
| **包管理** | curl下载 | pnpm | 快速、节省磁盘 |
| **通知库** | Toastr | svelte-french-toast | Svelte原生 |
| **类型** | 无 | JSDoc + 可选TS | 渐进式类型安全 |
| **测试** | 无 | Vitest + Testing Library | Vite原生支持 |
| **样式** | 纯CSS | Svelte Scoped CSS | 组件化样式 |

### 3.2 目录结构设计

```
AiChat/
├── package.json                  # npm配置 (新增依赖)
├── pnpm-lock.yaml               # 锁定版本
├── vite.config.js               # Vite配置
├── svelte.config.js             # Svelte配置
├── src/                         # 前端源码 (重构)
│   ├── App.svelte               # 根组件
│   ├── main.js                  # 入口
│   ├── app.css                  # 全局样式
│   ├── lib/                     # Svelte组件库
│   │   ├── components/          # 通用组件
│   │   │   ├── Modal.svelte
│   │   │   ├── Toast.svelte
│   │   │   └── Button.svelte
│   │   ├── pages/               # 页面组件
│   │   │   ├── ChatPage.svelte
│   │   │   ├── ContactsPage.svelte
│   │   │   └── MomentsPage.svelte
│   │   ├── features/            # 功能模块
│   │   │   ├── chat/
│   │   │   ├── contacts/
│   │   │   ├── moments/
│   │   │   └── settings/
│   │   └── panels/              # 弹窗面板
│   │       ├── ConfigPanel.svelte
│   │       ├── PersonaPanel.svelte
│   │       └── ...
│   ├── stores/                  # Svelte Stores
│   │   ├── chat.js
│   │   ├── contacts.js
│   │   └── ...
│   ├── api/                     # API层 (迁移)
│   ├── utils/                   # 工具函数 (迁移)
│   └── legacy/                  # 旧代码 (暂存)
├── src-tauri/                   # Rust后端 (不变)
└── src-legacy/                  # 旧前端备份
```

---

## 四、组件设计

### 4.1 页面组件

#### 4.1.1 App.svelte (根组件)

**职责**: 页面路由、全局状态初始化、底部导航

**迁移来源**:

- `src/scripts/ui/app.js:46-100` - 初始化逻辑
- `src/index.html:266-273` - 底部导航HTML
- `src/scripts/ui/app.js:3200-3400` - 页面切换逻辑

**组件结构**:

```svelte
<script>
  // 从 app.js:46-100 迁移初始化逻辑
</script>

<main>
  {#if currentPage === 'chat'}
    <ChatPage />
  {:else if currentPage === 'contacts'}
    <ContactsPage />
  {:else if currentPage === 'moments'}
    <MomentsPage />
  {/if}
</main>

<BottomNav bind:currentPage />
```

#### 4.1.2 ChatPage.svelte

**职责**: 聊天列表页 + 聊天室容器

**迁移来源**:

- `src/index.html:21-82` - 聊天页HTML结构
- `src/scripts/ui/app.js:200-800` - 聊天室进入/退出逻辑
- `src/scripts/ui/app.js:2500-2700` - 贴图面板逻辑

**子组件拆分**:

| 组件 | 迁移来源 | 行数 |
|------|----------|------|
| `ChatRoom.svelte` | `app.js:200-800` | ~600 |
| `MessageList.svelte` | `chat-ui.js:200-600` | ~400 |
| `MessageBubble.svelte` | `chat-ui.js:600-900` | ~300 |
| `ComposerInput.svelte` | `app.js:800-1000` | ~200 |
| `StickerPanel.svelte` | `app.js:2500-2700` | ~200 |
| `ActionPanel.svelte` | `app.js:2520-2560` | ~40 |

#### 4.1.3 ContactsPage.svelte

**职责**: 联系人列表、分组管理、拖拽排序

**迁移来源**:

- `src/index.html:83-100` - 联系人页HTML
- `src/scripts/ui/contact-group-renderer.js:1-400` - 分组渲染
- `src/scripts/ui/contact-drag-manager.js:1-371` - 拖拽逻辑

**子组件拆分**:

| 组件 | 迁移来源 |
|------|----------|
| `ContactList.svelte` | `contact-group-renderer.js:100-300` |
| `ContactItem.svelte` | `contact-group-renderer.js:300-400` |
| `GroupHeader.svelte` | `contact-group-renderer.js:50-100` |

#### 4.1.4 MomentsPage.svelte

**职责**: 动态/朋友圈展示、评论互动

**迁移来源**:

- `src/index.html:130-145` - 动态页HTML
- `src/scripts/ui/moments-panel.js:1-900` - 动态面板逻辑

**子组件拆分**:

| 组件 | 迁移来源 |
|------|----------|
| `MomentCard.svelte` | `moments-panel.js:400-500` |
| `CommentList.svelte` | `moments-panel.js:500-600` |
| `MomentComposer.svelte` | `moments-panel.js:600-700` |

### 4.2 Panel组件 (弹窗/面板)

| 组件 | 迁移来源 | 优先级 |
|------|----------|--------|
| `ConfigPanel.svelte` | `src/scripts/ui/config-panel.js:1-1224` | P0 |
| `PersonaPanel.svelte` | `src/scripts/ui/persona-panel.js:1-743` | P0 |
| `SessionPanel.svelte` | `src/scripts/ui/session-panel.js:1-303` | P0 |
| `ContactSettingsPanel.svelte` | `src/scripts/ui/contact-settings-panel.js:1-992` | P1 |
| `GeneralSettingsPanel.svelte` | `src/scripts/ui/general-settings-panel.js:1-781` | P1 |
| `PresetPanel.svelte` | `src/scripts/ui/preset-panel.js:1-1873` | P1 |
| `RegexPanel.svelte` | `src/scripts/ui/regex-panel.js:1-720` | P2 |
| `RegexSessionPanel.svelte` | `src/scripts/ui/regex-session-panel.js:1-*` | P2 |
| `WorldPanel.svelte` | `src/scripts/ui/world-panel.js:1-551` | P2 |
| `WorldEditorPanel.svelte` | `src/scripts/ui/world-editor.js:1-566` | P2 |
| `MemoryTemplatePanel.svelte` | `src/scripts/ui/memory-template-panel.js:1-1991` | P2 |
| `MemoryTableEditor.svelte` | `src/scripts/ui/memory-table-editor.js:1-*` | P2 |
| `GroupPanel.svelte` | `src/scripts/ui/group-panel.js:1-*` | P2 |
| `GroupChatPanels.svelte` | `src/scripts/ui/group-chat-panels.js:1-*` | P2 |
| `MomentSummaryPanel.svelte` | `src/scripts/ui/moment-summary-panel.js:1-*` | P2 |
| `DebugPanel.svelte` | `src/scripts/ui/debug-panel.js:1-661` | P3 |
| `VariablePanel.svelte` | `src/scripts/ui/variable-panel.js:1-216` | P3 |

### 4.3 通用组件

| 组件 | 功能 | 迁移来源 |
|------|------|----------|
| `Modal.svelte` | 通用弹窗容器 | 各Panel的弹窗逻辑 |
| `Toast.svelte` | 通知提示 | 替换Toastr |
| `Button.svelte` | 统一按钮样式 | 各处button元素 |
| `Avatar.svelte` | 头像组件 | `chat-ui.js` 头像渲染 |
| `MediaPicker.svelte` | 媒体选择器 | `src/scripts/ui/media-picker.js` |
| `StickerPicker.svelte` | 表情选择器 | `src/scripts/ui/sticker-picker.js` |

### 4.4 Svelte Actions (可复用交互)

| Action | 功能 | 迁移来源 |
|--------|------|----------|
| `use:longpress` | 长按检测 | `moments-panel.js:220-280` |
| `use:drag` | 拖拽功能 | `contact-drag-manager.js:50-200` |
| `use:clickOutside` | 点击外部关闭 | 各Panel的关闭逻辑 |
| `use:autosize` | 输入框自动高度 | `chat-ui.js` 输入框逻辑 |

---

## 五、Store设计

### 5.1 Store迁移策略

**原则**: 保留现有Store类作为数据逻辑层，使用Svelte Store包装响应式状态

**示例**: ChatStore迁移

**现有代码**: `src/scripts/storage/chat-store.js:1-2594`

```javascript
// stores/chat.js - Svelte Store包装
import { writable, derived } from 'svelte/store';

// 保留原有类
import { ChatStore as LegacyChatStore } from '../legacy/storage/chat-store.js';

// 创建单例
const legacyStore = new LegacyChatStore();

// Svelte响应式包装
function createChatStore() {
    const { subscribe, set, update } = writable({
        sessions: {},
        current: null,
        messages: []
    });

    return {
        subscribe,
        // 代理到旧Store方法
        async init() {
            await legacyStore.ready;
            set(legacyStore.state);
        },
        setCurrent: (id) => legacyStore.setCurrent(id),
        // ... 其他方法
    };
}

export const chatStore = createChatStore();
```

### 5.2 Store清单

| Store | 迁移来源 | 类型 |
|-------|----------|------|
| `chatStore` | `src/scripts/storage/chat-store.js` | writable |
| `contactsStore` | `src/scripts/storage/contacts-store.js` | writable |
| `groupStore` | `src/scripts/storage/group-store.js` | writable |
| `momentsStore` | `src/scripts/storage/moments-store.js` | writable |
| `personaStore` | `src/scripts/storage/persona-store.js` | writable |
| `configStore` | `src/scripts/storage/config.js` | writable |
| `appSettings` | `src/scripts/storage/app-settings.js` | writable |
| `presetStore` | `src/scripts/storage/preset-store.js` | writable |

---

## 六、样式迁移

### 6.1 CSS文件清单

| 文件 | 行数 | 迁移策略 |
|------|------|----------|
| `src/assets/css/qq-legacy.css` | 1721 | → 拆分到组件Scoped CSS |
| `src/assets/css/main.css` | 1137 | → `app.css` 全局样式 |
| `src/assets/css/chat.css` | 394 | → `ChatRoom.svelte` |
| `src/assets/css/contact-groups.css` | 230 | → `ContactList.svelte` |
| `src/assets/css/cards.css` | 46 | → `MomentCard.svelte` |
| `src/assets/css/legacy-card.css` | 14 | → 按需拆分 |
| `src/assets/css/toastr.min.css` | 0 | 删除 (使用svelte-french-toast) |

### 6.2 CSS变量系统

**来源**: `src/assets/css/qq-legacy.css:1-50` (提取主题色)

```css
/* src/app.css - 全局CSS变量 */
:root {
    --color-primary: #0f172a;
    --color-secondary: #64748b;
    --color-background: #f8fafc;
    --color-bubble-user: #E8F0FE;
    --color-bubble-assistant: #c9c9c9;
    --color-text: #1F2937;
    --color-border: #e2e8f0;
    --color-danger: #b91c1c;
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
}
```

---

## 七、API层迁移

### 7.1 保留现有结构

API层代码质量较好，可直接迁移:

| 文件 | 迁移方式 |
|------|----------|
| `src/scripts/api/client.js` | 直接复制到 `src/api/` |
| `src/scripts/api/stream.js` | 直接复制 |
| `src/scripts/api/abort.js` | 直接复制 |
| `src/scripts/api/providers/*.js` | 直接复制 |

### 7.2 Tauri API封装

**来源**: `src/scripts/utils/tauri.js:1-21`

保持不变，仅调整import路径。

---

## 八、复杂功能迁移

### 8.1 流式响应 (SSE)

**来源**:

- `src/scripts/api/stream.js:1-*` - SSE解析
- `src/scripts/ui/chat/dialogue-stream-parser.js:1-676` - 多角色解析
- `src/scripts/ui/app.js:1500-2000` - 流式渲染逻辑

**迁移方案**:

```svelte
<!-- MessageStream.svelte -->
<script>
    import { streamStore } from '../stores/stream.js';
    // 从 dialogue-stream-parser.js 导入解析逻辑
    import { DialogueStreamParser } from '../legacy/chat/dialogue-stream-parser.js';
</script>

{#if $streamStore.isStreaming}
    <div class="typing-indicator">
        {$streamStore.partialContent}
    </div>
{/if}
```

### 8.2 拖拽排序

**来源**: `src/scripts/ui/contact-drag-manager.js:1-371`

**迁移方案**: 封装为Svelte Action

```javascript
// src/lib/actions/drag.js
export function drag(node, options) {
    // 从 contact-drag-manager.js:50-200 迁移核心逻辑
    // 使用 Pointer Events API
}
```

### 8.3 长按菜单

**来源**:

- `src/scripts/ui/chat/chat-ui.js:1400-1500` - 消息长按
- `src/scripts/ui/moments-panel.js:220-280` - 评论长按

**迁移方案**: 封装为Svelte Action

```javascript
// src/lib/actions/longpress.js
export function longpress(node, callback) {
    // 从 moments-panel.js:220-280 迁移
    let timer;
    const handleStart = (e) => {
        timer = setTimeout(() => callback(e), 520);
    };
    // ...
}
```

### 8.4 富文本渲染 (iframe)

**来源**:

- `src/scripts/ui/chat/rich-text-renderer.js:1-200`
- `src/iframe-host.html`
- `src/iframe-host.js`

**迁移方案**: 封装为独立组件

```svelte
<!-- RichTextIframe.svelte -->
<script>
    import { onMount } from 'svelte';
    export let content = '';
    // 从 rich-text-renderer.js 迁移postMessage逻辑
</script>

<iframe 
    src="./iframe-host.html"
    sandbox="allow-scripts"
    bind:this={iframeEl}
/>
```

---

## 九、迁移计划

### 9.1 阶段划分

```
Phase 0: 环境搭建 (1天)
├── 初始化Vite + Svelte项目
├── 配置Tauri集成
├── 安装必要依赖
└── 验证开发环境

Phase 1: 核心框架 (3天)
├── App.svelte + 路由
├── BottomNav组件
├── 三大页面骨架
└── Store包装层

Phase 2: ChatPage迁移 (5天)
├── ChatRoom组件
├── MessageList + MessageBubble
├── ComposerInput
├── StickerPanel
└── 流式响应集成

Phase 3: ContactsPage迁移 (3天)
├── ContactList组件
├── 拖拽功能迁移
├── 分组管理
└── 联系人设置Panel

Phase 4: MomentsPage迁移 (2天)
├── MomentCard组件
├── 评论功能
├── 长按菜单
└── 动态摘要Panel

Phase 5: Panel组件迁移 (5天)
├── ConfigPanel (P0)
├── PersonaPanel (P0)
├── SessionPanel (P0)
├── 其他Panel (P1-P3)
└── Modal统一管理

Phase 6: 测试与优化 (3天)
├── 单元测试
├── E2E测试
├── 性能优化
└── Android适配测试

Total: ~22天 (约1个月)
```

### 9.2 里程碑

| 里程碑 | 交付物 | 验收标准 |
|--------|--------|----------|
| M1 | 环境搭建完成 | `pnpm dev` 能启动Vite+Tauri |
| M2 | 核心框架完成 | 三大页面可切换，数据加载正常 |
| M3 | ChatPage可用 | 聊天功能完整，流式响应正常 |
| M4 | 所有页面可用 | 功能与旧版一致 |
| M5 | 生产就绪 | 测试通过，性能达标 |

---

## 十、风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| app.js拆分复杂度高 | 高 | 高 | 逐步迁移，保持可运行状态 |
| Store状态同步问题 | 中 | 高 | 保留旧Store类，仅包装响应式 |
| Android兼容性问题 | 中 | 中 | 每阶段进行移动端测试 |
| 样式回归 | 中 | 低 | 保留旧CSS作为fallback |
| Tauri API变更 | 低 | 中 | 使用已验证的tauri.js封装层 |

---

## 十一、成功指标

| 指标 | 当前 | 目标 |
|------|------|------|
| 最大文件行数 | 8410 | <500 |
| 依赖管理 | curl手动 | pnpm lock |
| 构建工具 | 无 | Vite |
| HMR支持 | 无 | 有 |
| 类型检查 | 无 | JSDoc/TS |
| 测试覆盖 | 0% | >60% |
| 首屏加载 | ~2s | <1s |
| 包体积(gzip) | ~150KB | <100KB |

---

## 十二、附录

### A. 关键代码引用索引 (已验证)

```
# 入口文件
src/index.html:1-278                    # 主HTML (278行)
src/scripts/ui/app.js:1-8409            # 主JS入口 (8409行, 需拆分)

# Store层 (16文件, 7066行)
src/scripts/storage/chat-store.js:1-2594       # 聊天存储 (最大)
src/scripts/storage/preset-store.js:1-711      # 预设存储
src/scripts/storage/config.js:1-656            # 配置管理
src/scripts/storage/regex-store.js:1-509       # 正则存储
src/scripts/storage/moments-store.js:1-410     # 动态存储
src/scripts/storage/contacts-store.js:1-331    # 联系人存储
src/scripts/storage/group-store.js:1-331       # 分组存储
src/scripts/storage/memory-template-store.js:1-319
src/scripts/storage/builtin-worldbooks.js:1-305
src/scripts/storage/moment-summary-store.js:1-275
src/scripts/storage/persona-store.js:1-225
src/scripts/storage/worldinfo.js:1-164
src/scripts/storage/memory-table-store.js:1-79
src/scripts/storage/chat.js:1-79
src/scripts/storage/app-settings.js:1-66
src/scripts/storage/store-scope.js:1-12

# UI层 - 主文件 (30文件)
src/scripts/ui/bridge.js:1-3306                # 桥接层 (需拆分)
src/scripts/ui/memory-template-panel.js:1-1991
src/scripts/ui/preset-panel.js:1-1873
src/scripts/ui/config-panel.js:1-1224
src/scripts/ui/contact-settings-panel.js:1-992
src/scripts/ui/moments-panel.js:1-939
src/scripts/ui/general-settings-panel.js:1-781
src/scripts/ui/persona-panel.js:1-743
src/scripts/ui/regex-panel.js:1-720
src/scripts/ui/debug-panel.js:1-661
src/scripts/ui/world-editor.js:1-566
src/scripts/ui/world-panel.js:1-551
src/scripts/ui/contact-drag-manager.js:1-370   # 拖拽
src/scripts/ui/session-panel.js:1-303
src/scripts/ui/variable-panel.js:1-216
src/scripts/ui/contact-group-renderer.js:1-*
src/scripts/ui/group-chat-panels.js:1-*
src/scripts/ui/group-panel.js:1-*
src/scripts/ui/media-picker.js:1-*
src/scripts/ui/memory-table-editor.js:1-*
src/scripts/ui/moment-summary-panel.js:1-*
src/scripts/ui/regex-session-panel.js:1-*
src/scripts/ui/sticker-picker.js:1-*
src/scripts/ui/worldinfo-indicator.js:1-*
src/scripts/ui/command-runner.js:1-*

# UI层 - chat子模块 (4文件)
src/scripts/ui/chat/chat-ui.js:1-1744          # 聊天UI核心
src/scripts/ui/chat/rich-text-renderer.js:1-1332  # iframe渲染
src/scripts/ui/chat/dialogue-stream-parser.js:1-676  # 流解析
src/scripts/ui/chat/message-parser.js:1-114

# 工具类 (6文件)
src/scripts/utils/macro-engine.js:1-391
src/scripts/utils/logger.js:1-118
src/scripts/utils/tauri.js:1-21                # Tauri封装
src/scripts/utils/image.js:1-*
src/scripts/utils/media-assets.js:1-*
src/scripts/utils/retry.js:1-*

# Memory模块 (4文件)
src/scripts/memory/default-template.js:1-*
src/scripts/memory/memory-edit-parser.js:1-*
src/scripts/memory/memory-prompt-utils.js:1-*
src/scripts/memory/template-schema.js:1-*

# API层 (10文件, 可直接迁移)
src/scripts/api/client.js:1-*
src/scripts/api/stream.js:1-*
src/scripts/api/abort.js:1-*
src/scripts/api/providers/openai.js
src/scripts/api/providers/anthropic.js
src/scripts/api/providers/gemini.js
src/scripts/api/providers/deepseek.js
src/scripts/api/providers/makersuite.js
src/scripts/api/providers/vertexai.js
src/scripts/api/providers/custom.js

# 样式 (7文件, 3820行)
src/assets/css/qq-legacy.css:1-1721            # QQ主题样式
src/assets/css/main.css:1-1137                 # 主样式
src/assets/css/chat.css:1-394                  # 聊天样式
src/assets/css/contact-groups.css:1-230        # 分组样式
src/assets/css/cards.css:1-46                  # 卡片样式
src/assets/css/legacy-card.css:1-14
src/assets/css/toastr.min.css                  # 空文件 (删除)

# Tauri后端 (不变)
src-tauri/tauri.conf.json:1-*                  # 需更新frontendDist
src-tauri/src/commands.rs:1-1849               # Rust命令
```

### B. 依赖清单 (package.json)

```json
{
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/cli": "^2.0.0",
    "svelte": "^5.0.0",
    "vite": "^6.0.0",
    "vitest": "^2.0.0",
    "@testing-library/svelte": "^5.0.0"
  },
  "dependencies": {
    "@tauri-apps/plugin-dialog": "^2.0.0",
    "svelte-french-toast": "^1.2.0"
  }
}
```

---

**文档结束**

> 下一步: 执行 Phase 0 - 环境搭建
