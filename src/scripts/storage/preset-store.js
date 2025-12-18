/**
 * Prompt Preset Store (SillyTavern-like)
 * - Persists selected presets and custom edits to disk (Tauri save_kv/load_kv)
 * - Loads bundled ST default presets from `assets/presets/st-defaults.json`
 */

import { logger } from '../utils/logger.js';

const safeInvoke = async (cmd, args) => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const invoker = g?.__TAURI__?.core?.invoke || g?.__TAURI__?.invoke || g?.__TAURI_INVOKE__ || g?.__TAURI_INTERNALS__?.invoke;
    if (typeof invoker !== 'function') {
        throw new Error('Tauri invoke not available');
    }
    return invoker(cmd, args);
};

const STORE_KEY = 'prompt_preset_store_v1';

const genId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

// 对话模式（私聊）提示词：
// - 预设的优势：可按场景（私聊/群聊/动态评论）自动注入不同提示词块（见 bridge.js A/B/C）。
// - 世界书的优势：可提供“格式大全/静态规则”并在缺失时自动创建（与手机流式一致）。
// 决策：场景判别继续由预设/应用侧负责；手机格式说明由世界书 `手机-格式*` 提供。
//
// 下面这段历史默认值包含大量“格式协议/<content> 约束”，与世界书 `手机-格式2-QQ聊天` / `手机-格式3-QQ空间` 重复，
// 且与我们后续要把 `<content>` 规则放在“预设-自定义”区块的做法冲突，因此默认不再内置这些约束。
// （保留旧内容于注释，方便回滚/对照）
//
// const DEFAULT_DIALOGUE_RULES_PRIVATE_CHAT_LEGACY_DUP = `
// ...（旧版内容，包含 <content> 约束与私聊格式说明）...
// `.trim();
const DEFAULT_DIALOGUE_RULES_PRIVATE_CHAT = `
# 行为风格与节奏指南 (Style & Pacing Guide)
- **🎭 角色扮演核心**:
  - **性格优先**: 严格遵循 {{char}} 的性格设定，这是最高原则。
  - **情境感知**: 根据对话氛围（闲聊、深入探讨、紧急、调情等）调整回复风格。
- **💬 聊天风格与节奏（核心格式规则）**:
  - **连续短消息**: 当回复较长或包含多个要点时，必须拆分为多条短消息（多行），模拟真实聊天节奏。
  - **禁止复述**: 严格禁止重复、补充或复述 {{user}} 输入内容；不要对 {{user}} 内容进行解释/改写。
  - **禁止冒充**: 严格禁止冒充 {{user}}，绝不模拟或代替 {{user}} 发言。
  - **保持互动**: 回复必须包含提问或引导，不能中断对话。
`.trim();

// 群聊提示词（默认精简版）：
// - 旧版包含完整 QQ 聊天格式介绍，与世界书 `手机-格式2-QQ聊天` 重复，已停用（保留于注释对照）。
// const DEFAULT_GROUP_RULES_LEGACY_DUP = `...`.trim();
const DEFAULT_GROUP_RULES = `
【群聊场景提示词】
当前处于群聊：{{group}}
群成员：{{members}}

（注：QQ聊天/群聊格式、特殊消息类型等“手机格式提示词”已由世界书「手机-格式2-QQ聊天」提供；本区块仅保留场景信息，避免重复。）
`.trim();

// 动态（QQ空间）提示词：从 `手机流式.html` 的“QQ空间格式介绍”迁移并适配到 <content> 内输出
// 动态（QQ空间）提示词（默认精简版）：
// - 旧版包含完整 QQ空间格式介绍 + moment_start/end 规则，与世界书 `手机-格式3-QQ空间` 重复，已停用（保留于注释对照）。
// const DEFAULT_MOMENT_RULES_LEGACY_DUP = `...`.trim();
const DEFAULT_MOMENT_RULES = `
【动态（QQ空间）场景提示词】
（注：QQ空间格式、评论系统说明、moment_start/moment_end 等“手机格式提示词”已由世界书「手机-格式3-QQ空间」提供；本区块默认不重复这些格式说明。）
`.trim();

// 动态发布决策提示词：从 DEFAULT_MOMENT_RULES 中的“任务：动态发布决策”段落拆分
const DEFAULT_MOMENT_CREATION_RULES = `
## 任务：动态发布决策
在回应聊天之后，请评估当前对话情景，并决定是否要发布一条新的动态。

	（注：具体输出协议（如 <content> 等）建议由“预设-自定义”区块统一管理；此处只保留决策逻辑。）

**【决策流程】**
1. **评估时机**：回顾刚刚的对话内容，判断是否属于以下【发布动态的参考时机】。
2. **概率冲动**：你可以在心中投一个10面骰(D10)。如果结果**大于等于7**，或者发生了**非常值得纪念/分享**的事情，你就应该发布一条新动态。
3. **角色性格**：最终决定必须严格符合角色性格。一个热爱分享、外向的角色会更倾向于发布动态。

**【发布动态的参考时机】**
- **里程碑事件**：完成了重要的任务、取得了成就、关系获得了突破（如成为恋人）。
- **美好瞬间**：看到了美丽的风景（夕阳、雪景）、品尝了美味的食物、收到了心仪的礼物。
- **强烈情绪**：感到非常开心、激动、自豪，或是有些许的失落、感慨，希望获得关注或安慰。
- **有趣日常**：遇到了搞笑的事情、想分享一个冷笑话、想展示自己新买的东西。
- **寻求互动**：想要发起一个话题（如“大家最喜欢的电影是什么？”）或者询问大家的意见。

**【输出格式】**
- 如果决定发布动态，请在 <content> 内输出完整的 \`moment_start\` ... \`moment_end\` 区块。
- 如果决定不发布，则**不要输出任何与动态相关的内容**。
`.trim();

// 动态评论回复提示词：用于“动态评论”场景（仅输出评论回覆规则）
const LEGACY_DEFAULT_MOMENT_COMMENT_RULES = `
你正在处理 QQ空间「动态评论回复」任务。

（注：具体输出协议（如 <content> 等）建议由“预设-自定义”区块统一管理；此处只保留评论回覆规则。）

【输入中会提供】
- moment_id、发布者、动态内容、用户评论、可用联系人名单

【输出硬性要求】
1) 只输出一个 <content>...</content> 区块，除此之外不要输出任何文字。
2) <content> 内必须输出一段 moment_reply_start/moment_reply_end：
   moment_reply_start
   moment_id::动态ID（使用输入中提供的 moment_id）
   评论人--评论内容
   评论人--评论内容
   moment_reply_end
3) 发布者必须回复用户评论；并且至少还要有 1 名其他角色参与评论。
4) 评论内容若需要换行，使用 <br>。

【注意】
- 评论人必须是具体名字（优先从联系人名单中挑选）；不要使用“匿名网友”等敷衍名字。
- 本场景不要输出私聊/群聊标签块（只输出评论回复）。
`.trim();

const DEFAULT_MOMENT_COMMENT_RULES = `
你正在处理 QQ空间「动态评论回复」任务。

（注：具体输出协议（如 <content> 等）建议由“预设-自定义”区块统一管理；此处只保留评论回覆规则。）

【输入中会提供】
- moment_id、发布者、动态内容
- 用户评论（会包含 user_comment_id）
- 可用联系人名单
- 可能还会提供：用户是否在回复某条评论（reply_to_comment_id / reply_to_author / reply_to_content）

【输出硬性要求】
1) 只输出一个 <content>...</content> 区块，除此之外不要输出任何文字。
2) <content> 内必须输出一段 moment_reply_start/moment_reply_end：
   moment_reply_start
   moment_id::动态ID（使用输入中提供的 moment_id）
   评论人--评论内容
   评论人--评论内容--reply_to::comment_id--reply_to_author::名字
   moment_reply_end
3) “谁来回复”不是强制：
   - 当用户在评论动态本身时：发布者对用户评论有较高概率回复，但可按情境与性格自行决定不回复（例如明显无关、骚扰/挑衅言论等）。
   - 当用户在回复某条评论时：被回复的那位角色对用户评论有较高概率回复；同样可按情境与性格自行决定不回复。
4) 至少输出 1 条评论；若情境合适可多条（可包含其他角色的围观/插话）。
5) 评论内容若需要换行，使用 <br>。

【reply_to 规则（用于楼中楼）】
- 仅当你要“回复某条评论”时才附加 reply_to::。
- reply_to:: 的值必须来自输入里提供的 comment_id / user_comment_id。
- reply_to_author:: 填被回复的角色名（可用输入里的 reply_to_author 或评论列表里的 author）。

【注意】
- 评论人必须是具体名字（优先从联系人名单中挑选）；不要使用“匿名网友”等敷衍名字。
- 本场景不要输出私聊/群聊标签块（只输出评论回复）。
`.trim();

// 摘要提示词：每次回覆末尾输出 <details><summary>摘要</summary>...</details>（纯中文）
const DEFAULT_SUMMARY_RULES = [
    '每次输出结束后，**紧跟着**以一句话概括本次互动的摘要，确保<details><summary>摘要</summary>',
    '<内容>',
    '</details>标签顺序正确，摘要**纯中文输出**，不得夹杂其它语言',
    '[summary_format]',
    '摘要格式示例：',
    '',
    '<details><summary>摘要</summary>',
    '',
    '用一句话概括本条回复的内容，禁止不必要的总结和升华',
].join('\n').trim();

const clone = (v) => {
    try {
        return structuredClone(v);
    } catch {
        return JSON.parse(JSON.stringify(v));
    }
};

const normalizeType = (type) => {
    const t = String(type || '').toLowerCase();
    if (t === 'sysprompt' || t === 'context' || t === 'instruct' || t === 'openai') return t;
    throw new Error(`Unknown preset type: ${type}`);
};

const ensureObj = (v, fallback) => (v && typeof v === 'object') ? v : fallback;

const normalizeOpenAIPreset = (preset) => {
    if (!preset || typeof preset !== 'object') return;

    // SillyTavern PromptManager global dummy character id
    const ST_PROMPT_ORDER_DUMMY_ID = 100001;
    const ST_PROMPT_ORDER_FALLBACK_ID = 100000;

    const coerceRole = (role) => {
        if (role === 0) return 'system';
        if (role === 1) return 'user';
        if (role === 2) return 'assistant';
        const r = String(role || '').toLowerCase().trim();
        if (r === 'system' || r === 'user' || r === 'assistant') return r;
        return 'system';
    };

    const coerceIdentifier = (p, fallback) => {
        const cand = [
            p?.identifier,
            p?.id,
            p?.prompt_id,
            p?.promptId,
            p?.name,
            p?.title,
        ];
        for (const c of cand) {
            const s = String(c || '').trim();
            if (s) return s;
        }
        return fallback;
    };

    const coerceContent = (p) => {
        const cand = [
            p?.content,
            p?.prompt,
            p?.text,
            p?.value,
            p?.message,
        ];
        for (const c of cand) {
            const s = String(c ?? '');
            if (s.trim()) return s;
        }
        return String(p?.content ?? '');
    };

    // 1) Normalize prompts: ST exports are usually an array, but some forks use object maps or "prompt" instead of "content".
    let promptsRaw = preset.prompts;
    if (!Array.isArray(promptsRaw) && promptsRaw && typeof promptsRaw === 'object') {
        // Some exports are keyed by identifier: { main: {...}, nsfw: {...} }
        promptsRaw = Object.entries(promptsRaw).map(([key, value]) => {
            if (value && typeof value === 'object') {
                // Preserve the map key as identifier when missing.
                if (!('identifier' in value) || !String(value.identifier || '').trim()) {
                    return { ...value, identifier: String(key || '').trim() || value.identifier };
                }
                return value;
            }
            // Extremely defensive: allow string values.
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
        const system_prompt = (typeof p?.system_prompt === 'boolean') ? p.system_prompt : true;
        const marker = Boolean(p?.marker);
        const content = coerceContent(p);
        const out = { ...p, identifier, name, role, system_prompt, marker, content };
        normalizedPrompts.push(out);

        // Build a mapping so prompt_order entries that refer to "id"/"name" can be resolved.
        const keys = [
            identifier,
            String(p?.id || '').trim(),
            String(p?.prompt_id || '').trim(),
            String(p?.name || '').trim(),
            String(p?.title || '').trim(),
        ].filter(Boolean);
        for (const k of keys) {
            if (!keyToIdentifier.has(k)) keyToIdentifier.set(k, identifier);
        }
    }
    preset.prompts = normalizedPrompts;

    // 2) Normalize prompt_order blocks and merge identifiers so our UI/builder won't drop blocks.
    let blocks = preset.prompt_order;
    if (!Array.isArray(blocks) && blocks && typeof blocks === 'object') {
        // Some exports store as {character_id:..., order:[...]} directly.
        // Others store as a map: { "100001": {character_id:..., order:[...]} }
        if ('order' in blocks || 'character_id' in blocks) {
            blocks = [blocks];
        } else {
            blocks = Object.values(blocks);
        }
    }
    blocks = Array.isArray(blocks) ? blocks : [];

    // NOTE: Per product requirement, ONLY import/use the ST global dummyId (100001) block.
    // Do NOT merge other character_id blocks; do NOT auto-append missing prompts to order.
    const importBlock =
        blocks.find(b => b && typeof b === 'object' && String(b.character_id) === String(ST_PROMPT_ORDER_DUMMY_ID)) ||
        null;
    if (!importBlock) return;

    const ingestOrder = (orderArr) => {
        const out = [];
        const seen = new Set();
        const arr = Array.isArray(orderArr) ? orderArr : [];
        for (const it of arr) {
            // ST order items are usually {identifier, enabled}, but may use id/name or even be a string.
            const rawKey = (() => {
                if (typeof it === 'string') return it;
                if (typeof it === 'number' && Number.isFinite(it)) {
                    // Some forks store numeric indices instead of identifiers.
                    const idx = Math.trunc(it);
                    const fromPrompt = promptsIn[idx];
                    return fromPrompt && typeof fromPrompt === 'object' ? (fromPrompt.identifier ?? fromPrompt.id ?? fromPrompt.name) : '';
                }
                if (it && typeof it === 'object') return (it.identifier ?? it.id ?? it.prompt_id ?? it.promptId ?? it.name ?? it.title);
                return '';
            })();
            const key = String(rawKey || '').trim();
            if (!key) continue;
            const identifier = keyToIdentifier.get(key) || key;
            if (seen.has(identifier)) continue;
            seen.add(identifier);
            const enabled = (it && typeof it === 'object' && 'enabled' in it) ? (it.enabled !== false) : true;
            out.push({ identifier, enabled });
        }
        return out;
    };

    const order = ingestOrder(importBlock.order);
    if (!order.length) return;

    // Keep ONLY dummyId=100001 order block (align ST PromptManager global strategy).
    preset.prompt_order = [{ character_id: ST_PROMPT_ORDER_DUMMY_ID, order }];
};

const makeDefaultState = (defaultsByType) => {
    const findIdByName = (type, name) => {
        const entries = Object.entries(defaultsByType?.[type] || {});
        const hit = entries.find(([_, p]) => (p?.name || '') === name) || entries[0];
        return hit ? hit[0] : null;
    };

    const ctxId = findIdByName('context', 'Default') || findIdByName('context', 'ChatML');
    const sysId = findIdByName('sysprompt', 'Neutral - Chat') || findIdByName('sysprompt', 'Roleplay - Immersive');
    const insId = findIdByName('instruct', 'ChatML') || findIdByName('instruct', 'Llama 3 Instruct');
    const openaiId = findIdByName('openai', 'Default');

    return {
        version: 1,
        presets: {
            sysprompt: defaultsByType?.sysprompt || {},
            context: defaultsByType?.context || {},
            instruct: defaultsByType?.instruct || {},
            openai: defaultsByType?.openai || {},
        },
        active: {
            sysprompt: sysId,
            context: ctxId,
            instruct: insId,
            openai: openaiId,
        },
        enabled: {
            sysprompt: true,
            context: true,
            instruct: false,
            openai: true,
        }
    };
};

export class PresetStore {
    constructor() {
        this.state = null;
        this.isLoaded = false;
        this.ready = this.load();
    }

    async loadBundledDefaults() {
        try {
            const resp = await fetch('./assets/presets/st-defaults.json', { cache: 'no-cache' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();
            const types = ensureObj(json?.types, {});
            const byType = {
                sysprompt: ensureObj(types.sysprompt, {}),
                context: ensureObj(types.context, {}),
                instruct: ensureObj(types.instruct, {}),
                openai: ensureObj(types.openai, {}),
            };

            // Convert {name -> presetData} to {id -> presetDataWithName} (stable id = name)
            const out = {};
            for (const type of Object.keys(byType)) {
                out[type] = {};
                for (const [name, data] of Object.entries(byType[type])) {
                    out[type][name] = { ...data, name: data?.name || name };
                }
            }
            return out;
        } catch (err) {
            logger.warn('加载内置 ST 预设失败', err);
            return { sysprompt: {}, context: {}, instruct: {}, openai: {} };
        }
    }

    async load() {
        if (this.isLoaded && this.state) return this.state;

        let state = null;
        try {
            const kv = await safeInvoke('load_kv', { name: STORE_KEY });
            if (kv && typeof kv === 'object' && Object.keys(kv).length) state = kv;
        } catch (err) {
            logger.debug('load_kv preset store failed (可能非 Tauri)', err);
        }

        if (!state) {
            try {
                const raw = localStorage.getItem(STORE_KEY);
                if (raw) state = JSON.parse(raw);
            } catch {}
        }

        const defaults = await this.loadBundledDefaults();
        if (!state || typeof state !== 'object' || !state.presets) {
            state = makeDefaultState(defaults);
            // 对话模式默认值（保存于 sysprompt 预设）
            for (const p of Object.values(state.presets.sysprompt || {})) {
                if (!p || typeof p !== 'object') continue;
                if (typeof p.dialogue_enabled !== 'boolean') p.dialogue_enabled = true;
                // 聊天提示词：固定注入到系统深度=1（历史前），避免混入 <history>
                if (typeof p.dialogue_position !== 'number') p.dialogue_position = 3;
                if (typeof p.dialogue_depth !== 'number') p.dialogue_depth = 1;
                if (typeof p.dialogue_role !== 'number') p.dialogue_role = 0;
                if (typeof p.dialogue_rules !== 'string' || !p.dialogue_rules.trim()) {
                    p.dialogue_rules = DEFAULT_DIALOGUE_RULES_PRIVATE_CHAT;
                }
                if (typeof p.moment_enabled !== 'boolean') p.moment_enabled = false;
                if (typeof p.moment_position !== 'number') p.moment_position = 0;
                if (typeof p.moment_depth !== 'number') p.moment_depth = 0;
                if (typeof p.moment_role !== 'number') p.moment_role = 0;
                if (typeof p.moment_rules !== 'string' || !p.moment_rules.trim()) {
                    p.moment_rules = DEFAULT_MOMENT_RULES;
                }

                // 分场景：动态发布决策 / 动态评论回复
                if (typeof p.moment_create_enabled !== 'boolean') p.moment_create_enabled = true;
                if (typeof p.moment_create_position !== 'number') p.moment_create_position = 0;
                if (typeof p.moment_create_depth !== 'number') p.moment_create_depth = 1;
                if (typeof p.moment_create_role !== 'number') p.moment_create_role = 0;
                if (typeof p.moment_create_rules !== 'string' || !p.moment_create_rules.trim()) {
                    p.moment_create_rules = DEFAULT_MOMENT_CREATION_RULES;
                }

                if (typeof p.moment_comment_enabled !== 'boolean') p.moment_comment_enabled = true;
                if (typeof p.moment_comment_position !== 'number') p.moment_comment_position = 0;
                if (typeof p.moment_comment_depth !== 'number') p.moment_comment_depth = 0;
                if (typeof p.moment_comment_role !== 'number') p.moment_comment_role = 0;
                if (typeof p.moment_comment_rules !== 'string' || !p.moment_comment_rules.trim()) {
                    p.moment_comment_rules = DEFAULT_MOMENT_COMMENT_RULES;
                }
                // Migration: 旧默认值「发布者必须回复用户评论」更新为更贴近社交应用的“高概率回复 + 可自行决策”
                try {
                    const cur = String(p.moment_comment_rules || '').trim();
                    if (cur && cur === LEGACY_DEFAULT_MOMENT_COMMENT_RULES.trim()) {
                        p.moment_comment_rules = DEFAULT_MOMENT_COMMENT_RULES;
                    }
                } catch {}

                if (typeof p.group_enabled !== 'boolean') p.group_enabled = true;
                // 群聊提示词：同上（系统深度=1）
                if (typeof p.group_position !== 'number') p.group_position = 3;
                if (typeof p.group_depth !== 'number') p.group_depth = 1;
                if (typeof p.group_role !== 'number') p.group_role = 0;
                if (typeof p.group_rules !== 'string' || !p.group_rules.trim()) {
                    p.group_rules = DEFAULT_GROUP_RULES;
                }

                if (typeof p.summary_enabled !== 'boolean') p.summary_enabled = true;
                if (typeof p.summary_position !== 'number') p.summary_position = 3;
                if (typeof p.summary_rules !== 'string' || !p.summary_rules.trim()) {
                    p.summary_rules = DEFAULT_SUMMARY_RULES;
                }
            }
            try {
                for (const p of Object.values(state.presets.openai || {})) normalizeOpenAIPreset(p);
            } catch {}
            await this.persist(state);
        } else {
            // ensure structure and merge defaults (do not overwrite user edits)
            state.version = 1;
            state.enabled = ensureObj(state.enabled, {});
            state.active = ensureObj(state.active, {});
            state.presets = ensureObj(state.presets, {});

            for (const type of ['sysprompt', 'context', 'instruct', 'openai']) {
                state.presets[type] = ensureObj(state.presets[type], {});
                for (const [id, data] of Object.entries(defaults[type] || {})) {
                    if (!state.presets[type][id]) state.presets[type][id] = data;
                }
                if (!state.active[type] || !state.presets[type][state.active[type]]) {
                    state.active[type] = Object.keys(state.presets[type])[0] || null;
                }
                if (typeof state.enabled[type] !== 'boolean') {
                    state.enabled[type] = (type === 'sysprompt' || type === 'context' || type === 'openai');
                }
            }

            // 对话模式默认值（保存于 sysprompt 预设，不覆盖用户已配置内容）
            for (const p of Object.values(state.presets.sysprompt || {})) {
                if (!p || typeof p !== 'object') continue;
                if (typeof p.dialogue_enabled !== 'boolean') p.dialogue_enabled = true; // 聊天室自动启用
                // 私聊提示词：迁移为系统深度=1（历史前）
                if (typeof p.dialogue_position !== 'number') p.dialogue_position = 3;
                else if (p.dialogue_position === 0 || p.dialogue_position === 1 || p.dialogue_position === 2) p.dialogue_position = 3;
                if (typeof p.dialogue_depth !== 'number') p.dialogue_depth = 1;
                if (typeof p.dialogue_role !== 'number') p.dialogue_role = 0; // SYSTEM
                const rules = (typeof p.dialogue_rules === 'string') ? p.dialogue_rules : '';
                const looksLegacy = rules.includes('msg_start') && rules.includes('QQ 私聊格式协议') && !rules.includes('<content>');
                // Migration: 旧默认值包含 <content> 约束与大量格式说明（与世界书手机-格式重复）
                const looksDupDialogueDefault =
                    rules.includes('对话模式输出协议') &&
                    rules.includes('输出硬性要求') &&
                    (rules.includes('程序只会解析') || rules.includes('<content>'));
                if (typeof p.dialogue_rules !== 'string' || !p.dialogue_rules.trim() || looksLegacy || looksDupDialogueDefault) {
                    p.dialogue_rules = DEFAULT_DIALOGUE_RULES_PRIVATE_CHAT;
                }

                if (typeof p.moment_enabled !== 'boolean') p.moment_enabled = false;
                if (typeof p.moment_position !== 'number') p.moment_position = 0; // IN_PROMPT
                if (typeof p.moment_depth !== 'number') p.moment_depth = 0; // 与原文件“深度=0”一致
                if (typeof p.moment_role !== 'number') p.moment_role = 0;
                if (typeof p.moment_rules !== 'string' || !p.moment_rules.trim()) {
                    p.moment_rules = DEFAULT_MOMENT_RULES;
                }
                const mr = (typeof p.moment_rules === 'string') ? p.moment_rules : '';
                const looksOldMoment = mr.includes('<QQ空间格式介绍>') && mr.includes('moment_start') && !mr.includes('任务：动态发布决策');
                const looksCommentDisabledDefault = mr.includes('评论部分暂时注释') || mr.includes('请不要输出任何评论行') || mr.includes('评论系统暂时注释');
                if (looksOldMoment || looksCommentDisabledDefault) {
                    p.moment_rules = DEFAULT_MOMENT_RULES;
                }

                // Migration: 旧 moment_* 迁移到 moment_comment_*（避免把“发布决策”误当成评论规则）
                if (typeof p.moment_comment_enabled !== 'boolean') p.moment_comment_enabled = true;
                if (typeof p.moment_comment_position !== 'number') p.moment_comment_position = (typeof p.moment_position === 'number') ? p.moment_position : 0;
                if (typeof p.moment_comment_depth !== 'number') p.moment_comment_depth = (typeof p.moment_depth === 'number') ? p.moment_depth : 0;
                if (typeof p.moment_comment_role !== 'number') p.moment_comment_role = (typeof p.moment_role === 'number') ? p.moment_role : 0;
                if (typeof p.moment_comment_rules !== 'string' || !p.moment_comment_rules.trim()) {
                    p.moment_comment_rules = DEFAULT_MOMENT_COMMENT_RULES;
                }

                if (typeof p.moment_create_enabled !== 'boolean') p.moment_create_enabled = true;
                if (typeof p.moment_create_position !== 'number') p.moment_create_position = 0;
                if (typeof p.moment_create_depth !== 'number') p.moment_create_depth = 1;
                if (typeof p.moment_create_role !== 'number') p.moment_create_role = 0;
                if (typeof p.moment_create_rules !== 'string' || !p.moment_create_rules.trim()) {
                    p.moment_create_rules = DEFAULT_MOMENT_CREATION_RULES;
                }

                if (typeof p.group_enabled !== 'boolean') p.group_enabled = true;
                // 群聊提示词：迁移为系统深度=1（历史前）
                if (typeof p.group_position !== 'number') p.group_position = 3;
                else if (p.group_position === 0 || p.group_position === 1 || p.group_position === 2) p.group_position = 3;
                if (typeof p.group_depth !== 'number') p.group_depth = 1;
                if (typeof p.group_role !== 'number') p.group_role = 0;
                const gr = (typeof p.group_rules === 'string') ? p.group_rules : '';
                const looksDupGroupDefault = gr.includes('<QQ聊天格式介绍>') || (gr.includes('格式示例如') && gr.includes('<群聊:'));
                if (typeof p.group_rules !== 'string' || !p.group_rules.trim() || looksDupGroupDefault) {
                    p.group_rules = DEFAULT_GROUP_RULES;
                }

                if (typeof p.summary_enabled !== 'boolean') p.summary_enabled = true;
                if (typeof p.summary_position !== 'number') p.summary_position = 3;
                else if (p.summary_position === 0 || p.summary_position === 1 || p.summary_position === 2) p.summary_position = 3;
                if (typeof p.summary_rules !== 'string' || !p.summary_rules.trim()) {
                    p.summary_rules = DEFAULT_SUMMARY_RULES;
                }
            }
            try {
                for (const p of Object.values(state.presets.openai || {})) normalizeOpenAIPreset(p);
            } catch {}
            await this.persist(state);
        }

        this.state = state;
        this.isLoaded = true;
        return this.state;
    }

    async persist(next = this.state) {
        this.state = next;
        try {
            await safeInvoke('save_kv', { name: STORE_KEY, data: this.state });
        } catch (err) {
            logger.warn('save_kv preset store failed (可能非 Tauri)，回退 localStorage', err);
            try {
                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
            } catch {}
        }
    }

    getState() {
        return this.state ? clone(this.state) : null;
    }

    async importState(imported, { mode = 'merge' } = {}) {
        await this.ready;
        if (!imported || typeof imported !== 'object') throw new Error('无效的预设设定档');
        if (!imported.presets || !imported.active || !imported.enabled) throw new Error('不是预设设定档格式');

        const next = clone(this.state || {});
        if (mode === 'replace') {
            this.state = clone(imported);
            this.isLoaded = false;
            await this.persist(this.state);
            await this.load(); // normalize + merge defaults
            return this.getState();
        }

        // merge: overwrite by id, keep existing otherwise
        for (const t of ['sysprompt', 'context', 'instruct', 'openai']) {
            next.presets ||= {};
            next.presets[t] ||= {};
            const incoming = imported.presets?.[t];
            if (incoming && typeof incoming === 'object') {
                for (const [id, data] of Object.entries(incoming)) {
                    next.presets[t][id] = data;
                }
            }
            if (imported.active?.[t]) next.active ||= {};
            if (imported.active?.[t]) next.active[t] = imported.active[t];
            if (typeof imported.enabled?.[t] === 'boolean') {
                next.enabled ||= {};
                next.enabled[t] = imported.enabled[t];
            }
        }

        this.state = next;
        this.isLoaded = false;
        await this.persist(this.state);
        await this.load();
        return this.getState();
    }

    getEnabled(type) {
        const t = normalizeType(type);
        return Boolean(this.state?.enabled?.[t]);
    }

    async setEnabled(type, enabled) {
        await this.ready;
        const t = normalizeType(type);
        this.state.enabled[t] = Boolean(enabled);
        await this.persist();
        return this.getState();
    }

    list(type) {
        const t = normalizeType(type);
        const entries = Object.entries(this.state?.presets?.[t] || {});
        entries.sort((a, b) => String(a[1]?.name || a[0]).localeCompare(String(b[1]?.name || b[0])));
        return entries.map(([id, data]) => ({ id, ...clone(data) }));
    }

    getActiveId(type) {
        const t = normalizeType(type);
        return this.state?.active?.[t] || null;
    }

    getActive(type) {
        const t = normalizeType(type);
        const id = this.getActiveId(t);
        return id ? clone(this.state?.presets?.[t]?.[id] || null) : null;
    }

    async setActive(type, id) {
        await this.ready;
        const t = normalizeType(type);
        if (!id || !this.state?.presets?.[t]?.[id]) return this.getState();
        this.state.active[t] = id;
        await this.persist();
        return this.getState();
    }

    async upsert(type, { id, name, data }) {
        await this.ready;
        const t = normalizeType(type);
        const presetId = id || genId(`preset-${t}`);
        const next = { ...(data || {}), name: String(name || data?.name || presetId) };
        if (t === 'openai') {
            try { normalizeOpenAIPreset(next); } catch {}
        }
        this.state.presets[t][presetId] = next;
        this.state.active[t] = presetId;
        await this.persist();
        return presetId;
    }

    async remove(type, id) {
        await this.ready;
        const t = normalizeType(type);
        if (!id || !this.state?.presets?.[t]?.[id]) return;
        delete this.state.presets[t][id];
        const ids = Object.keys(this.state.presets[t]);
        if (this.state.active[t] === id) {
            this.state.active[t] = ids[0] || null;
        }
        await this.persist();
    }
}
