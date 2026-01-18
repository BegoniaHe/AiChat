/**
 * Prompt Preset Store (Svelte 5 version)
 * - SillyTavern-like preset system
 * - Supports sysprompt, context, instruct, openai, reasoning types
 * - Persists to Tauri KV storage with localStorage fallback
 */

import { safeInvoke } from '$utils/tauri';

const STORE_KEY = 'prompt_preset_store_v1';

// Generate unique ID
const genId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

// Deep clone helper
const clone = (v) => {
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
};

// Ensure object helper
const ensureObj = (v, fallback) => (v && typeof v === 'object' ? v : fallback);

// Validate preset type
const normalizeType = (type) => {
  const t = String(type || '').toLowerCase();
  if (['sysprompt', 'context', 'instruct', 'openai', 'reasoning'].includes(t)) return t;
  throw new Error(`Unknown preset type: ${type}`);
};

// Default dialogue rules for private chat
const DEFAULT_DIALOGUE_RULES_PRIVATE_CHAT = `
# 行为风格与节奏指南 (Style & Pacing Guide)
- **角色扮演核心**:
  - **性格优先**: 严格遵循 {{char}} 的性格设定，这是最高原则。
  - **情境感知**: 根据对话氛围（闲聊、深入探讨、紧急、调情等）调整回复风格。
- **聊天风格与节奏（核心格式规则）**:
  - **连续短消息**: 当回复较长或包含多个要点时，必须拆分为多条短消息（多行），模拟真实聊天节奏。
  - **禁止复述**: 严格禁止重复、补充或复述 {{user}} 输入内容；不要对 {{user}} 内容进行解释/改写。
  - **禁止冒充**: 严格禁止冒充 {{user}}，绝不模拟或代替 {{user}} 发言。
  - **保持互动**: 回复必须包含提问或引导，不能中断对话。
`.trim();

// Default group chat rules
const DEFAULT_GROUP_RULES = `
【群聊场景提示词】
当前处于群聊：{{group}}
群成员：{{members}}

（注：QQ聊天/群聊格式、特殊消息类型等"手机格式提示词"已由世界书「手机-格式2-QQ聊天」提供；本区块仅保留场景信息，避免重复。）
`.trim();

// Default moment rules
const DEFAULT_MOMENT_RULES = `
【动态（QQ空间）场景提示词】
（注：QQ空间格式、评论系统说明、moment_start/moment_end 等"手机格式提示词"已由世界书「手机-格式3-QQ空间」提供；本区块默认不重复这些格式说明。）
`.trim();

// Default moment creation rules
const DEFAULT_MOMENT_CREATION_RULES = `
## 任务：动态发布决策
在回应聊天之后，请评估当前对话情景，并决定是否要发布一条新的动态。

**【决策流程】**
1. **评估时机**：回顾刚刚的对话内容，判断是否属于以下【发布动态的参考时机】。
2. **概率冲动**：你可以在心中投一个10面骰(D10)。如果结果**大于等于7**，或者发生了**非常值得纪念/分享**的事情，你就应该发布一条新动态。
3. **角色性格**：最终决定必须严格符合角色性格。一个热爱分享、外向的角色会更倾向于发布动态。

**【发布动态的参考时机】**
- **里程碑事件**：完成了重要的任务、取得了成就、关系获得了突破（如成为恋人）。
- **美好瞬间**：看到了美丽的风景（夕阳、雪景）、品尝了美味的食物、收到了心仪的礼物。
- **强烈情绪**：感到非常开心、激动、自豪，或是有些许的失落、感慨，希望获得关注或安慰。
- **有趣日常**：遇到了搞笑的事情、想分享一个冷笑话、想展示自己新买的东西。
- **寻求互动**：想要发起一个话题（如"大家最喜欢的电影是什么？"）或者询问大家的意见。
`.trim();

// Default moment comment rules
const DEFAULT_MOMENT_COMMENT_RULES = `
你正在处理 QQ空间「动态评论回复」任务。

【输入中会提供】
- moment_id、发布者、动态内容
- 用户评论（会包含 user_comment_id）
- 可用联系人名单

【输出硬性要求】
1) 只输出一个 <content>...</content> 区块，除此之外不要输出任何文字。
2) <content> 内必须输出一段 moment_reply_start/moment_reply_end：
   moment_reply_start
   moment_id::动态ID
   评论人--评论内容
   评论人--评论内容--reply_to::comment_id--reply_to_author::名字
   moment_reply_end
3) 至少输出 1 条评论；若情境合适可多条。
4) 评论内容若需要换行，使用 <br>。

【注意】
- 评论人必须是具体名字（优先从联系人名单中挑选）；不要使用"匿名网友"等敷衍名字。
- 本场景不要输出私聊/群聊标签块（只输出评论回复）。
`.trim();

// Default summary rules
const DEFAULT_SUMMARY_RULES = `
每次输出结束后，**紧跟着**以一句话概括本次互动的摘要，确保<details><summary>摘要</summary>
<内容>
</details>标签顺序正确，摘要**纯中文输出**，不得夹杂其它语言
[summary_format]
摘要格式示例：

<details><summary>摘要</summary>

用一句话概括本条回复的内容，禁止不必要的总结和升华
`.trim();

/**
 * Normalize OpenAI preset format (handle SillyTavern exports)
 */
function normalizeOpenAIPreset(preset) {
  if (!preset || typeof preset !== 'object') return;

  const ST_PROMPT_ORDER_DUMMY_ID = 100001;

  const coerceRole = (role) => {
    if (role === 0) return 'system';
    if (role === 1) return 'user';
    if (role === 2) return 'assistant';
    const r = String(role || '')
      .toLowerCase()
      .trim();
    if (['system', 'user', 'assistant'].includes(r)) return r;
    return 'system';
  };

  const coerceIdentifier = (p, fallback) => {
    const candidates = [p?.identifier, p?.id, p?.prompt_id, p?.promptId, p?.name, p?.title];
    for (const c of candidates) {
      const s = String(c || '').trim();
      if (s) return s;
    }
    return fallback;
  };

  const coerceContent = (p) => {
    const candidates = [p?.content, p?.prompt, p?.text, p?.value, p?.message];
    for (const c of candidates) {
      const s = String(c ?? '');
      if (s.trim()) return s;
    }
    return String(p?.content ?? '');
  };

  // Normalize prompts array
  let promptsRaw = preset.prompts;
  if (!Array.isArray(promptsRaw) && promptsRaw && typeof promptsRaw === 'object') {
    promptsRaw = Object.entries(promptsRaw).map(([key, value]) => {
      if (value && typeof value === 'object') {
        if (!('identifier' in value) || !String(value.identifier || '').trim()) {
          return { ...value, identifier: String(key || '').trim() || value.identifier };
        }
        return value;
      }
      return { identifier: String(key || '').trim(), content: String(value ?? '') };
    });
  }
  const promptsIn = Array.isArray(promptsRaw) ? promptsRaw : [];

  const normalizedPrompts = [];
  const keyToIdentifier = new Map();

  for (let i = 0; i < promptsIn.length; i++) {
    const p = promptsIn[i];
    if (!p || typeof p !== 'object') continue;

    const identifier = coerceIdentifier(p, `custom_${i}`);
    const name = String(p?.name || p?.title || identifier).trim() || identifier;
    const role = coerceRole(p?.role);
    const system_prompt = typeof p?.system_prompt === 'boolean' ? p.system_prompt : true;
    const marker = Boolean(p?.marker);
    const content = coerceContent(p);

    normalizedPrompts.push({ ...p, identifier, name, role, system_prompt, marker, content });

    // Build mapping for prompt_order resolution
    const keys = [identifier, p?.id, p?.prompt_id, p?.name, p?.title]
      .map((k) => String(k || '').trim())
      .filter(Boolean);
    for (const k of keys) {
      if (!keyToIdentifier.has(k)) keyToIdentifier.set(k, identifier);
    }
  }
  preset.prompts = normalizedPrompts;

  // Normalize prompt_order
  let blocks = preset.prompt_order;
  if (!Array.isArray(blocks) && blocks && typeof blocks === 'object') {
    if ('order' in blocks || 'character_id' in blocks) {
      blocks = [blocks];
    } else {
      blocks = Object.values(blocks);
    }
  }
  blocks = Array.isArray(blocks) ? blocks : [];

  const importBlock = blocks.find(
    (b) => b && typeof b === 'object' && String(b.character_id) === String(ST_PROMPT_ORDER_DUMMY_ID)
  );

  if (!importBlock) return;

  const ingestOrder = (orderArr) => {
    const out = [];
    const seen = new Set();
    const arr = Array.isArray(orderArr) ? orderArr : [];

    for (const it of arr) {
      const rawKey = (() => {
        if (typeof it === 'string') return it;
        if (typeof it === 'number' && Number.isFinite(it)) {
          const fromPrompt = promptsIn[Math.trunc(it)];
          return fromPrompt?.identifier ?? fromPrompt?.id ?? fromPrompt?.name ?? '';
        }
        if (it && typeof it === 'object') {
          return it.identifier ?? it.id ?? it.prompt_id ?? it.promptId ?? it.name ?? it.title ?? '';
        }
        return '';
      })();

      const key = String(rawKey || '').trim();
      if (!key) continue;

      const identifier = keyToIdentifier.get(key) || key;
      if (seen.has(identifier)) continue;
      seen.add(identifier);

      const enabled = it && typeof it === 'object' && 'enabled' in it ? it.enabled !== false : true;
      out.push({ identifier, enabled });
    }
    return out;
  };

  const order = ingestOrder(importBlock.order);
  if (order.length) {
    preset.prompt_order = [{ character_id: ST_PROMPT_ORDER_DUMMY_ID, order }];
  }
}

/**
 * Create default state from bundled defaults
 */
function makeDefaultState(defaultsByType) {
  const findIdByName = (type, name) => {
    const entries = Object.entries(defaultsByType?.[type] || {});
    const hit = entries.find(([_, p]) => (p?.name || '') === name) || entries[0];
    return hit ? hit[0] : null;
  };

  return {
    version: 1,
    presets: {
      sysprompt: defaultsByType?.sysprompt || {},
      context: defaultsByType?.context || {},
      instruct: defaultsByType?.instruct || {},
      openai: defaultsByType?.openai || {},
      reasoning: defaultsByType?.reasoning || {},
    },
    active: {
      sysprompt:
        findIdByName('sysprompt', 'Neutral - Chat') ||
        findIdByName('sysprompt', 'Roleplay - Immersive'),
      context: findIdByName('context', 'Default') || findIdByName('context', 'ChatML'),
      instruct: findIdByName('instruct', 'ChatML') || findIdByName('instruct', 'Llama 3 Instruct'),
      openai: findIdByName('openai', 'Default'),
      reasoning: findIdByName('reasoning', 'DeepSeek') || findIdByName('reasoning', 'Blank'),
    },
    enabled: {
      sysprompt: true,
      context: true,
      instruct: false,
      openai: true,
      reasoning: true,
    },
  };
}

/**
 * Apply dialogue mode defaults to sysprompt presets
 */
function applyDialogueDefaults(preset) {
  if (!preset || typeof preset !== 'object') return;

  // Private chat dialogue
  if (typeof preset.dialogue_enabled !== 'boolean') preset.dialogue_enabled = true;
  if (typeof preset.dialogue_position !== 'number') preset.dialogue_position = 3;
  if (typeof preset.dialogue_depth !== 'number') preset.dialogue_depth = 1;
  if (typeof preset.dialogue_role !== 'number') preset.dialogue_role = 0;
  if (typeof preset.dialogue_rules !== 'string' || !preset.dialogue_rules.trim()) {
    preset.dialogue_rules = DEFAULT_DIALOGUE_RULES_PRIVATE_CHAT;
  }

  // Moment rules
  if (typeof preset.moment_enabled !== 'boolean') preset.moment_enabled = false;
  if (typeof preset.moment_position !== 'number') preset.moment_position = 0;
  if (typeof preset.moment_depth !== 'number') preset.moment_depth = 0;
  if (typeof preset.moment_role !== 'number') preset.moment_role = 0;
  if (typeof preset.moment_rules !== 'string' || !preset.moment_rules.trim()) {
    preset.moment_rules = DEFAULT_MOMENT_RULES;
  }

  // Moment creation
  if (typeof preset.moment_create_enabled !== 'boolean') preset.moment_create_enabled = true;
  if (typeof preset.moment_create_position !== 'number') preset.moment_create_position = 0;
  if (typeof preset.moment_create_depth !== 'number') preset.moment_create_depth = 1;
  if (typeof preset.moment_create_role !== 'number') preset.moment_create_role = 0;
  if (typeof preset.moment_create_rules !== 'string' || !preset.moment_create_rules.trim()) {
    preset.moment_create_rules = DEFAULT_MOMENT_CREATION_RULES;
  }

  // Moment comment
  if (typeof preset.moment_comment_enabled !== 'boolean') preset.moment_comment_enabled = true;
  if (typeof preset.moment_comment_position !== 'number') preset.moment_comment_position = 0;
  if (typeof preset.moment_comment_depth !== 'number') preset.moment_comment_depth = 0;
  if (typeof preset.moment_comment_role !== 'number') preset.moment_comment_role = 0;
  if (typeof preset.moment_comment_rules !== 'string' || !preset.moment_comment_rules.trim()) {
    preset.moment_comment_rules = DEFAULT_MOMENT_COMMENT_RULES;
  }

  // Group chat
  if (typeof preset.group_enabled !== 'boolean') preset.group_enabled = true;
  if (typeof preset.group_position !== 'number') preset.group_position = 3;
  if (typeof preset.group_depth !== 'number') preset.group_depth = 1;
  if (typeof preset.group_role !== 'number') preset.group_role = 0;
  if (typeof preset.group_rules !== 'string' || !preset.group_rules.trim()) {
    preset.group_rules = DEFAULT_GROUP_RULES;
  }

  // Summary
  if (typeof preset.summary_enabled !== 'boolean') preset.summary_enabled = true;
  if (typeof preset.summary_position !== 'number') preset.summary_position = 3;
  if (typeof preset.summary_rules !== 'string' || !preset.summary_rules.trim()) {
    preset.summary_rules = DEFAULT_SUMMARY_RULES;
  }
}

/**
 * PresetStore - Svelte 5 reactive store for prompt presets
 */
export class PresetStore {
  // Reactive state
  #state = $state(null);
  #isLoaded = $state(false);
  #loading = $state(false);

  // Initialization promise
  ready;

  constructor() {
    this.ready = this.load();
  }

  // Getters for reactive state
  get state() {
    return this.#state;
  }
  get isLoaded() {
    return this.#isLoaded;
  }
  get loading() {
    return this.#loading;
  }

  /**
   * Load bundled ST default presets
   */
  async loadBundledDefaults() {
    try {
      const resp = await fetch('./assets/presets/st-defaults.json', { cache: 'no-cache' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const types = ensureObj(json?.types, {});

      const out = {};
      for (const type of ['sysprompt', 'context', 'instruct', 'openai', 'reasoning']) {
        out[type] = {};
        const typeData = ensureObj(types[type], {});
        for (const [name, data] of Object.entries(typeData)) {
          out[type][name] = { ...data, name: data?.name || name };
        }
      }
      return out;
    } catch (err) {
      console.warn('Failed to load bundled ST presets:', err);
      return { sysprompt: {}, context: {}, instruct: {}, openai: {}, reasoning: {} };
    }
  }

  /**
   * Load presets from storage
   */
  async load() {
    if (this.#isLoaded && this.#state) return this.#state;

    this.#loading = true;
    let state = null;

    // Try Tauri KV first
    try {
      const kv = await safeInvoke('load_kv', { name: STORE_KEY });
      if (kv && typeof kv === 'object' && Object.keys(kv).length) {
        state = kv;
      }
    } catch (err) {
      console.debug('load_kv preset store failed (not Tauri?):', err);
    }

    // Fallback to localStorage
    if (!state) {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) state = JSON.parse(raw);
      } catch {}
    }

    // Load bundled defaults
    const defaults = await this.loadBundledDefaults();

    if (!state || typeof state !== 'object' || !state.presets) {
      // Create new state from defaults
      state = makeDefaultState(defaults);

      // Apply dialogue defaults to sysprompt presets
      for (const p of Object.values(state.presets.sysprompt || {})) {
        applyDialogueDefaults(p);
      }

      // Normalize OpenAI presets
      for (const p of Object.values(state.presets.openai || {})) {
        try {
          normalizeOpenAIPreset(p);
        } catch {}
      }

      await this.persist(state);
    } else {
      // Merge with defaults
      state.version = 1;
      state.enabled = ensureObj(state.enabled, {});
      state.active = ensureObj(state.active, {});
      state.presets = ensureObj(state.presets, {});

      for (const type of ['sysprompt', 'context', 'instruct', 'openai', 'reasoning']) {
        state.presets[type] = ensureObj(state.presets[type], {});

        // Add missing defaults
        for (const [id, data] of Object.entries(defaults[type] || {})) {
          if (!state.presets[type][id]) {
            state.presets[type][id] = data;
          }
        }

        // Ensure active preset exists
        if (!state.active[type] || !state.presets[type][state.active[type]]) {
          state.active[type] = Object.keys(state.presets[type])[0] || null;
        }

        // Ensure enabled flag
        if (typeof state.enabled[type] !== 'boolean') {
          state.enabled[type] = ['sysprompt', 'context', 'openai', 'reasoning'].includes(type);
        }
      }

      // Apply dialogue defaults to sysprompt presets
      for (const p of Object.values(state.presets.sysprompt || {})) {
        applyDialogueDefaults(p);
      }

      // Normalize OpenAI presets
      for (const p of Object.values(state.presets.openai || {})) {
        try {
          normalizeOpenAIPreset(p);
        } catch {}
      }

      await this.persist(state);
    }

    this.#state = state;
    this.#isLoaded = true;
    this.#loading = false;

    return this.#state;
  }

  /**
   * Persist state to storage
   */
  async persist(next = this.#state) {
    this.#state = next;

    try {
      await safeInvoke('save_kv', { name: STORE_KEY, data: this.#state });
    } catch (err) {
      console.warn('save_kv preset store failed, falling back to localStorage:', err);
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(this.#state));
      } catch {}
    }
  }

  /**
   * Get current state (deep clone)
   */
  getState() {
    return this.#state ? clone(this.#state) : null;
  }

  /**
   * Import state from external source
   */
  async importState(imported, { mode = 'merge' } = {}) {
    await this.ready;

    if (!imported || typeof imported !== 'object') {
      throw new Error('Invalid preset data');
    }
    if (!imported.presets || !imported.active || !imported.enabled) {
      throw new Error('Not a preset data format');
    }

    if (mode === 'replace') {
      this.#state = clone(imported);
      this.#isLoaded = false;
      await this.persist(this.#state);
      await this.load();
      return this.getState();
    }

    // Merge mode
    const next = clone(this.#state || {});

    for (const t of ['sysprompt', 'context', 'instruct', 'openai', 'reasoning']) {
      next.presets ||= {};
      next.presets[t] ||= {};

      const incoming = imported.presets?.[t];
      if (incoming && typeof incoming === 'object') {
        for (const [id, data] of Object.entries(incoming)) {
          next.presets[t][id] = data;
        }
      }

      if (imported.active?.[t]) {
        next.active ||= {};
        next.active[t] = imported.active[t];
      }

      if (typeof imported.enabled?.[t] === 'boolean') {
        next.enabled ||= {};
        next.enabled[t] = imported.enabled[t];
      }
    }

    this.#state = next;
    this.#isLoaded = false;
    await this.persist(this.#state);
    await this.load();

    return this.getState();
  }

  /**
   * Check if preset type is enabled
   */
  getEnabled(type) {
    const t = normalizeType(type);
    return Boolean(this.#state?.enabled?.[t]);
  }

  /**
   * Enable/disable preset type
   */
  async setEnabled(type, enabled) {
    await this.ready;
    const t = normalizeType(type);
    this.#state.enabled[t] = Boolean(enabled);
    await this.persist();
    return this.getState();
  }

  /**
   * List all presets of a type
   */
  list(type) {
    const t = normalizeType(type);
    const entries = Object.entries(this.#state?.presets?.[t] || {});
    entries.sort((a, b) => String(a[1]?.name || a[0]).localeCompare(String(b[1]?.name || b[0])));
    return entries.map(([id, data]) => ({ id, ...clone(data) }));
  }

  /**
   * Get active preset ID for type
   */
  getActiveId(type) {
    const t = normalizeType(type);
    return this.#state?.active?.[t] || null;
  }

  /**
   * Get active preset for type
   */
  getActive(type) {
    const t = normalizeType(type);
    const id = this.getActiveId(t);
    return id ? clone(this.#state?.presets?.[t]?.[id] || null) : null;
  }

  /**
   * Set active preset for type
   */
  async setActive(type, id) {
    await this.ready;
    const t = normalizeType(type);

    if (!id || !this.#state?.presets?.[t]?.[id]) {
      return this.getState();
    }

    this.#state.active[t] = id;
    await this.persist();
    return this.getState();
  }

  /**
   * Create or update preset
   */
  async upsert(type, { id, name, data, makeActive } = {}) {
    await this.ready;
    const t = normalizeType(type);
    const presetId = id || genId(`preset-${t}`);
    const next = { ...(data || {}), name: String(name || data?.name || presetId) };

    if (t === 'openai') {
      try {
        normalizeOpenAIPreset(next);
      } catch {}
    }

    this.#state.presets[t][presetId] = next;

    // Only auto-activate on create (not update)
    const shouldActivate = typeof makeActive === 'boolean' ? makeActive : !id;
    if (shouldActivate) {
      this.#state.active[t] = presetId;
    }

    await this.persist();
    return presetId;
  }

  /**
   * Remove preset
   */
  async remove(type, id) {
    await this.ready;
    const t = normalizeType(type);

    if (!id || !this.#state?.presets?.[t]?.[id]) return;

    delete this.#state.presets[t][id];

    // Select new active if needed
    if (this.#state.active[t] === id) {
      const ids = Object.keys(this.#state.presets[t]);
      this.#state.active[t] = ids[0] || null;
    }

    await this.persist();
  }
}

// Singleton instance
let presetStoreInstance = null;

/**
 * Get or create the preset store instance
 */
export function getPresetStore() {
  if (!presetStoreInstance) {
    presetStoreInstance = new PresetStore();
  }
  return presetStoreInstance;
}

// Export default prompts for external use
export {
  DEFAULT_DIALOGUE_RULES_PRIVATE_CHAT,
  DEFAULT_GROUP_RULES,
  DEFAULT_MOMENT_COMMENT_RULES,
  DEFAULT_MOMENT_CREATION_RULES,
  DEFAULT_MOMENT_RULES,
  DEFAULT_SUMMARY_RULES,
};
