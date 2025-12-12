# 世界書/角色設定遷移筆記

## 來源結構（SillyTavern 範例）
- 路徑示例：`D:/SillyTavern/SillyTavern/data/default-user/worlds/*.json`
- JSON 主要字段：
  - `entries`: 字典，value 為 world info 條目
    - `content`: 具體提示文本
    - `comment`: 條目描述
    - `key` / `keysecondary`: 關鍵詞列表
    - `selective` + `selectiveLogic`: 選擇邏輯
    - `probability` / `useProbability`: 觸發概率
    - `depth`, `group`, `order`, `position`: 插入與優先級控制
    - `extensions`: 重複存放與 UI/邏輯相關的附加字段
  - `originalData`: 原始版本快照

示例（節選）：
```json
{
  "content": "……",
  "comment": "状态栏",
  "key": [],
  "selective": true,
  "probability": 100,
  "order": 100,
  "depth": 4,
  "group": "",
  "extensions": { "probability": 100, "depth": 4, ... }
}
```

## 目標簡化格式（建議）
```json
{
  "name": "world-name",
  "entries": [
    {
      "id": "uuid",
      "title": "描述/註釋",
      "content": "提示內容",
      "triggers": ["keyword1", "keyword2"],
      "priority": 100,
      "depth": 4,
      "selective": true,
      "probability": 1.0
    }
  ]
}
```
- 去除 ST 專用 UI 字段（position/groupWeight 等），保留核心：內容、觸發、優先級、概率。
- `probability` 用 0~1 浮點；`priority` 數值越大越靠前。

## 遷移策略（前端為主，不動 ST 源）
1. **讀取** ST world JSON，解析 `entries` 字典並映射到簡化格式。
2. **存儲**：先用 localStorage（或 Tauri FS JSON）存放 `worlds/<name>.json`，並建索引。
3. **應用**：生成 prompt 時，按 trigger/priority 過濾與排序，拼接到 system prompt 或對話前置。
4. **導入/導出**：提供「從 ST JSON 導入」與「導出簡化 JSON」功能，不修改 ST 原文件。
5. **未來 UI**：世界書列表、搜索、啟用/禁用開關；條目編輯器。

## 待辦
- 實作 worldinfo 解析/存儲模組（localStorage + 可選 Tauri FS）。
- 在 `appBridge` 增加 world info 加載接口（替換 invoke 佔位）。
- 配置面板或獨立頁面加入導入/導出入口。
