/**
 * 聊天 Store
 * 迁移自: src-legacy/scripts/storage/chat-store.js
 * 简化版本，核心功能
 */

import { formatTime, genId, logger } from '$utils';
import { tryInvoke } from '$utils/tauri.js';
import { makeScopedKey, normalizeScopeId } from './store-scope.js';

const BASE_STORE_KEY = 'chat_store_v2';
const MAX_MESSAGES_PER_SESSION = 400;
const MAX_TOTAL_CHARS = 600000;

/**
 * 消息类型
 * @typedef {Object} Message
 * @property {string} id
 * @property {'user' | 'assistant' | 'system'} role
 * @property {string} content
 * @property {number} timestamp
 * @property {string} time
 * @property {'sending' | 'sent' | 'error'} [status]
 * @property {Object} [meta]
 */

/**
 * 会话类型
 * @typedef {Object} Session
 * @property {string} id
 * @property {string} contactId
 * @property {Message[]} messages
 * @property {string} draft
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * 规范化消息
 */
function normalizeMessage(msg) {
  return {
    id: msg.id || genId('msg'),
    role: msg.role || 'user',
    content: msg.content || '',
    timestamp: msg.timestamp || Date.now(),
    time: msg.time || formatTime(msg.timestamp || Date.now(), 'HH:mm'),
    status: msg.status || 'sent',
    name: msg.name || '',
    meta: msg.meta || {},
  };
}

/**
 * 截断字符串
 */
function clampString(value, max = 180000) {
  const s = String(value ?? '');
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/**
 * 清理消息用于持久化
 */
function sanitizeMessage(msg) {
  if (!msg) return msg;
  const out = { ...msg };
  
  // 移除大型数据
  delete out.avatar;
  delete out.rawOriginal;
  
  // 截断内容
  if (typeof out.content === 'string') {
    out.content = clampString(out.content);
  }
  
  return out;
}

function createChatStore(scopeId = '') {
  const scope = normalizeScopeId(scopeId);
  const storeKey = makeScopedKey(BASE_STORE_KEY, scope);
  
  let sessions = $state({});
  let currentSessionId = $state(null);
  let initialized = false;

  // 加载会话
  async function load() {
    try {
      let data = await tryInvoke('load_kv', { name: storeKey });
      
      if (!data) {
        const raw = localStorage.getItem(storeKey);
        if (raw) {
          data = JSON.parse(raw);
        }
      }

      if (data?.sessions) {
        sessions = data.sessions;
      }
      if (data?.currentSessionId) {
        currentSessionId = data.currentSessionId;
      }
      
      initialized = true;
      logger.info(`Chat store loaded: ${Object.keys(sessions).length} sessions`);
    } catch (err) {
      logger.error('Failed to load chat store', err);
    }
  }

  // 保存会话
  async function save() {
    // 清理消息
    const cleanSessions = {};
    for (const [id, session] of Object.entries(sessions)) {
      cleanSessions[id] = {
        ...session,
        messages: session.messages.slice(-MAX_MESSAGES_PER_SESSION).map(sanitizeMessage),
      };
    }
    
    const data = { sessions: cleanSessions, currentSessionId, scopeId: scope };
    try {
      localStorage.setItem(storeKey, JSON.stringify(data));
      await tryInvoke('save_kv', { name: storeKey, data });
    } catch (err) {
      logger.warn('Failed to save chat store', err);
    }
  }

  // 初始化
  load();

  return {
    get sessions() {
      return sessions;
    },
    
    get currentSessionId() {
      return currentSessionId;
    },
    
    get currentSession() {
      return currentSessionId ? sessions[currentSessionId] : null;
    },
    
    get currentMessages() {
      return this.currentSession?.messages || [];
    },
    
    // 获取或创建会话
    getOrCreateSession(contactId) {
      // 查找现有会话
      const existing = Object.values(sessions).find((s) => s.contactId === contactId);
      if (existing) {
        currentSessionId = existing.id;
        return existing;
      }
      
      // 创建新会话
      const session = {
        id: genId('session'),
        contactId,
        messages: [],
        draft: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      sessions[session.id] = session;
      sessions = { ...sessions };
      currentSessionId = session.id;
      save();
      
      return session;
    },
    
    // 切换会话
    switchSession(sessionId) {
      if (sessions[sessionId]) {
        currentSessionId = sessionId;
      }
    },
    
    // 添加消息
    addMessage(message) {
      if (!currentSessionId || !sessions[currentSessionId]) return null;
      
      const normalized = normalizeMessage(message);
      sessions[currentSessionId].messages.push(normalized);
      sessions[currentSessionId].updatedAt = Date.now();
      sessions = { ...sessions };
      save();
      
      return normalized;
    },
    
    // 更新消息
    updateMessage(messageId, updates) {
      if (!currentSessionId || !sessions[currentSessionId]) return null;
      
      const messages = sessions[currentSessionId].messages;
      const index = messages.findIndex((m) => m.id === messageId);
      
      if (index !== -1) {
        messages[index] = { ...messages[index], ...updates };
        sessions[currentSessionId].updatedAt = Date.now();
        sessions = { ...sessions };
        save();
        return messages[index];
      }
      
      return null;
    },
    
    // 删除消息
    deleteMessage(messageId) {
      if (!currentSessionId || !sessions[currentSessionId]) return false;
      
      const messages = sessions[currentSessionId].messages;
      const index = messages.findIndex((m) => m.id === messageId);
      
      if (index !== -1) {
        messages.splice(index, 1);
        sessions[currentSessionId].updatedAt = Date.now();
        sessions = { ...sessions };
        save();
        return true;
      }
      
      return false;
    },
    
    // 清空当前会话消息
    clearMessages() {
      if (!currentSessionId || !sessions[currentSessionId]) return;
      
      sessions[currentSessionId].messages = [];
      sessions[currentSessionId].updatedAt = Date.now();
      sessions = { ...sessions };
      save();
    },
    
    // 通过 contactId 清空会话
    clearSession(contactId) {
      const session = Object.values(sessions).find((s) => s.contactId === contactId);
      if (!session) return;
      
      session.messages = [];
      session.updatedAt = Date.now();
      sessions = { ...sessions };
      save();
    },
    
    // 删除会话
    deleteSession(sessionId) {
      if (!sessions[sessionId]) return false;
      
      delete sessions[sessionId];
      sessions = { ...sessions };
      
      if (currentSessionId === sessionId) {
        currentSessionId = null;
      }
      
      save();
      return true;
    },
    
    // 更新草稿
    updateDraft(draft) {
      if (!currentSessionId || !sessions[currentSessionId]) return;
      
      sessions[currentSessionId].draft = draft;
      sessions = { ...sessions };
      // 草稿不立即保存，延迟处理
    },
    
    get isInitialized() {
      return initialized;
    },
    
    async reload() {
      await load();
    },
  };
}

export const chatStore = createChatStore();
