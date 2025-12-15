/**
 * Prompt Preset Store (SillyTavern-like)
 * - Persists selected presets and custom edits to disk (Tauri save_kv/load_kv)
 * - Loads bundled ST default presets from `assets/presets/st-defaults.json`
 */

import { logger } from '../utils/logger.js';

const safeInvoke = async (cmd, args) => {
    const invoker = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INVOKE__;
    if (typeof invoker !== 'function') {
        throw new Error('Tauri invoke not available');
    }
    return invoker(cmd, args);
};

const STORE_KEY = 'prompt_preset_store_v1';

const genId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

// 对话模式：从 `手机流式.html` 迁移过来的“私聊协议提示词”（已移除群聊/动态/主动消息部分）
// 注意：该段提示词用于让模型输出可解析的私聊格式，后续会在 app 内解析分流。
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

# 对话模式输出协议（仅私聊 / 单聊天室）
你可以在 \`<thinking>\` 里思考（可选），但 **程序只会解析 \`<content>\`**。

## 输出硬性要求
1. 输出必须包含一个 \`<content>\`...\`</content>\` 区块；**所有可见回复必须放在 content 内**。
2. \`<content>\` 内必须且只能包含一个私聊标签：
   - \`<{{user}}和{{char}}的私聊>\` ... \`</{{user}}和{{char}}的私聊>\`
   - **标签名字顺序必须是**：\`{{user}}和{{char}}的私聊\`（不要写反）
3. 私聊标签内部，每一行代表一条要发送到聊天室的消息，并且 **必须以 \`-\` 开头**：
   - \`- 你好呀\`
   - \`- 你现在在做什么？\`
4. 若消息内容需要换行，请在消息内容中使用 \`<br>\`（而不是直接换行）。
5. 禁止输出群聊、动态、评论、主动发起等任何其他格式/标签（本阶段仅私聊）。

## 特殊消息类型（仍然作为一条消息，用 - 开头）
以下类型必须作为独立的一条消息（独立成行）：
- \`- [bqb-表情包内容]\`
- \`- [zz-金额元]\`（仅私聊可用）
- \`- [yy-语音内容]\`
- \`- [music-歌名$歌手]\`
- \`- [img-内容描述]\`

## 私聊示例（仅示例，按当前对话生成）
<thinking>...</thinking>
<content>
<{{user}}和{{char}}的私聊>
- 你好呀，刚刚在忙什么？
- 想听你说说今天发生了什么。
</{{user}}和{{char}}的私聊>
</content>
`.trim();

// 动态（QQ空间）提示词：从 `手机流式.html` 的“QQ空间格式介绍”迁移并适配到 <content> 内输出
const DEFAULT_MOMENT_RULES = `
<QQ空间格式介绍>

{{user}} 和角色们都会使用聊天软件 QQ。QQ空间是 QQ 的公开个人空间，可以在里面发布动态，所有人都能看到。

重要：你可以在 <thinking> 里思考（可选），但 **程序只会解析 <content>**。因此动态内容必须在 <content> 内输出。

输出格式（可包含多个动态，按行解析）：
moment_start
发言人--发言内容--发言时间--已浏览人数--已点赞人数
// （评论部分暂时注释：请勿输出评论行，后续会优化评论系统）
// 发言人--评论内容
// 发言人--评论内容
发言人--发言内容--发言时间--已浏览人数--已点赞人数
// 发言人--评论内容
moment_end

动态规则：
1. （评论系统暂时注释）本阶段请不要输出任何评论行。
2. 发言内容中如果需要换行，使用 <br>。
4. 动态若有配图，使用 [img-内容] 这个格式嵌入到发言内容中，例如：
   角色名--我好看吗[img-一张自拍]--12:00--67--32
5. 仅输出 moment_start/moment_end（不要输出群聊/私聊格式块；本阶段只做动态页面）。

动态回复格式（当用户在某条动态下评论时）：
// （评论回复暂时注释：后续会优化）
// moment_reply_start
// moment_id::动态ID
// 评论人--评论内容
// moment_reply_end

## 任务：动态发布决策（从 手机流式.html 搬运）
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
- **寻求互动**：想要发起一个话题（如“大家最喜欢的电影是什么？”）或者询问大家的意见。

**【输出格式】**
- 如果决定发布动态，请在 <content> 内输出完整的 \`moment_start\` ... \`moment_end\` 区块。
- 如果决定不发布，则**不要输出任何与动态相关的内容**。

</QQ空间格式介绍>
`.trim();

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
                if (typeof p.dialogue_position !== 'number') p.dialogue_position = 0;
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
            }
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
                if (typeof p.dialogue_position !== 'number') p.dialogue_position = 0; // IN_PROMPT
                if (typeof p.dialogue_depth !== 'number') p.dialogue_depth = 1;
                if (typeof p.dialogue_role !== 'number') p.dialogue_role = 0; // SYSTEM
                const rules = (typeof p.dialogue_rules === 'string') ? p.dialogue_rules : '';
                const looksLegacy = rules.includes('msg_start') && rules.includes('QQ 私聊格式协议') && !rules.includes('<content>');
                if (typeof p.dialogue_rules !== 'string' || !p.dialogue_rules.trim() || looksLegacy) {
                    p.dialogue_rules = DEFAULT_DIALOGUE_RULES_PRIVATE_CHAT;
                }

                if (typeof p.moment_enabled !== 'boolean') p.moment_enabled = false;
                if (typeof p.moment_position !== 'number') p.moment_position = 0; // IN_PROMPT
                if (typeof p.moment_depth !== 'number') p.moment_depth = 0; // 与原文件“深度=0”一致
                if (typeof p.moment_role !== 'number') p.moment_role = 0;
                if (typeof p.moment_rules !== 'string' || !p.moment_rules.trim()) {
                    p.moment_rules = DEFAULT_MOMENT_RULES;
                }
                // 若仍是旧版“含评论输出”的默认规则，自动迁移为“评论注释版”（不覆盖用户自定义）
                const mr = (typeof p.moment_rules === 'string') ? p.moment_rules : '';
                const looksOldMoment = mr.includes('<QQ空间格式介绍>') && mr.includes('moment_start') && !mr.includes('任务：动态发布决策');
                if (looksOldMoment) {
                    p.moment_rules = DEFAULT_MOMENT_RULES;
                }
            }
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
