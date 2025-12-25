/**
 * UI 桥接层 - 连接原有 UI 代码和新的 API 层
 */

import { LLMClient } from '../api/client.js';
import { BUILTIN_PHONE_FORMAT_WORLDBOOK, BUILTIN_PHONE_FORMAT_WORLDBOOK_ID } from '../storage/builtin-worldbooks.js';
import { ChatStorage } from '../storage/chat.js';
import { ConfigManager } from '../storage/config.js';
import { PresetStore } from '../storage/preset-store.js';
import { RegexStore, regex_placement } from '../storage/regex-store.js';
import { WorldInfoStore, convertSTWorld } from '../storage/worldinfo.js';
import { logger } from '../utils/logger.js';
import { MacroEngine } from '../utils/macro-engine.js';
import { isRetryableError, retryWithBackoff } from '../utils/retry.js';
import { safeInvoke } from '../utils/tauri.js';

const canInitClient = cfg => {
  const c = cfg || {};
  const hasKey = typeof c.apiKey === 'string' && c.apiKey.trim().length > 0;
  const hasVertexSa =
    c.provider === 'vertexai' &&
    typeof c.vertexaiServiceAccount === 'string' &&
    c.vertexaiServiceAccount.trim().length > 0;
  return hasKey || hasVertexSa;
};

const truthy = v => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
};

const renderStTemplate = (template, vars) => {
  let out = String(template || '');
  const varsLower = (() => {
    try {
      const m = Object.create(null);
      for (const [k, v] of Object.entries(vars || {})) {
        if (!k) continue;
        m[String(k).toLowerCase()] = v;
      }
      return m;
    } catch {
      return Object.create(null);
    }
  })();
  // {{#if var}}...{{else}}...{{/if}} (SillyTavern preset format)
  const ifRe = /{{#if\s+([a-zA-Z0-9_]+)\s*}}([\s\S]*?)({{else}}([\s\S]*?))?{{\/if}}/g;
  // Loop to handle multiple blocks (no nesting expected in presets)
  for (let i = 0; i < 100; i++) {
    const next = out.replace(ifRe, (_m, key, ifTrue, _elseBlock, ifFalse) => {
      const v =
        vars && Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : varsLower[String(key).toLowerCase()];
      return truthy(v) ? ifTrue : ifFalse || '';
    });
    if (next === out) break;
    out = next;
  }
  // Replace variables {{var}} and {{trim}}
  out = out.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => {
    if (key === 'trim') return '';
    const hasDirect = vars && Object.prototype.hasOwnProperty.call(vars, key);
    const v = hasDirect ? vars[key] : varsLower[String(key).toLowerCase()];
    // Preserve unknown keys for MacroEngine (e.g. {{USER}}, {{lastUserMessage}}, {{getvar::...}})
    if (v === null || v === undefined) return `{{${key}}}`;
    return String(v);
  });
  // Cleanup any leftover trim token and trim surrounding whitespace
  out = out.replace(/{{\s*trim\s*}}/g, '');
  return out.trim();
};

const withSpeakerPrefix = (content, speaker) => {
  const text = String(content ?? '');
  const name = String(speaker || '').trim();
  if (!text.trim() || !name) return text;
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  // Avoid double prefix
  if (firstLine.startsWith(`${name}:`) || firstLine.startsWith(`${name}：`)) return text;
  return `${name}: ${text}`;
};

const normalizeHistoryLineBreaks = (content, role) => {
  if (role !== 'assistant') return content;
  const text = String(content ?? '');
  if (!text.includes('\n') && !text.includes('\r')) return text;
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br>');
};

const HISTORY_RECALL_NOTICE =
  '以下为聊天历史回顾（仅用于理解上下文）：请不要逐字复述或重复其中内容，只需基于上下文继续对话。';
const SUMMARY_REQUEST_NOTICE = [
  '每次输出结束后，**紧跟着**以一句话概括本次互动的摘要，确保<details><summary>摘要</summary>',
  '<内容>',
  '</details>标签顺序正确，摘要**纯中文输出**，不得夹杂其它语言',
  '[summary_format]',
  '摘要格式示例：',
  '',
  '<details><summary>摘要</summary>',
  '',
  '用一句话概括本条回复的内容，禁止不必要的总结和升华',
].join('\n');

const formatExactTime = (ts) => {
  const t = Number(ts || 0);
  if (!Number.isFinite(t) || t <= 0) return '';
  try {
    return new Date(t).toLocaleString();
  } catch {
    return '';
  }
};

const formatSince = (ts) => {
  const t = Number(ts || 0);
  if (!Number.isFinite(t) || t <= 0) return '';
  const delta = Math.max(0, Date.now() - t);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  return `${day}天前`;
};

const formatSinceInParens = (ts) => {
  const raw = formatSince(ts);
  if (!raw) return '';
  return `距今${raw.replace(/前$/, '')}`;
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
    this.abortController = null;
    this.abortReason = '';
    this.chatStore = null; // Injected
    this.macroEngine = null; // Initialized on setChatStore
    this.contactsStore = null; // Injected
    this.momentSummaryStore = null; // Injected
    this.hydrateWorldSessionMap();
    this.hydrateGlobalWorldId();
  }

  setChatStore(store) {
    this.chatStore = store;
    this.macroEngine = new MacroEngine(store);
  }

  setContactsStore(store) {
    this.contactsStore = store;
  }

  setMomentSummaryStore(store) {
    this.momentSummaryStore = store;
  }

  processTextMacros(text, extraContext = {}) {
    if (!this.macroEngine) return text || '';
    const ctx = {
      sessionId: this.activeSessionId,
      ...extraContext,
    };
    return this.macroEngine.process(text, ctx);
  }

  cancelCurrentGeneration(reason = 'user') {
    this.abortReason = String(reason || 'user');
    try {
      if (this.abortController && !this.abortController.signal.aborted) {
        this.abortController.abort();
      }
    } catch {}
  }

  async ensureBuiltinWorldbooks() {
    await this.worldStore.ready;
    try {
      const existing = this.worldStore.load(BUILTIN_PHONE_FORMAT_WORLDBOOK_ID);
      const incoming = BUILTIN_PHONE_FORMAT_WORLDBOOK;
      if (!existing || !Array.isArray(existing.entries)) {
        await this.worldStore.save(BUILTIN_PHONE_FORMAT_WORLDBOOK_ID, incoming);
        logger.info(`已写入内置世界书：${BUILTIN_PHONE_FORMAT_WORLDBOOK_ID}`);
        return;
      }
      const byComment = new Map();
      for (const e of existing.entries || []) {
        const key = String(e?.comment || e?.title || e?.id || '').trim();
        if (key) byComment.set(key, e);
      }
      let changed = false;
      const merged = [];
      const incomingKeys = new Set();
      for (const ie of incoming.entries || []) {
        const key = String(ie?.comment || ie?.title || ie?.id || '').trim();
        if (!key) continue;
        incomingKeys.add(key);
        const cur = byComment.get(key);
        if (!cur) {
          merged.push(ie);
          changed = true;
          continue;
        }
        const next = { ...cur, ...ie };
        if (JSON.stringify(next) !== JSON.stringify(cur)) changed = true;
        merged.push(next);
      }
      for (const e of existing.entries || []) {
        const key = String(e?.comment || e?.title || e?.id || '').trim();
        if (key && incomingKeys.has(key)) continue;
        merged.push(e);
      }
      if (changed) {
        await this.worldStore.save(BUILTIN_PHONE_FORMAT_WORLDBOOK_ID, { ...existing, entries: merged });
        logger.info(`已更新内置世界书：${BUILTIN_PHONE_FORMAT_WORLDBOOK_ID}`);
      }
    } catch (err) {
      logger.warn('内置世界书迁移失败（忽略）', err);
    }
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
        try {
          localStorage.setItem('global_world_id_v1', this.globalWorldId);
        } catch {}
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
    try {
      localStorage.setItem('global_world_id_v1', this.globalWorldId || '');
    } catch {}
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
      await this.ensureBuiltinWorldbooks();
      let config = await this.config.load();
      // 注意：不要在启动时强制用“预设绑定连接”覆盖用户最后一次使用的连接配置。
      // 预设绑定仅在用户切换预设时应用（由 preset-panel 调用 applyBoundConfigIfAny），否则会导致
      // “明明保存/选择了 Deepseek，重启又回到默认配置”的问题。

      // 初始化 LLM 客户端
      if (canInitClient(config)) {
        this.client = new LLMClient(config);
        logger.info(`LLM 客户端初始化成功 (provider: ${config.provider})`);
      } else {
        logger.warn('未配置 API 认证信息，请先配置');
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
    return Boolean(canInitClient(config));
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
    const activePresets = (() => {
      const active = presetState?.active || {};
      const enabled = presetState?.enabled || {};
      const out = {};
      for (const [type, id] of Object.entries(active)) {
        if (!id) continue;
        if (enabled && enabled[type] === false) continue;
        out[type] = id;
      }
      return out;
    })();
    const worldIds = [];
    if (this.globalWorldId) worldIds.push(String(this.globalWorldId));
    if (this.currentWorldId) worldIds.push(String(this.currentWorldId));
    return {
      sessionId: this.activeSessionId,
      worldId: this.currentWorldId,
      worldIds,
      activePresets,
    };
  }

  async syncPresetRegexBindings() {
    try {
      await this.presets?.ready;
      await this.regex?.ready;
      const presetState = this.presets?.getState?.() || {};
      const active = (() => {
        const activePresets = presetState?.active || {};
        const enabled = presetState?.enabled || {};
        const out = {};
        for (const [type, id] of Object.entries(activePresets)) {
          if (!id) continue;
          if (enabled && enabled[type] === false) continue;
          out[type] = id;
        }
        return out;
      })();
      const changed = await this.regex.syncPresetBindings?.(active);
      if (changed) {
        window.dispatchEvent(new CustomEvent('regex-changed'));
      }
      return Boolean(changed);
    } catch {
      return false;
    }
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
    this.abortController = new AbortController();
    this.abortReason = '';
    let streaming = false;

    try {
      const originalInput = userMessage;
      // ST semantics:
      // - direct scripts (non-ephemeral) may alter stored chat content
      // - promptOnly scripts apply to outgoing prompt only
      const ctx = this.getRegexContext();
      const skipInputRegex = context?.meta?.skipInputRegex === true;
      const directInput = skipInputRegex
        ? userMessage
        : this.regex.apply(userMessage, ctx, regex_placement.USER_INPUT, {
            isMarkdown: false,
            isPrompt: false,
            isEdit: false,
            depth: 0,
          });
      const promptInput = skipInputRegex
        ? userMessage
        : this.regex.apply(userMessage, ctx, regex_placement.USER_INPUT, {
            // Product requirement: as long as enabled, input regex should apply to outgoing prompt.
            // So, include markdownOnly scripts too when building outgoing prompt.
            isMarkdown: true,
            isPrompt: true,
            isEdit: false,
            depth: 0,
          });
      const nextContext = {
        ...(context || {}),
        meta: {
          ...(context?.meta || {}),
          rawUserMessage: originalInput,
          userMessageProcessed: true,
        },
      };
      const messages = this.buildMessages(promptInput, nextContext);
      const config = this.config.get();
      const genOptions = this.getGenerationOptions();
      const requestOptions = { ...(genOptions || {}), signal: this.abortController.signal };

      logger.debug('发送消息到 LLM:', { messageCount: messages.length, stream: config.stream });
      // Debug: keep the exact request payload used for the latest generation
      this.lastRequest = {
        at: Date.now(),
        provider: config?.provider,
        baseUrl: config?.baseUrl,
        model: config?.model,
        stream: Boolean(config?.stream),
        options: genOptions,
        messages,
      };

      if (config.stream) {
        streaming = true;
        const inner = this.generateStream(messages, requestOptions, originalInput);
        const self = this;
        return (async function* () {
          try {
            yield* inner;
          } finally {
            self.isGenerating = false;
            self.abortController = null;
            self.abortReason = '';
          }
        })();
      } else {
        const response = await retryWithBackoff(() => this.client.chat(messages, requestOptions), {
          maxRetries: config.maxRetries || 3,
          shouldRetry: err => !this.abortController?.signal?.aborted && isRetryableError(err),
        });

        // 保存到历史记录
        await this.saveToHistory(originalInput, response);
        return response;
      }
    } catch (error) {
      logger.error('生成失败:', error);
      throw error;
    } finally {
      if (!streaming) {
        this.isGenerating = false;
        this.abortController = null;
        this.abortReason = '';
      }
    }
  }

  /**
   * Background one-shot chat (does not block main generation / no isGenerating lock).
   * Intended for maintenance tasks like summary compaction.
   */
  async backgroundChat(messages, options = {}) {
    if (!this.initialized) {
      await this.init();
    }
    if (!this.isConfigured()) {
      throw new Error('请先配置 API 信息');
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('當前離線，請連接網絡後再試');
    }
    const msgs = Array.isArray(messages) ? messages : [];
    if (!msgs.length) throw new Error('messages 不能为空');

    // Use the same generation options mapping as normal chat, but allow caller overrides.
    const genOptions = { ...this.getGenerationOptions(), ...(options || {}) };
    return this.client.chat(msgs, genOptions);
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
      // User-initiated cancellation (e.g. message retract) should not be converted into a timeout error.
      if (this.abortController?.signal?.aborted && this.abortReason) {
        const e = new Error('cancelled');
        e.name = 'AbortError';
        e.cancelled = true;
        e.reason = this.abortReason;
        throw e;
      }
      const normalized = (() => {
        try {
          // Android WebView may throw DOMException on abort/timeout
          const name = String(error?.name || '');
          const msg = String(error?.message || '');
          if (name === 'AbortError' || (error instanceof DOMException && name === 'AbortError')) {
            const ms = Number(this.config?.get?.()?.timeout);
            const sec = Number.isFinite(ms) ? Math.round(ms / 1000) : 60;
            const e = new Error(`请求超时（${sec}秒），请稍后重试或在 API 设定中调低输出/切换网络`);
            e.cause = error;
            return e;
          }
          if (error instanceof DOMException) {
            const e = new Error(`${name || 'DOMException'}${msg ? `: ${msg}` : ''}`);
            e.cause = error;
            return e;
          }
        } catch {}
        return error;
      })();
      logger.error('流式生成失败:', normalized?.name, normalized?.message, normalized);
      throw normalized;
    }
  }

  /**
   * 构建消息数组
   */
	  buildMessages(userMessage, context = {}) {
	    const messages = [];

    const name1 = context?.user?.name || 'user';
    const name2 = context?.character?.name || 'assistant';
    const sessionIdForSummary = String(context?.session?.id || this.activeSessionId || 'default');
    const rawUserMessage = (typeof context?.meta?.rawUserMessage === 'string')
      ? String(context.meta.rawUserMessage)
      : String(userMessage ?? '');
    const pendingUserTextRaw = String(rawUserMessage ?? '').trim();
    const appendUserToHistory = context?.meta?.appendUserToHistory !== false;
    const isMomentCommentTask = String(context?.task?.type || '').toLowerCase() === 'moment_comment';
    const isGroupChat = Boolean(context?.session?.isGroup) || String(context?.session?.id || '').startsWith('group:');
    const disableScenarioHint = Boolean(context?.meta?.disableScenarioHint);
    const overrideLastUserMessageRaw = (typeof context?.meta?.overrideLastUserMessage === 'string')
      ? String(context.meta.overrideLastUserMessage)
      : '';
    const scenarioHint = (() => {
      if (isMomentCommentTask) {
        const isReply = Boolean(context?.task?.replyToAuthor) || Boolean(context?.task?.replyToCommentId) || Boolean(context?.task?.isReplyToComment);
        return isReply ? '在动态评论回复，注意动态评论格式' : '在动态评论，注意动态评论格式';
      }
      if (isGroupChat) return '在群聊，注意群聊格式';
      return '在私聊，注意私聊格式';
    })();
    const pendingUserText = pendingUserTextRaw && !disableScenarioHint
      ? `${pendingUserTextRaw}（${scenarioHint}）`
      : pendingUserTextRaw;
    const lastUserMessageRe = /{{\s*(?:lastUserMessage|userLastMessage|user_last_message)\s*}}/i;
    const hasLastUserMessagePlaceholder = (raw) => lastUserMessageRe.test(String(raw || ''));
    let usedLastUserMessageForPendingInput = false;
    const pendingUserPrompt = (() => {
      if (!pendingUserTextRaw) return '';
      const baseText = disableScenarioHint ? String(rawUserMessage ?? '') : pendingUserText;
      if (context?.meta?.skipInputRegex === true) return String(baseText ?? '');
      return this.regex.apply(baseText, this.getRegexContext(), regex_placement.USER_INPUT, {
        isMarkdown: true,
        isPrompt: true,
        isEdit: false,
        depth: 0,
      });
    })();
    const effectiveLastUserMessage = overrideLastUserMessageRaw.trim()
      ? overrideLastUserMessageRaw.trim()
      : pendingUserPrompt;
    const processTextMacrosWithPendingFlag = (rawText, extraContext) => {
      const raw = String(rawText ?? '');
      return raw ? this.processTextMacros(raw, { ...(extraContext || {}), lastUserMessage: effectiveLastUserMessage }) : '';
    };
    const trimEdgeBlankLines = (text) =>
      String(text ?? '').replace(/^(?:[ \t]*\r?\n)+/, '').replace(/(?:\r?\n[ \t]*)+$/, '');
    const joinPromptBlocks = (blocks = []) => {
      const parts = Array.isArray(blocks) ? blocks : [blocks];
      const cleaned = parts.map(trimEdgeBlankLines).filter(s => String(s || '').trim().length > 0);
      return cleaned.join('\n\n');
    };
    // SillyTavern-like persona settings (subset)
    const personaRaw = String(context?.user?.persona || '');
    const personaPosition = Number.isFinite(Number(context?.user?.personaPosition))
      ? Number(context.user.personaPosition)
      : 0; // IN_PROMPT
    const personaDepth = Number.isFinite(Number(context?.user?.personaDepth))
      ? Math.max(0, Math.trunc(Number(context.user.personaDepth)))
      : 2;
    const personaRole = Number.isFinite(Number(context?.user?.personaRole))
      ? Math.max(0, Math.min(2, Math.trunc(Number(context.user.personaRole))))
      : 0; // 0=system
    const personaText = personaRaw ? processTextMacrosWithPendingFlag(personaRaw, { user: name1, char: name2 }) : '';
    const historyForMatch = Array.isArray(context.history) ? context.history : [];
    const matchText = [String(userMessage ?? ''), ...historyForMatch.map(m => String(m?.content ?? ''))].join('\n');
    const groupName = String(context?.group?.name || '').trim();
    const groupMemberIds = Array.isArray(context?.group?.members) ? context.group.members.map(String) : [];
    const groupMemberNames = Array.isArray(context?.group?.memberNames) ? context.group.memberNames.map(String) : [];
    const membersText = groupMemberNames.filter(Boolean).join(',');

    const getSessionSummaryItems = (sid, { limitPlain = 30, limitPlainGroup = 10, limitWithCompacted = 2, limitWithCompactedGroup = 3 } = {}) => {
      const id = String(sid || '').trim();
      if (!id || !this.chatStore?.getSummaries) return { compacted: null, summaries: [] };
      const compacted = this.chatStore?.getCompactedSummary?.(id) || null;
      const list = this.chatStore.getSummaries(id) || [];
      const arrRaw = Array.isArray(list) ? list : [];

      if (isGroupChat) {
        if (compacted && String(compacted.text || '').trim()) {
          return { compacted, summaries: arrRaw.slice(-Math.max(0, limitWithCompactedGroup)) };
        }
        return { compacted: null, summaries: arrRaw.slice(-Math.max(0, limitPlainGroup)) };
      }

      // Non-group chats keep existing behavior unless caller wants different limits.
      if (compacted && String(compacted.text || '').trim()) {
        return { compacted, summaries: arrRaw.slice(-Math.max(0, limitWithCompacted)) };
      }
      return { compacted: null, summaries: arrRaw.slice(-Math.max(0, limitPlain)) };
    };

    const buildPrivateChatMemberGroupSummaryBlock = () => {
      if (isGroupChat) return null;
      if (isMomentCommentTask) return null;
      const memberId = String(sessionIdForSummary || '').trim();
      if (!memberId) return null;
      if (!this.chatStore?.getSummaries) return null;
      const groups = (() => {
        try {
          const list = this.contactsStore?.listGroups?.() || [];
          return Array.isArray(list)
            ? list.filter(g => Array.isArray(g?.members) && g.members.map(String).includes(memberId))
            : [];
        } catch {
          return [];
        }
      })();
      if (!groups.length) return null;

      const sections = [];
      for (const g of groups) {
        const gid = String(g?.id || '').trim();
        if (!gid) continue;
        const gname = String(g?.name || '').trim() || gid.replace(/^group:/, '') || gid;

        const compacted = this.chatStore?.getCompactedSummary?.(gid) || null;
        const list = this.chatStore.getSummaries(gid) || [];
        const arrRaw = Array.isArray(list) ? list : [];
        const arr = (compacted && String(compacted.text || '').trim()) ? arrRaw.slice(-2) : arrRaw.slice(-5);
        const items = [];
        if (compacted && String(compacted.text || '').trim()) {
          items.push(`- 大总结：${String(compacted.text).trim()}`);
        }
        for (let j = 0; j < arr.length; j++) {
          const it = arr[j];
          const text = String((typeof it === 'string') ? it : it?.text || '').trim();
          if (!text) continue;
          const at = (typeof it === 'object' && it && it.at) ? Number(it.at) : 0;
          const isNewest = j === arr.length - 1;
          const when = (isNewest && at) ? formatSinceInParens(at) : '';
          items.push(`- ${text}${when ? `（${when}）` : ''}`);
        }
        if (items.length) {
          sections.push([`群聊：${gname}`, ...items].join('\n'));
        }
      }
      if (!sections.length) return null;
      return {
        role: 'system',
        content: [
          '角色所在群聊摘要回顾（仅供理解上下文）：',
          ...sections,
        ].join('\n\n'),
      };
    };
    const disablePhoneFormat = Boolean(context?.meta?.disablePhoneFormat);
    const worldPromptRaw = isMomentCommentTask
      ? ''
      : (() => {
          const builtinPart = disablePhoneFormat
            ? ''
            : this.formatWorldPrompt(BUILTIN_PHONE_FORMAT_WORLDBOOK_ID, { matchText });
          const globalPart =
            this.globalWorldId && String(this.globalWorldId) !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID
              ? this.formatWorldPrompt(this.globalWorldId, { matchText })
              : '';
          if (!isGroupChat) {
            const sessionPart = this.currentWorldId ? this.formatWorldPrompt(this.currentWorldId, { matchText }) : '';
            return [builtinPart, globalPart, sessionPart].filter(Boolean).join('\n\n');
          }
          const parts = [];
          for (const memberSessionId of groupMemberIds) {
            const wid = this.worldSessionMap[String(memberSessionId) || ''] || null;
            if (!wid) continue;
            const p = this.formatWorldPrompt(wid, { matchText });
            if (p) parts.push(p);
          }
          const mergedMembers = parts.join('\n\n');
          return [builtinPart, globalPart, mergedMembers].filter(Boolean).join('\n\n');
        })();
    // Apply MacroEngine to worldbook text too (worldbook entries may include {{user}}/{{char}} etc.)
    const worldPrompt = worldPromptRaw
      ? processTextMacrosWithPendingFlag(worldPromptRaw, {
          user: name1,
          char: name2,
          group: groupName || name2,
          members: membersText,
        })
      : '';

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
    const dialogueRulesRaw = typeof syspActive?.dialogue_rules === 'string' ? syspActive.dialogue_rules : '';
    const dialogueRules = processTextMacrosWithPendingFlag(dialogueRulesRaw, { user: name1, char: name2 });
    const dialoguePosition = Number.isFinite(Number(syspActive?.dialogue_position))
      ? Number(syspActive.dialogue_position)
      : 0;
    const dialogueDepth = Number.isFinite(Number(syspActive?.dialogue_depth))
      ? Math.max(0, Math.trunc(Number(syspActive.dialogue_depth)))
      : 1;
    const dialogueRole = Number.isFinite(Number(syspActive?.dialogue_role))
      ? Math.trunc(Number(syspActive.dialogue_role))
      : 0;

    // 动态发布决策提示词（用于私聊/群聊场景）
    const momentCreateEnabled = Boolean(syspActive?.moment_create_enabled);
    const momentCreateRulesRaw =
      typeof syspActive?.moment_create_rules === 'string' ? syspActive.moment_create_rules : '';
    const momentCreateRules = processTextMacrosWithPendingFlag(momentCreateRulesRaw, { user: name1, char: name2 });
    const momentCreatePosition = Number.isFinite(Number(syspActive?.moment_create_position))
      ? Number(syspActive.moment_create_position)
      : 0;
    const momentCreateDepth = Number.isFinite(Number(syspActive?.moment_create_depth))
      ? Math.max(0, Math.trunc(Number(syspActive.moment_create_depth)))
      : 1;
    const momentCreateRole = Number.isFinite(Number(syspActive?.moment_create_role))
      ? Math.trunc(Number(syspActive.moment_create_role))
      : 0;

    // 动态评论回复提示词（仅用于“动态评论”场景）
    const momentCommentEnabled = Boolean(syspActive?.moment_comment_enabled);
    const momentCommentRulesRaw =
      typeof syspActive?.moment_comment_rules === 'string' ? syspActive.moment_comment_rules : '';
    const momentCommentRules = processTextMacrosWithPendingFlag(momentCommentRulesRaw, { user: name1, char: name2 });
    const momentCommentPosition = Number.isFinite(Number(syspActive?.moment_comment_position))
      ? Number(syspActive.moment_comment_position)
      : 0;
    const momentCommentDepth = Number.isFinite(Number(syspActive?.moment_comment_depth))
      ? Math.max(0, Math.trunc(Number(syspActive.moment_comment_depth)))
      : 0;
    const momentCommentRole = Number.isFinite(Number(syspActive?.moment_comment_role))
      ? Math.trunc(Number(syspActive.moment_comment_role))
      : 0;

    // 群聊模式：群聊协议提示词（保存于 sysprompt 预设）
    const groupEnabled = Boolean(syspActive?.group_enabled);
    const groupRulesRaw = typeof syspActive?.group_rules === 'string' ? syspActive.group_rules : '';
    const groupRules = processTextMacrosWithPendingFlag(groupRulesRaw, {
      user: name1,
      char: name2,
      group: groupName || name2,
      members: membersText,
    });
    const groupPosition = Number.isFinite(Number(syspActive?.group_position)) ? Number(syspActive.group_position) : 0;
    const groupDepth = Number.isFinite(Number(syspActive?.group_depth))
      ? Math.max(0, Math.trunc(Number(syspActive.group_depth)))
      : 1;
    const groupRole = Number.isFinite(Number(syspActive?.group_role)) ? Math.trunc(Number(syspActive.group_role)) : 0;

    // Formatting helpers from OpenAI preset (optional)
    const wiFormatRaw =
      typeof openp?.wi_format === 'string' && openp.wi_format.includes('{0}') ? openp.wi_format : '{0}';
	    const wiFormat =
	      processTextMacrosWithPendingFlag(wiFormatRaw, {
	        user: name1,
	        char: name2,
	        group: groupName || name2,
	        members: membersText,
	      }) || '{0}';
    const scenarioFormat = typeof openp?.scenario_format === 'string' ? openp.scenario_format : '{{scenario}}';
    const personalityFormat =
      typeof openp?.personality_format === 'string' ? openp.personality_format : '{{personality}}';

	    // When OpenAI preset has prompt_order: use ST-like block ordering (drag & drop in UI)
	    // ST PromptManager global dummyId=100001; keep 100000 as fallback.
	    const pickOpenAIOrderBlock = () => {
	      const arr = Array.isArray(openp?.prompt_order) ? openp.prompt_order : [];
	      const byId = (id) => arr.find(b => b && typeof b === 'object' && String(b.character_id) === String(id));
	      return byId(100001) || byId(100000) || arr[0] || null;
	    };
	    const openaiOrderBlock = pickOpenAIOrderBlock();
	    const openaiOrder = Array.isArray(openaiOrderBlock?.order) ? openaiOrderBlock.order : null;

	    // 摘要提示词：移入“聊天提示词”区块管理，并固定在系统深度=1（历史前）的位置
	    const summaryPosition = (() => {
	      if (!useSysprompt) return 3;
	      if (!syspActive || typeof syspActive !== 'object') return 3;
	      const n = Number(syspActive.summary_position);
	      return Number.isFinite(n) ? n : 3;
	    })();
	    const summaryEnabled = (() => {
	      if (summaryPosition === -1) return false;
	      if (!useSysprompt) return true;
	      if (!syspActive || typeof syspActive !== 'object') return true;
	      return syspActive.summary_enabled !== false;
	    })();
	    const summaryRulesRaw = (() => {
	      if (!useSysprompt) return SUMMARY_REQUEST_NOTICE;
	      if (!syspActive || typeof syspActive !== 'object') return SUMMARY_REQUEST_NOTICE;
	      const raw = typeof syspActive.summary_rules === 'string' ? syspActive.summary_rules : '';
	      return raw.trim() ? raw : SUMMARY_REQUEST_NOTICE;
	    })();
	    const summaryRules = summaryEnabled
	      ? processTextMacrosWithPendingFlag(summaryRulesRaw, {
	          user: name1,
	          char: name2,
	          group: groupName || name2,
	          members: membersText,
	        })
	      : '';

	    // 聊天提示词（私聊/群聊/动态/摘要）：统一作为 system 区块插入在 chat history 之后
	    // - 不混入历史数组（不会落入 <history>）
	    // - 用 <chat_guide> 包裹，便于模型区分“聊天指南”与历史回顾
	    // - 保证摘要提示词在所有聊天提示词下方
	    const buildChatGuideContent = () => {
	      const mode = String(context?.meta?.chatGuideMode || '').trim().toLowerCase();
	      if (Boolean(context?.meta?.disableChatGuide) || mode === 'none') return '';
	      const summaryOnly = mode === 'summary-only';
	      const parts = [];
	      if (!summaryOnly && !isMomentCommentTask && !isGroupChat && dialogueEnabled && dialogueRules && dialoguePosition !== -1) {
	        parts.push(dialogueRules);
	      }
	      if (!summaryOnly && !isMomentCommentTask && isGroupChat && groupEnabled && groupRules && groupPosition !== -1) {
	        parts.push(groupRules);
	      }
	      if (!summaryOnly && !isMomentCommentTask && momentCreateEnabled && momentCreateRules && momentCreatePosition !== -1) {
	        parts.push(momentCreateRules);
	      }
	      if (!summaryOnly && isMomentCommentTask && momentCommentEnabled && momentCommentRules && momentCommentPosition !== -1) {
	        parts.push(momentCommentRules);
	      }
	      if (summaryRules) parts.push(summaryRules);
	      const content = joinPromptBlocks(parts);
	      if (!content) return '';
	      return `<chat_guide>\n${content}\n</chat_guide>`;
	    };

	    const buildMomentCommentDataBlock = () => {
	      if (!isMomentCommentTask) return null;
	      const raw = String(context?.task?.promptData || '').trim();
	      if (!raw) return null;
	      const content = processTextMacrosWithPendingFlag(raw, {
	        user: name1,
	        char: name2,
	        group: groupName || name2,
	        members: membersText,
	      });
	      const rendered = String(content || '').trim();
	      if (!rendered) return null;
	      return { role: 'system', content: rendered };
	    };

	    const buildMomentSummaryBlock = () => {
	      if (Boolean(context?.meta?.disableMomentSummary)) return null;
	      if (!this.momentSummaryStore?.getSummaries) return null;
	      const list = this.momentSummaryStore.getSummaries() || [];
	      const arr = Array.isArray(list) ? list : [];
	      if (!arr.length) return null;
	      const latest = arr.slice(-3);
	      const rows = [];
	      try {
	        const compacted = this.momentSummaryStore.getCompactedSummary?.();
	        const compactedText = String(compacted?.text || '').trim();
	        if (compactedText) rows.push(`- 大总结：${compactedText}`);
	      } catch {}
	      latest.forEach((it, idx) => {
	        const text = String((typeof it === 'string') ? it : it?.text || '').trim();
	        if (!text) return;
	        const at = (typeof it === 'object' && it && it.at) ? Number(it.at) : 0;
	        const isNewest = idx === latest.length - 1;
	        const when = (isNewest && at) ? formatSinceInParens(at) : '';
	        rows.push(`- ${text}${when ? `（${when}）` : ''}`);
	      });
	      if (!rows.length) return null;
	      return {
	        role: 'system',
	        content: `以下为动态摘要回顾（仅供理解上下文）：\n${rows.join('\n')}`.trim(),
	      };
	    };

	    const buildGroupMemberPrivateSummaryBlock = () => {
	      if (!isGroupChat) return null;
	      const memberIds = groupMemberIds.slice();
	      if (!memberIds.length || !this.chatStore?.getSummaries) return null;
	      const sections = [];
	      for (let i = 0; i < memberIds.length; i++) {
	        const mid = String(memberIds[i] || '').trim();
	        if (!mid) continue;
	        const display = String(groupMemberNames[i] || '') || this.contactsStore?.getContact?.(mid)?.name || mid;
	        const compacted = this.chatStore?.getCompactedSummary?.(mid) || null;
	        const list = this.chatStore.getSummaries(mid) || [];
	        const arrRaw = Array.isArray(list) ? list : [];
	        // A) Group injection rule:
	        // 1) no compacted summary -> latest 3
	        // 2) has compacted summary -> compacted + latest 2
	        const arr = compacted ? arrRaw.slice(-2) : arrRaw.slice(-3);
	        const items = [];
	        if (compacted && String(compacted.text || '').trim()) {
	          items.push(`- 总结：${String(compacted.text).trim()}`);
	        }
	        for (let j = 0; j < arr.length; j++) {
	          const it = arr[j];
	          const text = String((typeof it === 'string') ? it : it?.text || '').trim();
	          if (!text) continue;
	          const at = (typeof it === 'object' && it && it.at) ? Number(it.at) : 0;
	          const isNewest = j === arr.length - 1;
	          const when = (isNewest && at) ? formatSinceInParens(at) : '';
	          items.push(`- ${text}${when ? `（${when}）` : ''}`);
	        }
	        if (items.length) {
	          sections.push(`${name1}与${display}:\n${items.join('\n')}`);
	        }
	      }
	      if (!sections.length) return null;
	      return {
	        role: 'system',
	        content: [
	          '群聊成员私聊摘要回顾（YAML，仅供理解上下文）：',
	          '（私聊信息默认不对其他成员公开）',
	          ...sections,
	        ].join('\n'),
	      };
	    };

	    const buildPrivateSummaryBlockForTarget = (targetSessionId, displayName) => {
	      const sid = String(targetSessionId || '').trim();
	      if (!sid || !this.chatStore?.getSummaries) return null;
	      const name = String(displayName || '').trim() || sid;
	      const compacted = this.chatStore?.getCompactedSummary?.(sid) || null;
	      const list = this.chatStore.getSummaries(sid) || [];
	      const arrRaw = Array.isArray(list) ? list : [];
	      const arr = compacted ? arrRaw.slice(-2) : arrRaw.slice(-3);
	      const items = [];
	      if (compacted && String(compacted.text || '').trim()) {
	        items.push(`- 总结：${String(compacted.text).trim()}`);
	      }
	      for (let j = 0; j < arr.length; j++) {
	        const it = arr[j];
	        const text = String((typeof it === 'string') ? it : it?.text || '').trim();
	        if (!text) continue;
	        const at = (typeof it === 'object' && it && it.at) ? Number(it.at) : 0;
	        const isNewest = j === arr.length - 1;
	        const when = (isNewest && at) ? formatSinceInParens(at) : '';
	        items.push(`- ${text}${when ? `（${when}）` : ''}`);
	      }
	      if (!items.length) return null;
	      return {
	        role: 'system',
	        content: [
	          `私聊摘要回顾（YAML，仅供理解上下文）：`,
	          '（私聊信息默认不对第三方公开）',
	          `${name1}与${name}:`,
	          ...items,
	        ].join('\n'),
	      };
	    };

		    if (useOpenAIPreset && openp && openaiOrder && openaiOrder.length) {
      const historyRaw = Array.isArray(context.history) ? context.history.slice() : [];
      // ST promptOnly scripts: apply to outgoing prompt only
      const history = historyRaw.map((m, idx) => {
        const role = m?.role === 'user' ? 'user' : 'assistant';
        const content = String(m?.content ?? '');
        const depth = historyRaw.length - 1 - idx; // 0 = last message
        const placement = role === 'user' ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT;
        const out = this.regex.apply(content, this.getRegexContext(), placement, {
          isMarkdown: false,
          isPrompt: true,
          isEdit: false,
          depth,
        });
        const speaker = role === 'assistant' && isGroupChat
          ? (String(m?.name || '').trim() || name2)
          : (role === 'user' ? name1 : name2);
        const normalized = normalizeHistoryLineBreaks(out, role);
        return { role, content: withSpeakerPrefix(normalized, speaker) };
      });

      const pendingUserHistoryEntry = pendingUserPrompt
        ? { role: 'user', content: pendingUserPrompt }
        : null;
      let pendingUserInsertIndex = -1;
      const insertPendingUserIntoHistory = () => {
        if (!appendUserToHistory || usedLastUserMessageForPendingInput || !pendingUserHistoryEntry) return;
        if (pendingUserInsertIndex >= 0) return;
        pendingUserInsertIndex = messages.length;
        messages.push(pendingUserHistoryEntry);
      };
      const removePendingUserFromHistory = () => {
        if (pendingUserInsertIndex < 0) return;
        messages.splice(pendingUserInsertIndex, 1);
        pendingUserInsertIndex = -1;
      };

      // 聊天提示词：统一打包为 <chat_guide>，与世界书放在同一位置（worldInfo marker）。
      // 不再按 position/depth 混入历史或 prompt 开头。

      // Persona Description (SillyTavern-like): AT_DEPTH=4 injects into chat history
      if (personaText && personaPosition === 4) {
        const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' };
        const role = roleMap[personaRole] || 'system';
        const idx = Math.max(0, history.length - personaDepth);
        history.splice(idx, 0, { role, content: personaText });
      }
      const prompts = Array.isArray(openp.prompts) ? openp.prompts : [];
      const byId = new Map();
      prompts.forEach(p => {
        if (p?.identifier) byId.set(p.identifier, p);
      });

      const macroVars = {
        user: name1,
        char: name2,
        scenario: context?.character?.scenario || '',
        personality: context?.character?.personality || '',
      };
      const macroContext = {
        user: name1,
        char: name2,
        group: groupName || name2,
        members: membersText,
        scenario: macroVars.scenario,
        personality: macroVars.personality,
      };
      const formatScenario = processTextMacrosWithPendingFlag(scenarioFormat, macroContext);
      const formatPersonality = processTextMacrosWithPendingFlag(personalityFormat, macroContext);
      // WORLD_INFO placement for prompt stage (supports promptOnly scripts)
      const chatGuideContent = buildChatGuideContent();
      let worldForPrompt = joinPromptBlocks([worldPrompt, chatGuideContent]);
      if (worldForPrompt) {
        worldForPrompt = this.regex.apply(worldForPrompt, this.getRegexContext(), regex_placement.WORLD_INFO, {
          isMarkdown: false,
          isPrompt: true,
          isEdit: false,
          depth: 0,
        });
      }
      const formatWorld = worldForPrompt ? wiFormat.replace('{0}', worldForPrompt) : '';
      let worldInserted = false;

      const resolveMarker = identifier => {
        switch (identifier) {
          case 'worldInfoBefore':
          case 'worldInfoAfter':
            if (!formatWorld || worldInserted) return '';
            worldInserted = true;
            return formatWorld;
          case 'charDescription':
            return processTextMacrosWithPendingFlag(context?.character?.description || '', macroContext);
          case 'charPersonality':
            return formatPersonality || '';
          case 'scenario':
            return formatScenario || '';
          case 'personaDescription':
            return personaPosition === 0 ? personaText : '';
          // dialogueExamples/chatHistory are markers without content here
          default:
            return '';
        }
      };

      let historyInserted = false;
      const sessionSummary = (() => {
        try {
          // Group chat requirement: last 10 OR (compacted + last 3).
          // Non-group: keep previous behavior (last 30).
          return getSessionSummaryItems(sessionIdForSummary, {
            limitPlain: 30,
            limitPlainGroup: 10,
            limitWithCompacted: 30, // unused for non-group
            limitWithCompactedGroup: 3,
          });
        } catch {
          return { compacted: null, summaries: [] };
        }
      })();
	      const historyRecallBlocks = (() => {
	        const blocks = [{ role: 'system', content: HISTORY_RECALL_NOTICE }];
	        const momentData = buildMomentCommentDataBlock();
	        if (momentData) blocks.push(momentData);
	        const momentSummary = buildMomentSummaryBlock();
	        if (momentSummary) blocks.push(momentSummary);
	        try {
	          const compactedText = String(sessionSummary?.compacted?.text || '').trim();
	          const summaries = Array.isArray(sessionSummary?.summaries) ? sessionSummary.summaries : [];
	          if (isGroupChat) {
	            const rows = [];
	            if (compactedText) rows.push(`- 大总结：${compactedText}`);
	            rows.push(
	              ...summaries
	                .map(s => String(typeof s === 'string' ? s : s?.text || '').trim())
	                .filter(Boolean)
	                .map(t => `- ${t}`),
	            );
	            if (rows.length) {
	              blocks.push({
	                role: 'system',
	                content: `以下为该群聊的摘要回顾：\n${rows.join('\n')}`.trim(),
	              });
	            }
	          } else {
	            if (summaries.length) {
	              blocks.push({
	                role: 'system',
	                content: `以下为该聊天室的简要摘要回顾：\n${summaries
	                  .map(s => `- ${String(typeof s === 'string' ? s : s?.text || '').trim()}`)
	                  .filter(Boolean)
	                  .join('\n')}`.trim(),
	              });
	            }
	          }
	        } catch {}

          try {
            const groupSummary = buildPrivateChatMemberGroupSummaryBlock();
            if (groupSummary) blocks.push(groupSummary);
          } catch {}
	        const priv = buildGroupMemberPrivateSummaryBlock();
	        if (priv) blocks.push(priv);
	        if (isMomentCommentTask) {
	          const targetId = String(context?.task?.targetSessionId || '').trim();
	          const targetName = String(context?.task?.targetName || '').trim();
	          const t = buildPrivateSummaryBlockForTarget(targetId, targetName);
	          if (t) blocks.push(t);
	        }
	        return blocks;
	      })();

      for (const item of openaiOrder) {
        const identifier = item?.identifier;
        const enabled = item?.enabled !== false;
        if (!identifier || !enabled) continue;

		        if (identifier === 'chatHistory') {
		          messages.push(...historyRecallBlocks);
		          if (history.length) messages.push(...history);
              insertPendingUserIntoHistory();
		          historyInserted = true;
		          continue;
		        }

        const pr = byId.get(identifier);
        const isMarker =
          Boolean(pr?.marker) ||
          [
            'chatHistory',
            'dialogueExamples',
            'worldInfoBefore',
            'worldInfoAfter',
            'charDescription',
            'charPersonality',
            'scenario',
            'personaDescription',
          ].includes(identifier);

        if (isMarker) {
          const content = resolveMarker(identifier);
          if (content) {
            messages.push({ role: 'system', content });
          }
          continue;
        }

        // Custom/editable prompt block
        let content = typeof pr?.content === 'string' ? pr.content : '';
        // Special case: main prompt fallback
        if (identifier === 'main' && !content) {
          if (useSysprompt && sysp?.content) content = sysp.content;
          else if (context.systemPrompt) content = context.systemPrompt;
        }
        const rawHadLastUser = lastUserMessageRe.test(String(content || ''));
        content = processTextMacrosWithPendingFlag(content, macroContext);
        if (!content) continue;

        const role = String(pr?.role || 'system').toLowerCase();
        const mappedRole = role === 'user' || role === 'assistant' || role === 'system' ? role : 'system';
        if (!usedLastUserMessageForPendingInput && rawHadLastUser) {
          usedLastUserMessageForPendingInput = true;
          removePendingUserFromHistory();
        }
        messages.push({ role: mappedRole, content });
      }

	      if (!historyInserted) {
	        messages.push(...historyRecallBlocks);
	        if (history.length) messages.push(...history);
          insertPendingUserIntoHistory();
	      }

	      // 摘要提示词包含在 <chat_guide> 内，与世界书一起注入。

      // Append current user message (unless already injected via {{lastUserMessage}} in prompt blocks)
      const pendingUserInserted = pendingUserInsertIndex >= 0;
      if (!usedLastUserMessageForPendingInput && !pendingUserInserted && pendingUserPrompt) {
        messages.push({ role: 'user', content: pendingUserPrompt });
      }
      return messages;
    }

    const chatGuideContent = buildChatGuideContent();
    const worldPromptCombined = joinPromptBlocks([worldPrompt, chatGuideContent]);

    const vars = {
      user: name1,
      char: name2,
      system: (() => {
        if (useSysprompt && sysp?.content) {
          return processTextMacrosWithPendingFlag(sysp.content, {
            user: name1,
            char: name2,
            group: groupName || name2,
            members: membersText,
          });
        }
        return context.systemPrompt || '';
      })(),
      description: context?.character?.description || '',
      personality: processTextMacrosWithPendingFlag(personalityFormat, {
        user: name1,
        char: name2,
        group: groupName || name2,
        members: membersText,
        personality: context?.character?.personality || '',
      }),
      scenario: processTextMacrosWithPendingFlag(scenarioFormat, {
        user: name1,
        char: name2,
        group: groupName || name2,
        members: membersText,
        scenario: context?.character?.scenario || '',
      }),
      persona: personaPosition === 0 ? personaText : '',
      wiBefore: worldPromptCombined ? wiFormat.replace('{0}', worldPromptCombined) : '',
      wiAfter: '',
      loreBefore: worldPromptCombined ? wiFormat.replace('{0}', worldPromptCombined) : '',
      loreAfter: '',
      anchorBefore: '',
      anchorAfter: '',
      mesExamples: '',
      mesExamplesRaw: '',
      trim: '',
    };

    // 1) Context preset: render story_string as ST-like template
    const combinedStoryString =
      ctxp?.story_string && useContext
        ? processTextMacrosWithPendingFlag(renderStTemplate(ctxp.story_string, vars), {
            user: name1,
            char: name2,
            group: groupName || name2,
            members: membersText,
          })
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

	    // 聊天提示词（私聊/群聊/动态/摘要）统一放入 <chat_guide>，与世界书同位置注入。

    // If context preset disabled, fall back to legacy system prompt building
    if (!useContext) {
      if (context.systemPrompt) {
        messages.push({ role: 'system', content: context.systemPrompt });
      }
      if (vars.system) {
        messages.push({ role: 'system', content: vars.system });
      }
      if (worldPromptCombined) {
        messages.push({ role: 'system', content: wiFormat.replace('{0}', worldPromptCombined) });
      }
      if (context.character) {
        let characterPrompt = `你正在扮演: ${context.character.name}`;
        if (context.character.description) characterPrompt += `\n\n角色描述:\n${context.character.description}`;
        if (context.character.personality) characterPrompt += `\n\n性格特点:\n${context.character.personality}`;
        messages.push({ role: 'system', content: characterPrompt });
      }
    }

    // 3) History
    const history = Array.isArray(context.history) ? context.history.map(m => ({ ...m })) : [];
    // Prefix speaker names to reduce model confusion (role is still preserved)
    try {
      for (const m of history) {
        if (!m || typeof m !== 'object') continue;
        if (m.role !== 'user' && m.role !== 'assistant') continue;

        // Prevent OOM: Replace heavy Base64 content with placeholders for LLM context
        if (m.type === 'image' || (typeof m.content === 'string' && m.content.startsWith('data:image'))) {
          m.content = '[图片]';
        } else if (m.type === 'audio' || (typeof m.content === 'string' && m.content.startsWith('data:audio'))) {
          m.content = '[语音]';
        }

        const speaker = m.role === 'assistant' && isGroupChat
          ? (String(m?.name || '').trim() || name2)
          : (m.role === 'user' ? name1 : name2);
        m.content = normalizeHistoryLineBreaks(m.content, m.role);
        m.content = withSpeakerPrefix(m.content, speaker);
      }
    } catch {}

    // Persona Description (SillyTavern-like): AT_DEPTH=4 injects into chat history
    if (personaText && personaPosition === 4) {
      const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' };
      const role = roleMap[personaRole] || 'system';
      const idx = Math.max(0, history.length - personaDepth);
      history.splice(idx, 0, { role, content: personaText });
    }

    // IN_CHAT: inject story string into history (depth + role)
    if (combinedStoryString && position === 1) {
      const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' };
      const role = roleMap[injectRole] || 'system';
      const idx = Math.max(0, history.length - injectDepth);
      history.splice(idx, 0, { role, content: combinedStoryString });
    }
	    // 聊天提示词已由 <chat_guide> 统一承载，不再插入历史数组（避免落入 <history>）。
    const postHistoryRaw = useSysprompt ? sysp?.post_history || '' : '';
    const extraPromptBlocksRaw = Array.isArray(context?.meta?.extraPromptBlocks) ? context.meta.extraPromptBlocks : [];
    const extraHasLastUser = extraPromptBlocksRaw.some(b => hasLastUserMessagePlaceholder(b?.content));
    if (!usedLastUserMessageForPendingInput && (extraHasLastUser || hasLastUserMessagePlaceholder(postHistoryRaw))) {
      usedLastUserMessageForPendingInput = true;
    }

		    messages.push({ role: 'system', content: HISTORY_RECALL_NOTICE });
	    try {
	      const momentData = buildMomentCommentDataBlock();
	      if (momentData) messages.push(momentData);
	    } catch {}
	    try {
	      const momentSummary = buildMomentSummaryBlock();
	      if (momentSummary) messages.push(momentSummary);
	    } catch {}
	    try {
	      const sessionSummary = getSessionSummaryItems(sessionIdForSummary, {
	        limitPlain: 30,
	        limitPlainGroup: 10,
	        limitWithCompacted: 30,
	        limitWithCompactedGroup: 3,
	      });
	      const compactedText = String(sessionSummary?.compacted?.text || '').trim();
	      const summaries = Array.isArray(sessionSummary?.summaries) ? sessionSummary.summaries : [];
	      if (isGroupChat) {
	        const rows = [];
	        if (compactedText) rows.push(`- 大总结：${compactedText}`);
	        rows.push(
	          ...summaries
	            .map(s => String(typeof s === 'string' ? s : s?.text || '').trim())
	            .filter(Boolean)
	            .map(t => `- ${t}`),
	        );
	        if (rows.length) {
	          messages.push({
	            role: 'system',
	            content: `以下为该群聊的摘要回顾：\n${rows.join('\n')}`.trim(),
	          });
	        }
	      } else {
	        if (summaries.length) {
	          messages.push({
	            role: 'system',
	            content: `以下为该聊天室的简要摘要回顾：\n${summaries
	              .map(s => `- ${String(typeof s === 'string' ? s : s?.text || '').trim()}`)
	              .filter(Boolean)
	              .join('\n')}`.trim(),
	          });
	        }
	      }
	    } catch {}
      try {
        const groupSummary = buildPrivateChatMemberGroupSummaryBlock();
        if (groupSummary) messages.push(groupSummary);
      } catch {}
	    try {
	      const priv = buildGroupMemberPrivateSummaryBlock();
	      if (priv) messages.push(priv);
	    } catch {}
	    if (isMomentCommentTask) {
	      try {
	        const targetId = String(context?.task?.targetSessionId || '').trim();
	        const targetName = String(context?.task?.targetName || '').trim();
	        const t = buildPrivateSummaryBlockForTarget(targetId, targetName);
	        if (t) messages.push(t);
	      } catch {}
	    }
	    if (history.length > 0) {
	      messages.push(...history);
	    }
	    // 摘要提示词包含在 <chat_guide> 内，与世界书一起注入。

    // 4) Post-history instructions (sysprompt.post_history)
    const postHistory = useSysprompt ? sysp?.post_history || '' : '';
    if (postHistory) {
      const phi = processTextMacrosWithPendingFlag(postHistory, { user: name1, char: name2 });
      if (phi) {
        messages.push({ role: 'user', content: phi });
      }
    }

    // Optional extra prompt blocks (appended just before the current user message).
    // Useful for maintenance tasks that want to place content at the {{lastUserMessage}} position.
    try {
      const extra = context?.meta?.extraPromptBlocks;
      const blocks = Array.isArray(extra) ? extra : [];
      for (const b of blocks) {
        if (!b || typeof b !== 'object') continue;
        const raw = String(b.content ?? '').trim();
        if (!raw) continue;
        const roleRaw = String(b.role || 'system').toLowerCase();
        const role = (roleRaw === 'user' || roleRaw === 'assistant' || roleRaw === 'system') ? roleRaw : 'system';
        if (!usedLastUserMessageForPendingInput && lastUserMessageRe.test(raw)) {
          usedLastUserMessageForPendingInput = true;
        }
        const content = processTextMacrosWithPendingFlag(raw, {
          user: name1,
          char: name2,
          group: groupName || name2,
          members: membersText,
        });
        const rendered = String(content || '').trim();
        if (!rendered) continue;
        messages.push({ role, content: rendered });
      }
    } catch {}

    // 5) Current user message
    if (!usedLastUserMessageForPendingInput && pendingUserPrompt) {
      messages.push({ role: 'user', content: pendingUserPrompt });
    }
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

      const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      const int = v => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined);

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
          timestamp: Date.now(),
        },
        {
          role: 'assistant',
          content: assistantMessage,
          timestamp: Date.now(),
        },
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

  /**
   * 删除世界书
   */
  async deleteWorldInfo(worldId) {
    try {
      await this.worldStore.remove(worldId);
      if (this.currentWorldId === worldId) {
        this.setCurrentWorld(null);
      }
      if (this.globalWorldId === worldId) {
        this.setGlobalWorld(null);
      }
      logger.debug('世界书已删除', worldId);
    } catch (error) {
      logger.error('删除世界书失败:', error);
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

  /**
   * Bind a world book to a session without switching the current session world.
   * (Used by group chat to auto-enable member world books.)
   */
  bindWorldToSession(sessionId, worldId, { silent = true } = {}) {
    const sid = String(sessionId || '').trim();
    const wid = String(worldId || '').trim();
    if (!sid) return;
    if (!wid) {
      delete this.worldSessionMap[sid];
      this.persistWorldSessionMap();
      return;
    }
    this.worldSessionMap[sid] = wid;
    this.persistWorldSessionMap();
    if (!silent && sid === this.activeSessionId) {
      this.currentWorldId = wid;
      window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: wid } }));
    }
  }

  setGlobalWorld(worldId) {
    this.globalWorldId = worldId || null;
    this.persistGlobalWorldId();
    window.dispatchEvent(
      new CustomEvent('worldinfo-changed', {
        detail: { worldId: this.currentWorldId, globalWorldId: this.globalWorldId },
      }),
    );
  }

  formatWorldPrompt(worldId, label) {
    const id = String(worldId || '').trim();
    if (!id) return '';
    const data = this.worldStore.load(id);
    if (!data || !Array.isArray(data.entries)) return '';

    const matchTextRaw = typeof label === 'object' && label ? String(label.matchText || '') : '';
    const matchText = matchTextRaw;

    const norm = v => String(v ?? '').trim();
    const normalizeKeys = e => {
      const keys = Array.isArray(e?.key) ? e.key : Array.isArray(e?.triggers) ? e.triggers : [];
      return keys.map(norm).filter(Boolean);
    };
    const isRegexLiteral = k =>
      k.length >= 2 && k.startsWith('/') && k.endsWith('/') && k.indexOf('/', 1) === k.length - 1;
    const matchKey = (key, text, caseSensitive) => {
      const k = norm(key);
      if (!k) return false;
      if (isRegexLiteral(k)) {
        const body = k.slice(1, -1);
        try {
          const re = new RegExp(body, caseSensitive ? '' : 'i');
          return re.test(text);
        } catch {
          return false;
        }
      }
      if (caseSensitive) return text.includes(k);
      return text.toLowerCase().includes(k.toLowerCase());
    };

    const shouldInclude = e => {
      if (!e || typeof e !== 'object') return false;
      if (Boolean(e.disable)) return false;
      // Legacy behavior: when no match text provided, include all enabled entries.
      if (!matchTextRaw) return Boolean(e.content);
      if (Boolean(e.constant)) return Boolean(e.content);
      const keys = normalizeKeys(e);
      if (!keys.length) return false;
      const cs = Boolean(e.caseSensitive);
      const text = cs ? matchText : matchText.toLowerCase();
      return keys.some(k => matchKey(k, text, cs));
    };

    const entries = [...data.entries].filter(shouldInclude).sort((a, b) => {
      const oa = Number.isFinite(Number(a?.order))
        ? Number(a.order)
        : Number.isFinite(Number(a?.priority))
        ? Number(a.priority)
        : 0;
      const ob = Number.isFinite(Number(b?.order))
        ? Number(b.order)
        : Number.isFinite(Number(b?.priority))
        ? Number(b.priority)
        : 0;
      return oa - ob;
    });

    const trimEdgeBlankLines = (text) =>
      String(text ?? '').replace(/^(?:[ \t]*\r?\n)+/, '').replace(/(?:\r?\n[ \t]*)+$/, '');
    const parts = entries.map(e => trimEdgeBlankLines(e.content)).filter(t => String(t || '').trim().length > 0);
    if (!parts.length) return '';
    return parts.join('\n\n');
  }

  /**
   * 生成當前世界書的提示串
   */
  getActiveWorldPrompt() {
    const builtinPart = this.formatWorldPrompt(BUILTIN_PHONE_FORMAT_WORLDBOOK_ID, { matchText: '' });
    const globalPart =
      this.globalWorldId && String(this.globalWorldId) !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID
        ? this.formatWorldPrompt(this.globalWorldId, { matchText: '' })
        : '';
    const sessionPart = this.currentWorldId ? this.formatWorldPrompt(this.currentWorldId, { matchText: '' }) : '';
    return [builtinPart, globalPart, sessionPart].filter(Boolean).join('\n\n');
  }

  getWorldForSession(sessionId = this.activeSessionId) {
    return this.worldSessionMap[sessionId] || null;
  }
}

// 创建全局实例
window.appBridge = new AppBridge();

// 兼容层：提供类似 SillyTavern 的全局函数
window.triggerSlash = async command => {
  logger.info('执行命令:', command);
  // TODO: 解析并执行命令
  // 例如: /echo -> 显示消息, /gen -> 生成, /clear -> 清空
};

window.getWorldInfoSettings = async () => {
  return await window.appBridge.getWorldInfo();
};

window.saveWorldInfo = async data => {
  await window.appBridge.saveWorldInfo(window.appBridge.currentCharacterId, data);
};

// 兼容：從 ST world JSON 導入（期望前端讀取後調用）
window.importSTWorld = async (jsonObj, name = 'imported') => {
  const simplified = convertSTWorld(jsonObj, name);
  await window.appBridge.saveWorldInfo(name, simplified);
  return simplified;
};

// 初始化
window.appBridge
  .init()
  .then(() => {
    logger.info('✅ App Bridge 初始化完成');
  })
  .catch(error => {
    logger.error('❌ App Bridge 初始化失败:', error);
  });

export { AppBridge };
