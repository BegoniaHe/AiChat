/**
 * UI 桥接层 - 连接原有 UI 代码和新的 API 层
 */

import { LLMClient } from '../api/client.js';
import { ConfigManager } from '../storage/config.js';
import { ChatStorage } from '../storage/chat.js';
import { WorldInfoStore, convertSTWorld } from '../storage/worldinfo.js';
import { PresetStore } from '../storage/preset-store.js';
import { RegexStore, regex_placement } from '../storage/regex-store.js';
import { logger } from '../utils/logger.js';
import { retryWithBackoff, isRetryableError } from '../utils/retry.js';
// 在瀏覽器（開發模式）與 Tauri 環境下兼容的 invoke
const safeInvoke = async (cmd, args) => {
    const invoker = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INVOKE__;
    if (typeof invoker !== 'function') {
        throw new Error('Tauri invoke not available');
    }
    return invoker(cmd, args);
};

const truthy = (v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return Boolean(v);
};

const renderStTemplate = (template, vars) => {
    let out = String(template || '');
    // {{#if var}}...{{else}}...{{/if}} (SillyTavern preset format)
    const ifRe = /{{#if\s+([a-zA-Z0-9_]+)\s*}}([\s\S]*?)({{else}}([\s\S]*?))?{{\/if}}/g;
    // Loop to handle multiple blocks (no nesting expected in presets)
    for (let i = 0; i < 100; i++) {
        const next = out.replace(ifRe, (_m, key, ifTrue, _elseBlock, ifFalse) => {
            return truthy(vars?.[key]) ? ifTrue : (ifFalse || '');
        });
        if (next === out) break;
        out = next;
    }
    // Replace variables {{var}} and {{trim}}
    out = out.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => {
        if (key === 'trim') return '';
        const v = vars?.[key];
        return (v === null || v === undefined) ? '' : String(v);
    });
    // Cleanup any leftover trim token and trim surrounding whitespace
    out = out.replace(/{{\s*trim\s*}}/g, '');
    return out.trim();
};

const applyMacros = (text, vars) => {
    const raw = String(text || '');
    if (!raw) return '';
    return raw.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => {
        const v = vars?.[key];
        return (v === null || v === undefined) ? '' : String(v);
    });
};

class AppBridge {
    constructor() {
        this.config = new ConfigManager();
        this.chatStorage = new ChatStorage();
        this.worldStore = new WorldInfoStore();
        this.presets = new PresetStore();
        this.regex = new RegexStore();
        this.client = null;
        this.initialized = false;
        this.currentCharacterId = 'default';
        this.currentWorldId = null;
        this.globalWorldId = this.loadGlobalWorldId();
        this.activeSessionId = 'default';
        this.worldSessionMap = this.loadWorldSessionMap();
        this.isGenerating = false;
        this.hydrateWorldSessionMap();
        this.hydrateGlobalWorldId();
    }

    loadGlobalWorldId() {
        try {
            const raw = localStorage.getItem('global_world_id_v1');
            return raw ? String(raw) : null;
        } catch {
            return null;
        }
    }

    loadWorldSessionMap() {
        try {
            const raw = localStorage.getItem('world_session_map_v1');
            return raw ? JSON.parse(raw) : {};
        } catch (err) {
            logger.warn('world-session map 讀取失敗，重置', err);
            return {};
        }
    }

    async hydrateWorldSessionMap() {
        try {
            const kv = await safeInvoke('load_kv', { name: 'world_session_map_v1' });
            if (kv && typeof kv === 'object' && Object.keys(kv).length) {
                this.worldSessionMap = kv;
                localStorage.setItem('world_session_map_v1', JSON.stringify(kv));
                // 切換當前 session 的世界書
                if (this.activeSessionId && kv[this.activeSessionId]) {
                    this.currentWorldId = kv[this.activeSessionId];
                    window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: this.currentWorldId } }));
                }
                logger.info('world-session map hydrated from disk');
            }
        } catch (err) {
            logger.debug('world-session map 磁碟加載失敗（可能非 Tauri）', err);
        }
    }

    async hydrateGlobalWorldId() {
        try {
            const kv = await safeInvoke('load_kv', { name: 'global_world_id_v1' });
            if (kv && typeof kv === 'string' && kv.trim()) {
                this.globalWorldId = kv.trim();
                try { localStorage.setItem('global_world_id_v1', this.globalWorldId); } catch {}
            }
        } catch (err) {
            logger.debug('global world id 磁碟加載失敗（可能非 Tauri）', err);
        }
    }

    persistWorldSessionMap() {
        localStorage.setItem('world_session_map_v1', JSON.stringify(this.worldSessionMap || {}));
        safeInvoke('save_kv', { name: 'world_session_map_v1', data: this.worldSessionMap }).catch(() => {});
    }

    persistGlobalWorldId() {
        try { localStorage.setItem('global_world_id_v1', this.globalWorldId || ''); } catch {}
        // 保存为 string（kv 支持任意 JSON；这里用 string 简化）
        safeInvoke('save_kv', { name: 'global_world_id_v1', data: String(this.globalWorldId || '') }).catch(() => {});
    }

    /**
     * 初始化桥接层
     */
    async init() {
        try {
            logger.info('初始化 AppBridge...');

            // 加载配置
            await this.presets.ready;
            await this.regex.ready;
            let config = await this.config.load();

            // 若当前启用的“生成参数/提示词区块”预设绑定了连接配置，则优先切换到该 profile（ST 风格：预设可携带/绑定连接）
            try {
                const presetState = this.presets.getState?.();
                const useOpenAIPreset = Boolean(presetState?.enabled?.openai);
                if (useOpenAIPreset) {
                    const openp = this.presets.getActive('openai');
                    const boundId = openp?.boundProfileId;
                    if (boundId && this.config.getActiveProfileId?.() !== boundId) {
                        const runtime = await this.config.setActiveProfile(boundId);
                        config = runtime || this.config.get();
                    }
                }
            } catch (err) {
                logger.debug('预设绑定连接初始化失败（忽略）', err);
            }

            // 初始化 LLM 客户端
            if (config.apiKey) {
                this.client = new LLMClient(config);
                logger.info(`LLM 客户端初始化成功 (provider: ${config.provider})`);
            } else {
                logger.warn('未配置 API Key，请先配置');
            }

            this.initialized = true;
            logger.info('AppBridge 初始化完成');

            return true;
        } catch (error) {
            logger.error('AppBridge 初始化失败:', error);
            return false;
        }
    }

    /**
     * 检查是否已配置
     */
    isConfigured() {
        const config = this.config.get();
        return config && config.apiKey && config.apiKey.length > 0;
    }

    /**
     * 切換當前會話（影響世界書選中）
     */
    setActiveSession(sessionId = 'default') {
        this.activeSessionId = sessionId;
        this.currentWorldId = this.worldSessionMap[sessionId] || null;
        window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: this.currentWorldId } }));
    }

    getRegexContext() {
        const presetState = this.presets?.getState?.() || {};
        const worldIds = [];
        if (this.globalWorldId) worldIds.push(String(this.globalWorldId));
        if (this.currentWorldId) worldIds.push(String(this.currentWorldId));
        return {
            sessionId: this.activeSessionId,
            worldId: this.currentWorldId,
            worldIds,
            activePresets: presetState?.active || {},
        };
    }

    applyInputRegex(text, { isEdit = false, depth } = {}) {
        try {
            return this.regex.apply(text, this.getRegexContext(), regex_placement.USER_INPUT, {
                isMarkdown: false,
                isPrompt: false,
                isEdit: Boolean(isEdit),
                depth,
            });
        } catch {
            return String(text ?? '');
        }
    }

    applyInputStoredRegex(text, opts) {
        return this.applyInputRegex(text, opts);
    }

    applyInputDisplayRegex(text, { isEdit = false, depth } = {}) {
        try {
            return this.regex.apply(text, this.getRegexContext(), regex_placement.USER_INPUT, {
                isMarkdown: true,
                isPrompt: false,
                isEdit: Boolean(isEdit),
                depth,
            });
        } catch {
            return String(text ?? '');
        }
    }

    /**
     * Direct (non-ephemeral) scripts: alter stored chat content irreversibly
     * - ST semantics: neither "Alter Chat Display" nor "Alter Outgoing Prompt" checked
     */
    applyOutputStoredRegex(text, { isEdit = false, depth } = {}) {
        try {
            return this.regex.apply(text, this.getRegexContext(), regex_placement.AI_OUTPUT, {
                isMarkdown: false,
                isPrompt: false,
                isEdit: Boolean(isEdit),
                depth,
            });
        } catch {
            return String(text ?? '');
        }
    }

    /**
     * Ephemeral display scripts: alter what user sees, without changing stored chat text
     */
    applyOutputDisplayRegex(text, { isEdit = false, depth } = {}) {
        try {
            return this.regex.apply(text, this.getRegexContext(), regex_placement.AI_OUTPUT, {
                isMarkdown: true,
                isPrompt: false,
                isEdit: Boolean(isEdit),
                depth,
            });
        } catch {
            return String(text ?? '');
        }
    }

    /**
     * Compatibility: raw -> stored -> display
     */
    applyOutputRegex(text) {
        const stored = this.applyOutputStoredRegex(text);
        return this.applyOutputDisplayRegex(stored);
    }

    /**
     * 生成 AI 回复
     * @param {string} userMessage - 用户消息
     * @param {Object} context - 上下文（角色设定、历史消息等）
     * @returns {Promise<string>|AsyncGenerator<string>} 回复内容或流
     */
    async generate(userMessage, context = {}) {
        if (!this.initialized) {
            await this.init();
        }

        if (!this.isConfigured()) {
            throw new Error('请先配置 API 信息');
        }

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            throw new Error('當前離線，請連接網絡後再試');
        }

        if (this.isGenerating) {
            throw new Error('正在生成中，请稍候...');
        }

        this.isGenerating = true;

        try {
            const originalInput = userMessage;
            // ST semantics:
            // - direct scripts (non-ephemeral) may alter stored chat content
            // - promptOnly scripts apply to outgoing prompt only
            const ctx = this.getRegexContext();
            const directInput = this.regex.apply(userMessage, ctx, regex_placement.USER_INPUT, {
                isMarkdown: false,
                isPrompt: false,
                isEdit: false,
                depth: 0,
            });
            const promptInput = this.regex.apply(directInput, ctx, regex_placement.USER_INPUT, {
                isMarkdown: false,
                isPrompt: true,
                isEdit: false,
                depth: 0,
            });
            const messages = this.buildMessages(promptInput, context);
            const config = this.config.get();
            const genOptions = this.getGenerationOptions();

            logger.debug('发送消息到 LLM:', { messageCount: messages.length, stream: config.stream });

            if (config.stream) {
                return this.generateStream(messages, genOptions, originalInput);
            } else {
                const response = await retryWithBackoff(
                    () => this.client.chat(messages, genOptions),
                    {
                        maxRetries: config.maxRetries || 3,
                        shouldRetry: isRetryableError
                    }
                );

                // 保存到历史记录
                await this.saveToHistory(originalInput, response);
                return response;
            }
        } catch (error) {
            logger.error('生成失败:', error);
            throw error;
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * 流式生成
     */
    async *generateStream(messages, genOptions = {}, originalUserMessage = '') {
        let fullResponse = '';

        try {
            for await (const chunk of this.client.streamChat(messages, genOptions)) {
                fullResponse += chunk;
                yield chunk;
            }

            // 流式完成后保存到历史记录
            await this.saveToHistory(originalUserMessage || '', fullResponse);
        } catch (error) {
            logger.error('流式生成失败:', error);
            throw error;
        }
    }

    /**
     * 构建消息数组
     */
    buildMessages(userMessage, context = {}) {
        const messages = [];

        const name1 = context?.user?.name || 'user';
        const name2 = context?.character?.name || 'assistant';
        const worldPrompt = this.getActiveWorldPrompt();

        const presetState = this.presets?.getState?.() || null;
        const useSysprompt = Boolean(presetState?.enabled?.sysprompt);
        const useContext = Boolean(presetState?.enabled?.context);
        const useOpenAIPreset = Boolean(presetState?.enabled?.openai);
        const syspActive = this.presets.getActive('sysprompt') || null;
        const sysp = useSysprompt ? syspActive : null;
        const ctxp = useContext ? this.presets.getActive('context') : null;
        const openp = useOpenAIPreset ? this.presets.getActive('openai') : null;

        // 对话模式：额外注入对话协议提示词（保存于 sysprompt 预设）
        // ST extension prompt types => IN_PROMPT:0, IN_CHAT:1, BEFORE_PROMPT:2, NONE:-1
        const dialogueEnabled = Boolean(syspActive?.dialogue_enabled);
        const dialogueRulesRaw = (typeof syspActive?.dialogue_rules === 'string') ? syspActive.dialogue_rules : '';
        const dialogueRules = applyMacros(dialogueRulesRaw, { user: name1, char: name2 });
        const dialoguePosition = Number.isFinite(Number(syspActive?.dialogue_position)) ? Number(syspActive.dialogue_position) : 0;
        const dialogueDepth = Number.isFinite(Number(syspActive?.dialogue_depth)) ? Math.max(0, Math.trunc(Number(syspActive.dialogue_depth))) : 1;
        const dialogueRole = Number.isFinite(Number(syspActive?.dialogue_role)) ? Math.trunc(Number(syspActive.dialogue_role)) : 0;

        // Formatting helpers from OpenAI preset (optional)
        const wiFormat = (typeof openp?.wi_format === 'string' && openp.wi_format.includes('{0}')) ? openp.wi_format : '{0}';
        const scenarioFormat = typeof openp?.scenario_format === 'string' ? openp.scenario_format : '{{scenario}}';
        const personalityFormat = typeof openp?.personality_format === 'string' ? openp.personality_format : '{{personality}}';

        // When OpenAI preset has prompt_order: use ST-like block ordering (drag & drop in UI)
        const openaiOrder = Array.isArray(openp?.prompt_order?.[0]?.order) ? openp.prompt_order[0].order : null;
        if (useOpenAIPreset && openp && openaiOrder && openaiOrder.length) {
            const historyRaw = Array.isArray(context.history) ? context.history.slice() : [];
            // ST promptOnly scripts: apply to outgoing prompt only
            const history = historyRaw.map((m, idx) => {
                const role = m?.role === 'user' ? 'user' : 'assistant';
                const content = String(m?.content ?? '');
                const depth = (historyRaw.length - 1) - idx; // 0 = last message
                const placement = role === 'user' ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT;
                const out = this.regex.apply(content, this.getRegexContext(), placement, {
                    isMarkdown: false,
                    isPrompt: true,
                    isEdit: false,
                    depth,
                });
                return { role, content: out };
            });

            // 对话提示词：按 ST extension prompt 的位置/深度语义注入
            if (dialogueEnabled && dialogueRules) {
                if (dialoguePosition === 1) { // IN_CHAT
                    const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' };
                    const role = roleMap[dialogueRole] || 'system';
                    const idx = Math.max(0, history.length - dialogueDepth);
                    history.splice(idx, 0, { role, content: dialogueRules });
                } else if (dialoguePosition === 2 || dialoguePosition === 0) { // BEFORE_PROMPT or IN_PROMPT
                    messages.push({ role: 'system', content: dialogueRules });
                }
            }
            const prompts = Array.isArray(openp.prompts) ? openp.prompts : [];
            const byId = new Map();
            prompts.forEach(p => { if (p?.identifier) byId.set(p.identifier, p); });

            const macroVars = { user: name1, char: name2, scenario: context?.character?.scenario || '', personality: context?.character?.personality || '' };
            const formatScenario = applyMacros(scenarioFormat, { scenario: macroVars.scenario });
            const formatPersonality = applyMacros(personalityFormat, { personality: macroVars.personality });
            // WORLD_INFO placement for prompt stage (supports promptOnly scripts)
            let worldForPrompt = worldPrompt || '';
            if (worldForPrompt) {
                worldForPrompt = this.regex.apply(worldForPrompt, this.getRegexContext(), regex_placement.WORLD_INFO, {
                    isMarkdown: false,
                    isPrompt: true,
                    isEdit: false,
                    depth: 0,
                });
            }
            const formatWorld = worldForPrompt ? wiFormat.replace('{0}', worldForPrompt) : '';

            const resolveMarker = (identifier) => {
                switch (identifier) {
                    case 'worldInfoBefore':
                    case 'worldInfoAfter':
                        return formatWorld;
                    case 'charDescription':
                        return context?.character?.description || '';
                    case 'charPersonality':
                        return formatPersonality || '';
                    case 'scenario':
                        return formatScenario || '';
                    case 'personaDescription':
                        return context?.user?.persona || '';
                    // dialogueExamples/chatHistory are markers without content here
                    default:
                        return '';
                }
            };

            let historyInserted = false;

            for (const item of openaiOrder) {
                const identifier = item?.identifier;
                const enabled = item?.enabled !== false;
                if (!identifier || !enabled) continue;

                if (identifier === 'chatHistory') {
                    if (history.length) messages.push(...history);
                    historyInserted = true;
                    continue;
                }

                const pr = byId.get(identifier);
                const isMarker = Boolean(pr?.marker) || ['chatHistory', 'dialogueExamples', 'worldInfoBefore', 'worldInfoAfter', 'charDescription', 'charPersonality', 'scenario', 'personaDescription'].includes(identifier);

                if (isMarker) {
                    const content = resolveMarker(identifier);
                    if (content) {
                        messages.push({ role: 'system', content });
                    }
                    continue;
                }

                // Custom/editable prompt block
                let content = (typeof pr?.content === 'string') ? pr.content : '';
                // Special case: main prompt fallback
                if (identifier === 'main' && !content) {
                    if (useSysprompt && sysp?.content) content = sysp.content;
                    else if (context.systemPrompt) content = context.systemPrompt;
                }
                content = applyMacros(content, { user: name1, char: name2 });
                if (!content) continue;

                const role = String(pr?.role || 'system').toLowerCase();
                const mappedRole = (role === 'user' || role === 'assistant' || role === 'system') ? role : 'system';
                messages.push({ role: mappedRole, content });
            }

            if (!historyInserted && history.length) {
                messages.push(...history);
            }

            // Append current user message
            messages.push({ role: 'user', content: userMessage });
            return messages;
        }

        const vars = {
            user: name1,
            char: name2,
            system: (() => {
                if (useSysprompt && sysp?.content) return applyMacros(sysp.content, { user: name1, char: name2 });
                return (context.systemPrompt || '');
            })(),
            description: context?.character?.description || '',
            personality: applyMacros(personalityFormat, { personality: (context?.character?.personality || '') }),
            scenario: applyMacros(scenarioFormat, { scenario: (context?.character?.scenario || '') }),
            persona: context?.user?.persona || '',
            wiBefore: worldPrompt ? wiFormat.replace('{0}', worldPrompt) : '',
            wiAfter: '',
            loreBefore: worldPrompt ? wiFormat.replace('{0}', worldPrompt) : '',
            loreAfter: '',
            anchorBefore: '',
            anchorAfter: '',
            mesExamples: '',
            mesExamplesRaw: '',
            trim: '',
        };

        // 1) Context preset: render story_string as ST-like template
        const combinedStoryString = (ctxp?.story_string && useContext)
            ? renderStTemplate(ctxp.story_string, vars)
            : '';

        // 2) Place story string according to story_string_position
        // ST: extension_prompt_types => IN_PROMPT:0, IN_CHAT:1, BEFORE_PROMPT:2, NONE:-1
        const position = Number(ctxp?.story_string_position ?? 0);
        const injectDepth = Math.max(0, Number(ctxp?.story_string_depth ?? 1));
        const injectRole = Number(ctxp?.story_string_role ?? 0);

        // BEFORE_PROMPT: put as the very first system message
        if (combinedStoryString && position === 2) {
            messages.push({ role: 'system', content: combinedStoryString });
        }

        // IN_PROMPT: also system message near start (we keep same behavior as openai-style)
        if (combinedStoryString && position === 0) {
            messages.push({ role: 'system', content: combinedStoryString });
        }

        // 对话提示词：BEFORE_PROMPT / IN_PROMPT 都视为系统开头注入
        if (dialogueEnabled && dialogueRules && (dialoguePosition === 2 || dialoguePosition === 0)) {
            messages.push({ role: 'system', content: dialogueRules });
        }

        // If context preset disabled, fall back to legacy system prompt building
        if (!useContext) {
            if (context.systemPrompt) {
                messages.push({ role: 'system', content: context.systemPrompt });
            }
            if (vars.system) {
                messages.push({ role: 'system', content: vars.system });
            }
            if (worldPrompt) {
                messages.push({ role: 'system', content: wiFormat.replace('{0}', worldPrompt) });
            }
            if (context.character) {
                let characterPrompt = `你正在扮演: ${context.character.name}`;
                if (context.character.description) characterPrompt += `\n\n角色描述:\n${context.character.description}`;
                if (context.character.personality) characterPrompt += `\n\n性格特点:\n${context.character.personality}`;
                messages.push({ role: 'system', content: characterPrompt });
            }
        }

        // 3) History
        const history = Array.isArray(context.history) ? context.history.slice() : [];

        // IN_CHAT: inject story string into history (depth + role)
        if (combinedStoryString && position === 1) {
            const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' };
            const role = roleMap[injectRole] || 'system';
            const idx = Math.max(0, history.length - injectDepth);
            history.splice(idx, 0, { role, content: combinedStoryString });
        }
        // IN_CHAT: inject dialogue rules into history (depth + role)
        if (dialogueEnabled && dialogueRules && dialoguePosition === 1) {
            const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' };
            const role = roleMap[dialogueRole] || 'system';
            const idx = Math.max(0, history.length - dialogueDepth);
            history.splice(idx, 0, { role, content: dialogueRules });
        }

        if (history.length > 0) {
            messages.push(...history);
        }

        // 4) Post-history instructions (sysprompt.post_history)
        const postHistory = useSysprompt ? (sysp?.post_history || '') : '';
        if (postHistory) {
            const phi = applyMacros(postHistory, { user: name1, char: name2 });
            if (phi) {
                messages.push({ role: 'user', content: phi });
            }
        }

        // 5) Current user message
        messages.push({ role: 'user', content: userMessage });
        return messages;
    }

    /**
     * SillyTavern-like generation parameters (from OpenAI preset)
     * We store the full OpenAI preset JSON, but only map common fields into provider options.
     */
    getGenerationOptions() {
        try {
            const state = this.presets?.getState?.();
            if (!state?.enabled?.openai) return {};
            const p = this.presets.getActive('openai');
            if (!p || typeof p !== 'object') return {};

            const num = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : undefined;
            const int = (v) => (typeof v === 'number' && Number.isFinite(v)) ? Math.trunc(v) : undefined;

            const base = {
                temperature: num(p.temperature),
                top_p: num(p.top_p),
                top_k: int(p.top_k),
                presence_penalty: num(p.presence_penalty),
                frequency_penalty: num(p.frequency_penalty),
                seed: int(p.seed),
                n: int(p.n),
            };

            const maxTokens = int(p.openai_max_tokens);
            const provider = this.config.get()?.provider;

            // Provider-specific mapping
            if (provider === 'gemini' || provider === 'makersuite' || provider === 'vertexai') {
                return {
                    temperature: base.temperature,
                    top_p: base.top_p,
                    top_k: base.top_k,
                    maxTokens,
                };
            }

            if (provider === 'anthropic') {
                // our AnthropicProvider expects maxTokens (camelCase), but will pass other fields through
                return {
                    temperature: base.temperature,
                    top_p: base.top_p,
                    top_k: base.top_k,
                    maxTokens,
                };
            }

            // openai-like (openai/deepseek/custom)
            const options = {
                temperature: base.temperature,
                top_p: base.top_p,
                presence_penalty: base.presence_penalty,
                frequency_penalty: base.frequency_penalty,
                seed: base.seed,
                n: base.n,
            };
            if (typeof maxTokens === 'number') options.max_tokens = maxTokens;
            return options;
        } catch (err) {
            logger.debug('getGenerationOptions failed', err);
            return {};
        }
    }

    /**
     * 保存到聊天历史
     */
    async saveToHistory(userMessage, assistantMessage) {
        try {
            const messages = [
                {
                    role: 'user',
                    content: userMessage,
                    timestamp: Date.now()
                },
                {
                    role: 'assistant',
                    content: assistantMessage,
                    timestamp: Date.now()
                }
            ];

            await this.chatStorage.saveMessages(this.currentCharacterId, messages);
            logger.debug('聊天记录已保存');
        } catch (error) {
            logger.error('保存聊天记录失败:', error);
        }
    }

    /**
     * 获取聊天历史
     */
    async getChatHistory(characterId, limit = 50) {
        const messages = await this.chatStorage.getMessages(characterId || this.currentCharacterId, limit);
        return messages;
    }

    /**
     * 清除聊天历史
     */
    async clearChatHistory(characterId) {
        await this.chatStorage.clearMessages(characterId || this.currentCharacterId);
        logger.info('聊天记录已清除');
    }

    /**
     * 获取世界书数据
     */
    async getWorldInfo(characterId) {
        try {
            const id = characterId || this.currentCharacterId;
            if (this.worldStore.ready) {
                await this.worldStore.ready;
            }
            const local = this.worldStore.load(id);
            if (local) return local;

            // 後端佔位（若已實作）
            try {
                const res = await safeInvoke('get_world_info', { characterId: id });
                return res;
            } catch (err) {
                logger.debug('後端世界書命令不可用，使用空白', err);
            }
            return null;
        } catch (error) {
            logger.error('获取世界书失败:', error);
            return {};
        }
    }

    /**
     * 保存世界书数据
     */
    async saveWorldInfo(characterId, data) {
        try {
            const id = characterId || this.currentCharacterId;
            await this.worldStore.save(id, data);

            // 如果後端支持可同步保存（忽略失敗）
            safeInvoke('save_world_info', { characterId: id, data }).catch(() => {});

            logger.debug('世界书已保存', id);
        } catch (error) {
            logger.error('保存世界书失败:', error);
            throw error;
        }
    }

    async listWorlds() {
        if (this.worldStore.ready) {
            await this.worldStore.ready;
        }
        return this.worldStore.list();
    }

    setCurrentWorld(worldId, sessionId = this.activeSessionId) {
        this.currentWorldId = worldId;
        if (sessionId) {
            this.worldSessionMap[sessionId] = worldId;
            this.persistWorldSessionMap();
        }
        window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId } }));
    }

    setGlobalWorld(worldId) {
        this.globalWorldId = worldId || null;
        this.persistGlobalWorldId();
        window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: this.currentWorldId, globalWorldId: this.globalWorldId } }));
    }

    formatWorldPrompt(worldId, label) {
        if (!worldId) return '';
        const data = this.worldStore.load(worldId);
        if (!data || !Array.isArray(data.entries)) return '';
        const entries = [...data.entries].sort((a, b) => (b.priority || 0) - (a.priority || 0));
        const parts = entries.map(e => e.content).filter(Boolean);
        if (!parts.length) return '';
        return `${label}（${worldId}）：\n` + parts.join('\n\n');
    }

    /**
        * 生成當前世界書的提示串
        */
    getActiveWorldPrompt() {
        const globalPart = this.formatWorldPrompt(this.globalWorldId, '全局世界书提示');
        const sessionPart = this.formatWorldPrompt(this.currentWorldId, '世界书提示');
        if (globalPart && sessionPart) return `${globalPart}\n\n${sessionPart}`;
        return globalPart || sessionPart || '';
    }

    getWorldForSession(sessionId = this.activeSessionId) {
        return this.worldSessionMap[sessionId] || null;
    }
}

// 创建全局实例
window.appBridge = new AppBridge();

// 兼容层：提供类似 SillyTavern 的全局函数
window.triggerSlash = async (command) => {
    logger.info('执行命令:', command);
    // TODO: 解析并执行命令
    // 例如: /echo -> 显示消息, /gen -> 生成, /clear -> 清空
};

window.getWorldInfoSettings = async () => {
    return await window.appBridge.getWorldInfo();
};

window.saveWorldInfo = async (data) => {
    await window.appBridge.saveWorldInfo(window.appBridge.currentCharacterId, data);
};

// 兼容：從 ST world JSON 導入（期望前端讀取後調用）
window.importSTWorld = async (jsonObj, name = 'imported') => {
    const simplified = convertSTWorld(jsonObj, name);
    await window.appBridge.saveWorldInfo(name, simplified);
    return simplified;
};

// 初始化
window.appBridge.init().then(() => {
    logger.info('✅ App Bridge 初始化完成');
}).catch(error => {
    logger.error('❌ App Bridge 初始化失败:', error);
});

export { AppBridge };
