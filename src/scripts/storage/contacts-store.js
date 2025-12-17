/**
 * Contacts store
 * - 保存已添加的好友/群聊信息
 * - 目前主要用于在「联系人」页渲染所有聊天室入口
 */

import { logger } from '../utils/logger.js';

const isQuotaError = (err) => {
    try {
        const name = String(err?.name || '');
        const msg = String(err?.message || '');
        return name === 'QuotaExceededError'
            || name === 'NS_ERROR_DOM_QUOTA_REACHED'
            || Number(err?.code) === 22
            || /quota/i.test(msg);
    } catch {
        return false;
    }
};

const getInvoker = () => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    return g?.__TAURI__?.core?.invoke || g?.__TAURI__?.invoke || g?.__TAURI_INVOKE__ || g?.__TAURI_INTERNALS__?.invoke;
};

const waitForInvoker = async (timeoutMs = 1200) => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (!g?.__TAURI__) return null;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const inv = getInvoker();
        if (typeof inv === 'function') return inv;
        await new Promise(r => setTimeout(r, 50));
    }
    return null;
};

const safeInvoke = async (cmd, args) => {
    const invoker = getInvoker() || await waitForInvoker();
    if (typeof invoker !== 'function') throw new Error('Tauri invoke not available');
    return invoker(cmd, args);
};

const STORE_KEY = 'contacts_store_v1';

const normalizeId = (id) => String(id || '').trim();
const displayNameFromId = (id) => {
    const s = normalizeId(id);
    return s.startsWith('group:') ? s.replace(/^group:/, '') : s;
};

export class ContactsStore {
    constructor() {
        this.state = this._load();
        this.ready = this._hydrateFromDisk();
        this._lsDisabled = false;
        this._lsQuotaWarned = false;
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            return raw ? JSON.parse(raw) : { contacts: {} };
        } catch (err) {
            logger.warn('contacts store load failed, reset', err);
            return { contacts: {} };
        }
    }

    async _hydrateFromDisk() {
        try {
            const kv = await safeInvoke('load_kv', { name: STORE_KEY });
            if (kv && kv.contacts) {
                this.state = kv;
                try {
                    localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
                } catch (err) {
                    if (isQuotaError(err)) {
                        this._lsDisabled = true;
                        if (!this._lsQuotaWarned) {
                            this._lsQuotaWarned = true;
                            logger.warn('contacts store: localStorage quota exceeded; will rely on Tauri KV (data should remain after restart).', err);
                        }
                        try { localStorage.removeItem(STORE_KEY); } catch {}
                    } else {
                        logger.warn('contacts store hydrate -> localStorage failed', err);
                    }
                }
                logger.info('contacts store hydrated from disk');
            }
        } catch (err) {
            logger.debug('contacts store disk load skipped (可能非 Tauri)', err);
        }
    }

    _persist() {
        // Always try disk first; localStorage is best-effort (may exceed quota due to base64 avatars)
        safeInvoke('save_kv', { name: STORE_KEY, data: this.state }).catch((err) => {
            logger.debug('contacts store save_kv failed (可能非 Tauri)', err);
        });
        if (this._lsDisabled) return;
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
        } catch (err) {
            if (isQuotaError(err)) {
                this._lsDisabled = true;
                if (!this._lsQuotaWarned) {
                    this._lsQuotaWarned = true;
                    logger.warn('contacts store: localStorage quota exceeded; disabling localStorage writes and relying on Tauri KV.', err);
                }
                try { localStorage.removeItem(STORE_KEY); } catch {}
            } else {
                logger.warn('contacts store persist -> localStorage failed', err);
            }
        }
    }

    listContacts() {
        const list = Object.values(this.state.contacts || {});
        return list.sort((a, b) => {
            const ta = a.addedAt || 0;
            const tb = b.addedAt || 0;
            if (tb !== ta) return tb - ta;
            return String(a.name || a.id).localeCompare(String(b.name || b.id));
        });
    }

    getContact(id) {
        return this.state.contacts[normalizeId(id)] || null;
    }

    upsertContact(contact) {
        const id = normalizeId(contact?.id);
        if (!id) return;
        const prev = this.state.contacts[id] || {};
        const nextMembers = Array.isArray(contact?.members)
            ? contact.members.map(normalizeId).filter(Boolean)
            : Array.isArray(prev?.members)
                ? prev.members.map(normalizeId).filter(Boolean)
                : [];
        this.state.contacts[id] = {
            id,
            name: contact.name ?? prev.name ?? displayNameFromId(id),
            avatar: contact.avatar ?? prev.avatar ?? '',
            isGroup: contact.isGroup ?? prev.isGroup ?? id.startsWith('group:'),
            addedAt: contact.addedAt ?? prev.addedAt ?? Date.now(),
            members: nextMembers,
            description: contact.description ?? prev.description ?? '',
            updatedAt: Date.now(),
        };
        this._persist();
    }

    removeContact(id) {
        delete this.state.contacts[normalizeId(id)];
        this._persist();
    }

    /**
     * 確保所有現有 session 都在联系人里可见（不会覆盖已有资料）
     */
    ensureFromSessions(sessionIds = [], { defaultAvatar = '' } = {}) {
        let changed = false;
        sessionIds.forEach((sid) => {
            const id = normalizeId(sid);
            if (!id) return;
            if (!this.state.contacts[id]) {
                this.state.contacts[id] = {
                    id,
                    name: displayNameFromId(id),
                    avatar: defaultAvatar,
                    isGroup: id.startsWith('group:'),
                    addedAt: Date.now(),
                    members: [],
                    description: '',
                    updatedAt: Date.now(),
                };
                changed = true;
            }
        });
        if (changed) this._persist();
    }

    listGroups() {
        return this.listContacts().filter(c => c && c.isGroup);
    }

    listFriends() {
        return this.listContacts().filter(c => c && !c.isGroup);
    }

    /**
     * Find group session id by display name (exact match, normalized).
     */
    findGroupIdByName(name) {
        const raw = String(name || '').trim();
        if (!raw) return '';
        const norm = raw.toLowerCase().replace(/\s+/g, '');
        const list = this.listGroups();
        const exact = list.find(g => String(g?.name || '').trim().toLowerCase().replace(/\s+/g, '') === norm);
        return exact?.id || '';
    }
}
