/**
 * 簡易會話/消息存儲（前端），可擴展到 Tauri FS
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
                try {
                    localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
                } catch (err) {
                    logger.warn('chat store hydrate -> localStorage failed (quota?)', err);
                }
                logger.info('chat store hydrated from disk');
            }
        } catch (err) {
            logger.debug('chat store disk load skipped (可能非 Tauri)', err);
        }
    }

    _persist() {
        // 1. Fast path: Schedule localStorage shortly (50ms debounce) to skip current frame
        if (this._lsTimer) clearTimeout(this._lsTimer);
        this._lsTimer = setTimeout(() => {
            try {
                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
            } catch (err) {
                logger.warn('chat store persist -> localStorage failed (quota?)', err);
            }
        }, 50);

        // 2. Slow path: Schedule disk save (2000ms debounce) to avoid frequent fsync on Android
        if (this._diskTimer) clearTimeout(this._diskTimer);
        this._diskTimer = setTimeout(() => {
            safeInvoke('save_kv', { name: STORE_KEY, data: this.state }).catch((err) => {
                logger.debug('chat store save_kv failed (可能非 Tauri)', err);
            });
        }, 2000);
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
            this.state.sessions[id] = { messages: [], draft: '', variables: {} };
        } else if (!this.state.sessions[id].variables) {
            this.state.sessions[id].variables = {};
        }
        const msg = ensureId({ ...message });
        this.state.sessions[id].messages.push(msg);
        this._persist();
        return msg;
    }

    setDraft(text, id = this.currentId) {
        if (!this.state.sessions[id]) {
            this.state.sessions[id] = { messages: [], draft: '', variables: {} };
        }
        this.state.sessions[id].draft = text;
        this._persist();
    }

    getVariable(key, id = this.currentId) {
        const session = this.state.sessions[id];
        return session?.variables?.[key];
    }

    setVariable(key, value, id = this.currentId) {
        if (!this.state.sessions[id]) {
            this.state.sessions[id] = { messages: [], draft: '', variables: {} };
        }
        if (!this.state.sessions[id].variables) {
            this.state.sessions[id].variables = {};
        }
        this.state.sessions[id].variables[key] = value;
        this._persist();
    }

    getDraft(id = this.currentId) {
        return this.state.sessions[id]?.draft || '';
    }

    clear(id = this.currentId) {
        if (this.state.sessions[id]) {
            this.state.sessions[id].messages = [];
            this.state.sessions[id].draft = '';
            this.state.sessions[id].lastRawResponse = '';
            this.state.sessions[id].lastRawAt = 0;
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

    setLastRawResponse(text, id = this.currentId) {
        if (!this.state.sessions[id]) {
            this.state.sessions[id] = { messages: [], draft: '', settings: {} };
        }
        const raw = String(text ?? '');
        // keep bounded to reduce quota risks
        const maxLen = 220_000;
        const trimmed = raw.length > maxLen ? raw.slice(-maxLen) : raw;
        this.state.sessions[id].lastRawResponse = trimmed;
        this.state.sessions[id].lastRawAt = Date.now();
        this._persist();
    }

    getLastRawResponse(id = this.currentId) {
        return String(this.state.sessions[id]?.lastRawResponse || '');
    }

    getLastRawAt(id = this.currentId) {
        return Number(this.state.sessions[id]?.lastRawAt || 0) || 0;
    }

    _tsSuffix() {
        const d = new Date();
        return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }

    archiveCurrentMessages(id = this.currentId, name = '', forceCreate = false) {
        if (!this.state.sessions[id]) return null;
        const messages = this.state.sessions[id].messages || [];
        if (!messages.length) return null;
        
        if (!this.state.sessions[id].archives) {
            this.state.sessions[id].archives = [];
        }

        const currentArchiveId = this.state.sessions[id].currentArchiveId;
        const timestamp = Date.now();
        const suffix = ` (${this._tsSuffix()})`;
        
        // 1. Update existing archive (if not forced new and attached)
        if (!forceCreate && currentArchiveId) {
            const idx = this.state.sessions[id].archives.findIndex(a => a.id === currentArchiveId);
            if (idx !== -1) {
                this.state.sessions[id].archives[idx].messages = [...messages];
                this.state.sessions[id].archives[idx].timestamp = timestamp;
                if (name) {
                    const clean = name.trim();
                    // Append suffix only if no timestamp looks present
                    this.state.sessions[id].archives[idx].name = clean.match(/\d{4}\/\d{2}\/\d{2}/) ? clean : (clean + suffix);
                }
                this._persist();
                return currentArchiveId;
            }
        }

        // 2. Create new archive
        const archiveId = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
        let baseName = name || '存档';
        if (!baseName.match(/\d{4}\/\d{2}\/\d{2}/)) {
            baseName += suffix;
        }

        this.state.sessions[id].archives.push({
            id: archiveId,
            name: baseName,
            timestamp,
            messages: [...messages]
        });
        
        this._persist();
        return archiveId;
    }

    startNewChat(id = this.currentId, archiveName = '') {
        const session = this.state.sessions[id];
        if (!session) return;

        if (session.messages && session.messages.length > 0) {
            // Force create a snapshot of current state before clearing
            this.archiveCurrentMessages(id, archiveName, true);
        }

        session.messages = [];
        session.currentArchiveId = null;
        session.draft = '';
        session.lastRawResponse = '';
        this._persist();
    }

    getArchives(id = this.currentId) {
        return (this.state.sessions[id]?.archives || []).sort((a, b) => b.timestamp - a.timestamp);
    }

    loadArchivedMessages(archiveId, id = this.currentId) {
        const session = this.state.sessions[id];
        if (!session || !session.archives) return false;
        
        const archive = session.archives.find(a => a.id === archiveId);
        if (!archive) return false;
        
        // Save current state before switching
        if (session.messages && session.messages.length > 0) {
             const isDetached = !session.currentArchiveId;
             const autoName = isDetached ? '自动存档' : '';
             this.archiveCurrentMessages(id, autoName, false);
        }
        
        session.messages = [...archive.messages];
        session.currentArchiveId = archiveId;
        this._persist();
        return true;
    }

    deleteArchive(archiveId, id = this.currentId) {
        const session = this.state.sessions[id];
        if (!session || !session.archives) return false;
        session.archives = session.archives.filter(a => a.id !== archiveId);
        if (session.currentArchiveId === archiveId) {
            session.currentArchiveId = null;
        }
        this._persist();
        return true;
    }
}
