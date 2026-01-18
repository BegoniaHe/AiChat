/**
 * 联系人 Store
 * 迁移自: src-legacy/scripts/storage/contacts-store.js
 */

import { genId, logger } from '$utils';
import { tryInvoke } from '$utils/tauri.js';
import { makeScopedKey, normalizeScopeId } from './store-scope.js';

const BASE_STORE_KEY = 'contacts_store_v1';

/**
 * 规范化联系人数据
 */
function normalizeContact(contact) {
  return {
    id: contact.id || genId('contact'),
    name: contact.name || '未命名',
    avatar: contact.avatar || '',
    description: contact.description || '',
    isGroup: Boolean(contact.isGroup),
    members: Array.isArray(contact.members) ? contact.members : [],
    lastMessage: contact.lastMessage || '',
    lastMessageTime: contact.lastMessageTime || 0,
    unreadCount: contact.unreadCount || 0,
    pinned: Boolean(contact.pinned),
    muted: Boolean(contact.muted),
    tags: Array.isArray(contact.tags) ? contact.tags : [],
    createdAt: contact.createdAt || Date.now(),
    updatedAt: contact.updatedAt || Date.now(),
    // 角色卡相关
    persona: contact.persona || null,
    systemPrompt: contact.systemPrompt || '',
    greeting: contact.greeting || '',
  };
}

function createContactsStore(scopeId = '') {
  const scope = normalizeScopeId(scopeId);
  const storeKey = makeScopedKey(BASE_STORE_KEY, scope);

  let contacts = $state({});
  let initialized = false;

  // 加载联系人
  async function load() {
    try {
      let data = await tryInvoke('load_kv', { name: storeKey });

      if (!data) {
        const raw = localStorage.getItem(storeKey);
        if (raw) {
          data = JSON.parse(raw);
        }
      }

      if (data?.contacts) {
        contacts = data.contacts;
      }

      initialized = true;
      logger.info(`Contacts loaded: ${Object.keys(contacts).length} contacts`);
    } catch (err) {
      logger.error('Failed to load contacts', err);
    }
  }

  // 保存联系人
  async function save() {
    const data = { contacts, scopeId: scope };
    try {
      localStorage.setItem(storeKey, JSON.stringify(data));
      await tryInvoke('save_kv', { name: storeKey, data });
    } catch (err) {
      logger.warn('Failed to save contacts', err);
    }
  }

  // 初始化
  load();

  return {
    get value() {
      return contacts;
    },

    get list() {
      return Object.values(contacts).sort((a, b) => {
        // 置顶优先
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        // 最近消息优先
        return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
      });
    },

    get(id) {
      return contacts[id] || null;
    },

    add(contact) {
      const normalized = normalizeContact(contact);
      contacts[normalized.id] = normalized;
      contacts = { ...contacts };
      save();
      return normalized;
    },

    update(id, updates) {
      if (!contacts[id]) return null;
      contacts[id] = {
        ...contacts[id],
        ...updates,
        updatedAt: Date.now(),
      };
      contacts = { ...contacts };
      save();
      return contacts[id];
    },

    remove(id) {
      if (!contacts[id]) return false;
      delete contacts[id];
      contacts = { ...contacts };
      save();
      return true;
    },

    updateLastMessage(id, message, time = Date.now()) {
      if (!contacts[id]) return;
      contacts[id].lastMessage = message;
      contacts[id].lastMessageTime = time;
      contacts = { ...contacts };
      save();
    },

    incrementUnread(id) {
      if (!contacts[id]) return;
      contacts[id].unreadCount = (contacts[id].unreadCount || 0) + 1;
      contacts = { ...contacts };
      save();
    },

    clearUnread(id) {
      if (!contacts[id]) return;
      contacts[id].unreadCount = 0;
      contacts = { ...contacts };
      save();
    },

    togglePin(id) {
      if (!contacts[id]) return;
      contacts[id].pinned = !contacts[id].pinned;
      contacts = { ...contacts };
      save();
    },

    toggleMute(id) {
      if (!contacts[id]) return;
      contacts[id].muted = !contacts[id].muted;
      contacts = { ...contacts };
      save();
    },

    get isInitialized() {
      return initialized;
    },

    async reload() {
      await load();
    },
  };
}

export const contactsStore = createContactsStore();
