/**
 * 簡易會話/消息存儲（前端），可擴展到 Tauri FS
 */

import { logger } from '../utils/logger.js';

const safeInvoke = async (cmd, args) => {
    const invoker = window.__TAURI__?.core?.invoke;
    if (typeof invoker === 'function') return invoker(cmd, args);
    return null;
};

const ensureId = (msg) => {
    if (!msg) return msg;
    if (!msg.id) {
        msg.id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    }
    if (!msg.timestamp) {
        msg.timestamp = Date.now();
    }
    return msg;
};

const STORE_KEY = 'chat_store_v1';

export class ChatStore {
    constructor() {
        this.state = this._load();
        this.currentId = this.state.currentId || 'default';
        this.ready = this._hydrateFromDisk();
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            return raw ? JSON.parse(raw) : { sessions: {}, currentId: 'default' };
        } catch (e) {
            logger.warn('chat store load failed, reset', e);
            return { sessions: {}, currentId: 'default' };
        }
    }

    async _hydrateFromDisk() {
        try {
            const kv = await safeInvoke('load_kv', { name: STORE_KEY });
            if (kv && kv.sessions) {
                this.state = kv;
                this.currentId = kv.currentId || 'default';
                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
                logger.info('chat store hydrated from disk');
            }
        } catch (err) {
            logger.debug('chat store disk load skipped (可能非 Tauri)', err);
        }
    }

    _persist() {
        localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
        // 持久化到磁碟（忽略錯誤，以免阻塞 UI）
        safeInvoke('save_kv', { name: STORE_KEY, data: this.state }).catch(() => {});
    }

    listSessions() {
        // Sort by last message time desc
        return Object.keys(this.state.sessions).sort((a, b) => {
            const ta = this.getLastMessage(a)?.timestamp || 0;
            const tb = this.getLastMessage(b)?.timestamp || 0;
            return tb - ta;
        });
    }

    setCurrent(id) {
        this.currentId = id;
        this.state.currentId = id;
        this._persist();
    }

    getCurrent() {
        return this.currentId;
    }

    getMessages(id = this.currentId) {
        return this.state.sessions[id]?.messages || [];
    }

    getLastMessage(id = this.currentId) {
        const msgs = this.getMessages(id);
        return msgs.length ? msgs[msgs.length - 1] : null;
    }

    appendMessage(message, id = this.currentId) {
        if (!this.state.sessions[id]) {
            this.state.sessions[id] = { messages: [], draft: '' };
        }
        const msg = ensureId({ ...message });
        this.state.sessions[id].messages.push(msg);
        this._persist();
        return msg;
    }

    setDraft(text, id = this.currentId) {
        if (!this.state.sessions[id]) {
            this.state.sessions[id] = { messages: [], draft: '' };
        }
        this.state.sessions[id].draft = text;
        this._persist();
    }

    getDraft(id = this.currentId) {
        return this.state.sessions[id]?.draft || '';
    }

    clear(id = this.currentId) {
        if (this.state.sessions[id]) {
            this.state.sessions[id].messages = [];
            this.state.sessions[id].draft = '';
            this._persist();
        }
    }

    delete(id) {
        delete this.state.sessions[id];
        if (this.currentId === id) {
            this.currentId = 'default';
            this.state.currentId = 'default';
        }
        this._persist();
    }

    rename(oldId, newId) {
        if (!this.state.sessions[oldId]) return;
        if (this.state.sessions[newId]) return; // prevent overwrite
        this.state.sessions[newId] = this.state.sessions[oldId];
        delete this.state.sessions[oldId];
        if (this.currentId === oldId) {
            this.currentId = newId;
            this.state.currentId = newId;
        }
        this._persist();
    }

    getSessionSettings(id = this.currentId) {
        return this.state.sessions[id]?.settings || null;
    }

    setSessionSettings(id = this.currentId, settings) {
        if (!this.state.sessions[id]) {
            this.state.sessions[id] = { messages: [], draft: '', settings: {} };
        }
        this.state.sessions[id].settings = settings;
        this._persist();
    }

    clearMessages(id = this.currentId) {
        if (this.state.sessions[id]) {
            this.state.sessions[id].messages = [];
            this._persist();
        }
    }

    deleteMessage(msgId, id = this.currentId) {
        const session = this.state.sessions[id];
        if (!session || !session.messages) return false;
        const before = session.messages.length;
        session.messages = session.messages.filter(m => m.id !== msgId);
        const changed = session.messages.length !== before;
        if (changed) this._persist();
        return changed;
    }

    updateMessage(msgId, updater, id = this.currentId) {
        const session = this.state.sessions[id];
        if (!session || !session.messages) return null;
        const idx = session.messages.findIndex(m => m.id === msgId);
        if (idx === -1) return null;
        const updated = ensureId({ ...session.messages[idx], ...updater });
        session.messages[idx] = updated;
        this._persist();
        return updated;
    }

    findMessage(msgId, id = this.currentId) {
        return this.state.sessions[id]?.messages?.find(m => m.id === msgId) || null;
    }

    switchSession(id) {
        this.setCurrent(id);
        if (!this.state.sessions[id]) {
            this.state.sessions[id] = { messages: [], draft: '', settings: {} };
            this._persist();
        }
    }
}
