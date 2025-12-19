/**
 * 簡易會話/消息存儲（前端），可擴展到 Tauri FS
 */

import { logger } from '../utils/logger.js';
const MAX_PERSIST_MESSAGES_PER_SESSION = 400;
const MAX_PERSIST_TOTAL_TEXT_CHARS_PER_SESSION = 600_000;
const MAX_PERSIST_ARCHIVES_PER_SESSION = 6;
const MAX_PERSIST_ARCHIVE_MESSAGES = 400;
const MAX_PERSIST_SUMMARIES_PER_SESSION = 120;
const MAX_PERSIST_STRING_CHARS = 180_000;
const MAX_PERSIST_DATA_URL_CHARS = 4096;

const isDataUrl = (s) => typeof s === 'string' && s.startsWith('data:') && s.length > MAX_PERSIST_DATA_URL_CHARS;

const clampString = (value, max = MAX_PERSIST_STRING_CHARS) => {
    const s = String(value ?? '');
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
};

const sanitizeMessageForPersist = (msg) => {
    if (!msg || typeof msg !== 'object') return msg;
    const out = { ...msg };

    // Never persist very large inline binaries (images/audio/avatars); they will explode KV/localStorage.
    if (isDataUrl(out.content)) out.content = '[binary omitted]';
    // Avoid duplicating avatars per message; avatar should be resolved from contacts/persona at render time.
    delete out.avatar;

    // Many message payloads include huge raw originals; we only keep bounded versions on disk.
    if (typeof out.rawOriginal === 'string') delete out.rawOriginal;

    if (typeof out.content === 'string') out.content = clampString(out.content);
    if (typeof out.raw === 'string') out.raw = clampString(out.raw);

    try {
        if (out.meta && typeof out.meta === 'object') {
            const meta = { ...out.meta };
            if (isDataUrl(meta.url)) meta.url = '[binary omitted]';
            // Avoid persisting extremely large meta strings (rare but catastrophic on Android).
            for (const k of Object.keys(meta)) {
                if (typeof meta[k] === 'string') meta[k] = clampString(meta[k], 40_000);
            }
            out.meta = meta;
        }
    } catch {}

    return out;
};

const sliceTailWithinChars = (arr, getText, { maxItems, maxChars } = {}) => {
    const list = Array.isArray(arr) ? arr : [];
    const limitItems = Number.isFinite(maxItems) ? Math.max(0, Math.trunc(maxItems)) : list.length;
    const limitChars = Number.isFinite(maxChars) ? Math.max(0, Math.trunc(maxChars)) : Infinity;

    let total = 0;
    const picked = [];
    for (let i = list.length - 1; i >= 0; i--) {
        if (picked.length >= limitItems) break;
        const it = list[i];
        const t = getText(it);
        const len = t ? t.length : 0;
        if (total + len > limitChars && picked.length) break;
        total += len;
        picked.push(it);
    }
    picked.reverse();
    return picked;
};

const sanitizeSessionForPersist = (session) => {
    if (!session || typeof session !== 'object') return session;
    const out = { ...session };

    const messagesRaw = Array.isArray(out.messages) ? out.messages : [];
    const sanitizedMessages = messagesRaw.map(sanitizeMessageForPersist);
    out.messages = sliceTailWithinChars(
        sanitizedMessages,
        (m) => {
            if (!m || typeof m !== 'object') return '';
            const a = typeof m.content === 'string' ? m.content : '';
            const b = typeof m.raw === 'string' ? m.raw : '';
            return a + b;
        },
        { maxItems: MAX_PERSIST_MESSAGES_PER_SESSION, maxChars: MAX_PERSIST_TOTAL_TEXT_CHARS_PER_SESSION },
    );

    // If lastRead pointer points to a trimmed-away message, fall back to last existing message id.
    try {
        const lr = String(out.lastReadMessageId || '');
        if (lr) {
            const exists = out.messages.some(m => String(m?.id || '') === lr);
            if (!exists) {
                const last = out.messages.length ? out.messages[out.messages.length - 1] : null;
                out.lastReadMessageId = last?.id ? String(last.id) : '';
            }
        }
    } catch {}

    if (typeof out.draft === 'string') out.draft = clampString(out.draft, 20_000);

    try {
        const s = Array.isArray(out.detachedSummaries) ? out.detachedSummaries : [];
        const normalized = s
            .map((it) => {
                if (!it) return null;
                if (typeof it === 'string') return { at: 0, text: clampString(it, 6000) };
                const text = String(it.text || '').trim();
                if (!text) return null;
                const at = Number(it.at || 0) || 0;
                return { at, text: clampString(text, 6000) };
            })
            .filter(Boolean);
        out.detachedSummaries = normalized.slice(-MAX_PERSIST_SUMMARIES_PER_SESSION);
    } catch {}

    try {
        const clampCompacted = (cs) => {
            if (!cs || typeof cs !== 'object') return null;
            const text = String(cs.text || '').trim();
            if (!text) return null;
            const at = Number(cs.at || 0) || 0;
            const raw = typeof cs.raw === 'string' ? clampString(cs.raw, 120_000) : undefined;
            return raw === undefined ? { at, text: clampString(text, 24_000) } : { at, text: clampString(text, 24_000), raw };
        };
        out.compactedSummary = clampCompacted(out.compactedSummary);
        if (out.compactedSummaryLastRaw && typeof out.compactedSummaryLastRaw === 'object') {
            const at = Number(out.compactedSummaryLastRaw.at || 0) || 0;
            const raw = String(out.compactedSummaryLastRaw.raw || '').trim();
            out.compactedSummaryLastRaw = raw ? { at, raw: clampString(raw, 120_000) } : null;
        }
    } catch {}

    // Archives can easily duplicate huge message lists; keep bounded in persisted snapshot.
    try {
        const arcs = Array.isArray(out.archives) ? out.archives : [];
        const sanitized = arcs
            .map((a) => {
                if (!a || typeof a !== 'object') return null;
                const arc = { ...a };
                const msgs = Array.isArray(arc.messages) ? arc.messages.map(sanitizeMessageForPersist) : [];
                arc.messages = sliceTailWithinChars(
                    msgs,
                    (m) => {
                        if (!m || typeof m !== 'object') return '';
                        const a = typeof m.content === 'string' ? m.content : '';
                        const b = typeof m.raw === 'string' ? m.raw : '';
                        return a + b;
                    },
                    { maxItems: MAX_PERSIST_ARCHIVE_MESSAGES, maxChars: MAX_PERSIST_TOTAL_TEXT_CHARS_PER_SESSION },
                );
                // Snapshot summaries in archive are optional; keep them small if present.
                if (Array.isArray(arc.summaries)) {
                    arc.summaries = arc.summaries
                        .map((it) => {
                            if (!it) return null;
                            if (typeof it === 'string') return { at: 0, text: clampString(it, 6000) };
                            const text = String(it.text || '').trim();
                            if (!text) return null;
                            const at = Number(it.at || 0) || 0;
                            return { at, text: clampString(text, 6000) };
                        })
                        .filter(Boolean)
                        .slice(-MAX_PERSIST_SUMMARIES_PER_SESSION);
                }
                if (arc.compactedSummary && typeof arc.compactedSummary === 'object') {
                    const text = String(arc.compactedSummary.text || '').trim();
                    if (text) {
                        arc.compactedSummary = {
                            at: Number(arc.compactedSummary.at || 0) || 0,
                            text: clampString(text, 24_000),
                            raw: typeof arc.compactedSummary.raw === 'string' ? clampString(arc.compactedSummary.raw, 120_000) : undefined,
                        };
                        if (arc.compactedSummary.raw === undefined) delete arc.compactedSummary.raw;
                    } else {
                        arc.compactedSummary = null;
                    }
                }
                if (arc.compactedSummaryLastRaw && typeof arc.compactedSummaryLastRaw === 'object') {
                    const raw = String(arc.compactedSummaryLastRaw.raw || '').trim();
                    arc.compactedSummaryLastRaw = raw
                        ? { at: Number(arc.compactedSummaryLastRaw.at || 0) || 0, raw: clampString(raw, 120_000) }
                        : null;
                }
                return arc;
            })
            .filter(Boolean);
        out.archives = sanitized.slice(0, MAX_PERSIST_ARCHIVES_PER_SESSION);
    } catch {}

    return out;
};

const sanitizeStateForPersist = (state) => {
    const src = state && typeof state === 'object' ? state : { sessions: {}, currentId: 'default' };
    const sessions = src.sessions && typeof src.sessions === 'object' ? src.sessions : {};
    const nextSessions = {};
    for (const [sid, session] of Object.entries(sessions)) {
        nextSessions[sid] = sanitizeSessionForPersist(session);
    }
    return { ...src, sessions: nextSessions };
};

const isQuotaError = (err) => {
    try {
        const name = String(err?.name || '');
        const msg = String(err?.message || '');
        // WebKit: code 22; Firefox: NS_ERROR_DOM_QUOTA_REACHED; Chrome: QuotaExceededError
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

const waitForInvoker = async (timeoutMs = 5000) => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    // In plain browser dev mode, don't wait.
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
        this.state = sanitizeStateForPersist(this._load());
        this.currentId = this.state.currentId || 'default';
        this.ready = this._hydrateFromDisk();
        this._lsDisabled = false;
        this._lsQuotaWarned = false;
        this._hydrateRetryCount = 0;
    }

    _ensureSession(id) {
        if (!this.state.sessions[id]) {
            this.state.sessions[id] = {
                messages: [],
                draft: '',
                pending: [],
                variables: {},
                settings: {},
                detachedSummaries: [],
                compactedSummary: null,
                compactedSummaryLastRaw: null,
                lastReadMessageId: '',
            };
            return;
        }
        const s = this.state.sessions[id];
        if (!s.messages) s.messages = [];
        if (typeof s.draft !== 'string') s.draft = '';
        if (!Array.isArray(s.pending)) s.pending = [];
        if (!s.variables) s.variables = {};
        if (!s.settings) s.settings = {};
        if (!Array.isArray(s.detachedSummaries)) s.detachedSummaries = [];
        if (typeof s.compactedSummary !== 'object') s.compactedSummary = null;
        if (typeof s.compactedSummaryLastRaw !== 'object') s.compactedSummaryLastRaw = null;
        if (typeof s.lastReadMessageId !== 'string') s.lastReadMessageId = '';
        // Normalize legacy summaries (string[]) into objects
        try {
            s.detachedSummaries = (s.detachedSummaries || []).map((it) => {
                if (!it) return null;
                if (typeof it === 'string') return { at: 0, text: it };
                const text = String(it.text || '').trim();
                if (!text) return null;
                const at = Number(it.at || 0) || 0;
                return { at, text };
            }).filter(Boolean);
        } catch {}
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
                this.state = sanitizeStateForPersist(kv);
                this.currentId = kv.currentId || 'default';
                try {
                    localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
                } catch (err) {
                    if (isQuotaError(err)) {
                        this._lsDisabled = true;
                        if (!this._lsQuotaWarned) {
                            this._lsQuotaWarned = true;
                            logger.warn('chat store: localStorage quota exceeded; will rely on Tauri KV (data should remain after restart).', err);
                        }
                        try { localStorage.removeItem(STORE_KEY); } catch {}
                    } else {
                        logger.warn('chat store hydrate -> localStorage failed', err);
                    }
                }
                logger.info('chat store hydrated from disk');
                try {
                    window.dispatchEvent(new CustomEvent('store-hydrated', { detail: { store: 'chat' } }));
                } catch {}
            }
        } catch (err) {
            logger.debug('chat store disk load skipped (可能非 Tauri)', err);
            // Retry later if Tauri is present but invoke isn't ready yet (common after hot reload / process restore)
            try {
                const g = typeof globalThis !== 'undefined' ? globalThis : window;
                const msg = String(err?.message || '');
                const canRetry = Boolean(g?.__TAURI__) && msg.includes('invoke not available');
                if (canRetry && this._hydrateRetryCount < 3) {
                    const attempt = ++this._hydrateRetryCount;
                    logger.warn(`chat store hydrate retry scheduled (${attempt}/3)`);
                    setTimeout(() => { this._hydrateFromDisk(); }, 800 * attempt);
                }
            } catch {}
        }
    }

    _persist() {
        const persistable = () => sanitizeStateForPersist(this.state);
        // 1. Fast path: Schedule localStorage shortly (50ms debounce) to skip current frame
        if (this._lsTimer) clearTimeout(this._lsTimer);
        this._lsTimer = setTimeout(() => {
            if (this._lsDisabled) return;
            try {
                localStorage.setItem(STORE_KEY, JSON.stringify(persistable()));
            } catch (err) {
                if (isQuotaError(err)) {
                    this._lsDisabled = true;
                    if (!this._lsQuotaWarned) {
                        this._lsQuotaWarned = true;
                        logger.warn('chat store: localStorage quota exceeded; disabling localStorage writes and relying on Tauri KV.', err);
                    }
                    try { localStorage.removeItem(STORE_KEY); } catch {}
                } else {
                    logger.warn('chat store persist -> localStorage failed', err);
                }
            }
        }, 50);

        // 2. Slow path: Schedule disk save (2000ms debounce) to avoid frequent fsync on Android
        if (this._diskTimer) clearTimeout(this._diskTimer);
        this._diskTimer = setTimeout(() => {
            safeInvoke('save_kv', { name: STORE_KEY, data: persistable() }).catch((err) => {
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

    hasSession(id) {
        const sid = String(id || '').trim();
        if (!sid) return false;
        return Boolean(this.state?.sessions && Object.prototype.hasOwnProperty.call(this.state.sessions, sid));
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
        this._ensureSession(id);
        const msg = ensureId({ ...message });
        this.state.sessions[id].messages.push(msg);
        this._persist();
        return msg;
    }

    markRead(id = this.currentId, messageId = '') {
        this._ensureSession(id);
        const sid = String(id || '').trim();
        if (!sid) return;
        const nextId = String(messageId || '').trim();
        if (nextId) {
            this.state.sessions[sid].lastReadMessageId = nextId;
            this._persist();
            return;
        }
        const last = this.getLastMessage(sid);
        if (last?.id) {
            this.state.sessions[sid].lastReadMessageId = String(last.id);
            this._persist();
        }
    }

    getLastReadMessageId(id = this.currentId) {
        this._ensureSession(id);
        return String(this.state.sessions[id]?.lastReadMessageId || '');
    }

    getFirstUnreadMessageId(id = this.currentId) {
        this._ensureSession(id);
        const msgs = this.getMessages(id) || [];
        const lastRead = this.getLastReadMessageId(id);
        const startIdx = lastRead ? msgs.findIndex(m => String(m?.id || '') === lastRead) : -1;
        const from = startIdx >= 0 ? startIdx + 1 : 0;
        for (let i = from; i < msgs.length; i++) {
            const m = msgs[i];
            if (!m) continue;
            if (m.role === 'assistant') return String(m.id || '');
        }
        return '';
    }

    getUnreadCount(id = this.currentId) {
        this._ensureSession(id);
        const msgs = this.getMessages(id) || [];
        const lastRead = this.getLastReadMessageId(id);
        const startIdx = lastRead ? msgs.findIndex(m => String(m?.id || '') === lastRead) : -1;
        const from = startIdx >= 0 ? startIdx + 1 : 0;
        let n = 0;
        for (let i = from; i < msgs.length; i++) {
            const m = msgs[i];
            if (!m) continue;
            if (m.role === 'assistant') n++;
        }
        return n;
    }

    setDraft(text, id = this.currentId) {
        this._ensureSession(id);
        this.state.sessions[id].draft = text;
        this._persist();
    }

    getVariable(key, id = this.currentId) {
        const session = this.state.sessions[id];
        return session?.variables?.[key];
    }

    setVariable(key, value, id = this.currentId) {
        this._ensureSession(id);
        this.state.sessions[id].variables[key] = value;
        this._persist();
    }

    listVariables(id = this.currentId) {
        this._ensureSession(id);
        const vars = this.state.sessions[id].variables || {};
        return { ...vars };
    }

    deleteVariable(key, id = this.currentId) {
        const k = String(key || '').trim();
        if (!k) return false;
        this._ensureSession(id);
        const vars = this.state.sessions[id].variables || {};
        if (!Object.prototype.hasOwnProperty.call(vars, k)) return false;
        delete vars[k];
        this._persist();
        return true;
    }

    clearVariables(id = this.currentId) {
        this._ensureSession(id);
        this.state.sessions[id].variables = {};
        this._persist();
        return true;
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
        this._ensureSession(id);
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
        const targetId = String(msgId || '').trim();
        if (!targetId) return false;
        const before = session.messages.length;
        const idx = session.messages.findIndex(m => String(m?.id || '') === targetId);
        if (idx === -1) return false;

        const lastRead = String(session.lastReadMessageId || '');
        const wasLastRead = lastRead && lastRead === targetId;

        session.messages = session.messages.filter(m => String(m?.id || '') !== targetId);
        const changed = session.messages.length !== before;
        if (!changed) return false;

        // If we deleted the message that "lastReadMessageId" points to,
        // keep the read pointer stable by moving it to a nearby existing message.
        if (wasLastRead) {
            const fallback =
                (idx - 1 >= 0 && session.messages[idx - 1]?.id)
                    ? String(session.messages[idx - 1].id)
                    : (session.messages.length ? String(session.messages[session.messages.length - 1]?.id || '') : '');
            session.lastReadMessageId = fallback;
        }

        this._persist();
        return true;
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
        this._ensureSession(id);
        this._persist();
    }

    setLastRawResponse(text, id = this.currentId) {
        this._ensureSession(id);
        const raw = String(text ?? '');
        // keep bounded to reduce quota risks
        const maxLen = 220_000;
        const trimmed = raw.length > maxLen ? raw.slice(-maxLen) : raw;
        this.state.sessions[id].lastRawResponse = trimmed;
        this.state.sessions[id].lastRawAt = Date.now();
        this._persist();
    }

    getPersonaLock(id = this.currentId) {
        try {
            const s = this.state.sessions[id];
            const pid = s?.settings?.personaLockId;
            return pid ? String(pid) : '';
        } catch {
            return '';
        }
    }

    setPersonaLock(id = this.currentId, personaId) {
        const sid = String(id || '').trim();
        const pid = String(personaId || '').trim();
        if (!sid) return false;
        if (!pid) return false;
        this._ensureSession(sid);
        this.state.sessions[sid].settings.personaLockId = pid;
        this._persist();
        return true;
    }

    clearPersonaLock(id = this.currentId) {
        const sid = String(id || '').trim();
        if (!sid) return false;
        this._ensureSession(sid);
        delete this.state.sessions[sid].settings.personaLockId;
        this._persist();
        return true;
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
                // Snapshot summaries into archive (for attached mode, it's the source of truth)
                try {
                    const list = this.state.sessions[id].archives[idx].summaries;
                    if (!Array.isArray(list)) this.state.sessions[id].archives[idx].summaries = [];
                } catch {}
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

        const getCurrentSummariesSnapshot = () => {
            try {
                const session = this.state.sessions[id];
                const curAid = session.currentArchiveId;
                if (curAid && Array.isArray(session.archives)) {
                    const arc = session.archives.find(a => a.id === curAid);
                    const list = arc?.summaries;
                    return Array.isArray(list) ? list.map((it) => {
                        if (!it) return null;
                        if (typeof it === 'string') return { at: 0, text: String(it) };
                        const text = String(it.text || '').trim();
                        if (!text) return null;
                        const at = Number(it.at || 0) || 0;
                        return { at, text };
                    }).filter(Boolean) : [];
                }
                const src = session.detachedSummaries;
                return Array.isArray(src) ? src.map((it) => {
                    if (!it) return null;
                    if (typeof it === 'string') return { at: 0, text: String(it) };
                    const text = String(it.text || '').trim();
                    if (!text) return null;
                    const at = Number(it.at || 0) || 0;
                    return { at, text };
                }).filter(Boolean) : [];
            } catch {
                return [];
            }
        };
        const getCurrentCompactedSummarySnapshot = () => {
            try {
                const session = this.state.sessions[id];
                const curAid = session.currentArchiveId;
                if (curAid && Array.isArray(session.archives)) {
                    const arc = session.archives.find(a => a.id === curAid);
                    const cs = arc?.compactedSummary;
                    if (!cs || typeof cs !== 'object') return null;
                    const text = String(cs.text || '').trim();
                    if (!text) return null;
                    const at = Number(cs.at || 0) || 0;
                    return { at, text };
                }
                const cs = session.compactedSummary;
                if (!cs || typeof cs !== 'object') return null;
                const text = String(cs.text || '').trim();
                if (!text) return null;
                const at = Number(cs.at || 0) || 0;
                return { at, text };
            } catch {
                return null;
            }
        };

        this.state.sessions[id].archives.push({
            id: archiveId,
            name: baseName,
            timestamp,
            messages: [...messages],
            summaries: getCurrentSummariesSnapshot(),
            compactedSummary: getCurrentCompactedSummarySnapshot(),
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
        session.detachedSummaries = [];
        session.compactedSummary = null;
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

    getCurrentArchiveId(id = this.currentId) {
        try {
            const sid = String(id || '').trim();
            if (!sid) return null;
            return this.state.sessions[sid]?.currentArchiveId || null;
        } catch {
            return null;
        }
    }

    getSummaries(id = this.currentId) {
        const sid = String(id || '').trim();
        if (!sid) return [];
        this._ensureSession(sid);
        const session = this.state.sessions[sid];
        const curAid = session.currentArchiveId;
        if (curAid && Array.isArray(session.archives)) {
            const arc = session.archives.find(a => a.id === curAid);
            const list = arc?.summaries;
            return Array.isArray(list) ? list : [];
        }
        return Array.isArray(session.detachedSummaries) ? session.detachedSummaries : [];
    }

    _setSummariesInternal(nextList, id = this.currentId) {
        const sid = String(id || '').trim();
        if (!sid) return false;
        this._ensureSession(sid);
        const session = this.state.sessions[sid];
        const next = Array.isArray(nextList) ? nextList : [];
        const curAid = session.currentArchiveId;
        if (curAid && Array.isArray(session.archives)) {
            const arc = session.archives.find(a => a.id === curAid);
            if (arc) {
                arc.summaries = next;
                this._persist();
                return true;
            }
        }
        session.detachedSummaries = next;
        this._persist();
        return true;
    }

    setSummaries(items, id = this.currentId) {
        const list = Array.isArray(items) ? items : [];
        const normalized = list
            .map((it) => {
                if (!it || typeof it !== 'object') return null;
                const text = String(it.text || '').trim();
                if (!text) return null;
                const at = Number(it.at || 0) || Date.now();
                return { at, text };
            })
            .filter(Boolean);
        return this._setSummariesInternal(normalized, id);
    }

    deleteSummaryItems(items, id = this.currentId) {
        const sid = String(id || '').trim();
        if (!sid) return false;
        const picks = Array.isArray(items) ? items : [];
        if (!picks.length) return false;
        const keys = new Set(
            picks.map((it) => {
                if (!it) return '';
                if (typeof it === 'string') return String(it);
                const at = Number(it.at || 0) || 0;
                const text = String(it.text || '');
                return `${at}|${text}`;
            }).filter(Boolean)
        );
        if (!keys.size) return false;
        const cur = this.getSummaries(sid) || [];
        const next = (Array.isArray(cur) ? cur : []).filter((it) => {
            const at = (typeof it === 'object' && it) ? Number(it.at || 0) || 0 : 0;
            const text = String((typeof it === 'string') ? it : it?.text || '');
            return !keys.has(`${at}|${text}`);
        });
        return this._setSummariesInternal(next, sid);
    }

    updateSummaryItems(updates, id = this.currentId) {
        const sid = String(id || '').trim();
        if (!sid) return false;
        const list = Array.isArray(updates) ? updates : [];
        if (!list.length) return false;
        const map = new Map();
        for (const u of list) {
            if (!u || typeof u !== 'object') continue;
            const at = Number(u.at || 0) || 0;
            const fromText = String(u.fromText ?? u.text ?? '');
            const toText = String(u.toText ?? '').trim();
            if (!at || !fromText || !toText) continue;
            map.set(`${at}|${fromText}`, toText);
        }
        if (!map.size) return false;
        const cur = this.getSummaries(sid) || [];
        const next = (Array.isArray(cur) ? cur : []).map((it) => {
            const at = (typeof it === 'object' && it) ? Number(it.at || 0) || 0 : 0;
            const text = String((typeof it === 'string') ? it : it?.text || '');
            const key = `${at}|${text}`;
            if (!map.has(key)) return it;
            const toText = map.get(key);
            if (typeof it === 'string') return toText;
            return { ...(it || {}), at, text: toText };
        });
        return this._setSummariesInternal(next, sid);
    }

    getCompactedSummary(id = this.currentId) {
        const sid = String(id || '').trim();
        if (!sid) return null;
        this._ensureSession(sid);
        const session = this.state.sessions[sid];
        const curAid = session.currentArchiveId;
        if (curAid && Array.isArray(session.archives)) {
            const arc = session.archives.find(a => a.id === curAid);
            const cs = arc?.compactedSummary;
            if (cs && typeof cs === 'object') {
                const text = String(cs.text || '').trim();
                if (!text) return null;
                const at = Number(cs.at || 0) || 0;
                const raw = typeof cs.raw === 'string' ? cs.raw : '';
                return { at, text, raw };
            }
            return null;
        }
        const cs = session.compactedSummary;
        if (!cs || typeof cs !== 'object') return null;
        const text = String(cs.text || '').trim();
        if (!text) return null;
        const at = Number(cs.at || 0) || 0;
        const raw = typeof cs.raw === 'string' ? cs.raw : '';
        return { at, text, raw };
    }

    getCompactedSummaryRaw(id = this.currentId) {
        const sid = String(id || '').trim();
        if (!sid) return '';
        this._ensureSession(sid);
        const session = this.state.sessions[sid];
        const curAid = session.currentArchiveId;
        if (curAid && Array.isArray(session.archives)) {
            const arc = session.archives.find(a => a.id === curAid);
            const cs = arc?.compactedSummary;
            if (cs && typeof cs === 'object' && typeof cs.raw === 'string' && cs.raw.trim()) return cs.raw;
            const lr = arc?.compactedSummaryLastRaw;
            if (lr && typeof lr === 'object' && typeof lr.raw === 'string' && lr.raw.trim()) return lr.raw;
            return '';
        }
        const cs = session.compactedSummary;
        if (cs && typeof cs === 'object' && typeof cs.raw === 'string' && cs.raw.trim()) return cs.raw;
        const lr = session.compactedSummaryLastRaw;
        if (lr && typeof lr === 'object' && typeof lr.raw === 'string' && lr.raw.trim()) return lr.raw;
        return '';
    }

    setCompactedSummaryRaw(raw, id = this.currentId, { at = Date.now() } = {}) {
        const sid = String(id || '').trim();
        const text = String(raw || '').trim();
        if (!sid || !text) return false;
        this._ensureSession(sid);
        const session = this.state.sessions[sid];
        const item = { at: Number(at || Date.now()) || Date.now(), raw: text };
        const curAid = session.currentArchiveId;
        if (curAid && Array.isArray(session.archives)) {
            const arc = session.archives.find(a => a.id === curAid);
            if (arc) {
                arc.compactedSummaryLastRaw = item;
                this._persist();
                return true;
            }
        }
        session.compactedSummaryLastRaw = item;
        this._persist();
        return true;
    }

    setCompactedSummary(summaryText, id = this.currentId, { at = Date.now(), raw } = {}) {
        const sid = String(id || '').trim();
        const text = String(summaryText || '').trim();
        if (!sid || !text) return false;
        this._ensureSession(sid);
        const session = this.state.sessions[sid];
        const ts = Number(at || Date.now()) || Date.now();
        const rawText = (typeof raw === 'string') ? raw : null;
        const curAid = session.currentArchiveId;
        if (curAid && Array.isArray(session.archives)) {
            const arc = session.archives.find(a => a.id === curAid);
            if (arc) {
                const prevRaw = (arc.compactedSummary && typeof arc.compactedSummary === 'object' && typeof arc.compactedSummary.raw === 'string')
                    ? arc.compactedSummary.raw
                    : '';
                arc.compactedSummary = { at: ts, text, raw: rawText == null ? prevRaw : rawText };
                this._persist();
                return true;
            }
        }
        const prevRaw = (session.compactedSummary && typeof session.compactedSummary === 'object' && typeof session.compactedSummary.raw === 'string')
            ? session.compactedSummary.raw
            : '';
        session.compactedSummary = { at: ts, text, raw: rawText == null ? prevRaw : rawText };
        this._persist();
        return true;
    }

    clearCompactedSummary(id = this.currentId) {
        const sid = String(id || '').trim();
        if (!sid) return false;
        this._ensureSession(sid);
        const session = this.state.sessions[sid];
        const curAid = session.currentArchiveId;
        if (curAid && Array.isArray(session.archives)) {
            const arc = session.archives.find(a => a.id === curAid);
            if (arc) {
                arc.compactedSummary = null;
                arc.compactedSummaryLastRaw = null;
                this._persist();
                return true;
            }
        }
        session.compactedSummary = null;
        session.compactedSummaryLastRaw = null;
        this._persist();
        return true;
    }

    addSummary(summaryText, id = this.currentId) {
        const sid = String(id || '').trim();
        const text = String(summaryText || '').trim();
        if (!sid || !text) return false;
        this._ensureSession(sid);
        const session = this.state.sessions[sid];
        const item = { at: Date.now(), text };
        const curAid = session.currentArchiveId;
        if (curAid && Array.isArray(session.archives)) {
            const arc = session.archives.find(a => a.id === curAid);
            if (arc) {
                if (!Array.isArray(arc.summaries)) arc.summaries = [];
                arc.summaries.push(item);
                this._persist();
                return true;
            }
        }
        if (!Array.isArray(session.detachedSummaries)) session.detachedSummaries = [];
        session.detachedSummaries.push(item);
        this._persist();
        return true;
    }

    clearSummaries(id = this.currentId) {
        const sid = String(id || '').trim();
        if (!sid) return false;
        this._ensureSession(sid);
        const session = this.state.sessions[sid];
        const curAid = session.currentArchiveId;
        if (curAid && Array.isArray(session.archives)) {
            const arc = session.archives.find(a => a.id === curAid);
            if (arc) {
                arc.summaries = [];
                this._persist();
                return true;
            }
        }
        session.detachedSummaries = [];
        this._persist();
        return true;
    }

    // ============ Pending Messages Management ============

    /**
     * Add a pending message to the queue (cached, not sent to AI yet)
     */
    addPendingMessage(message, id = this.currentId) {
        this._ensureSession(id);
        const msg = ensureId({ ...message, status: 'pending' });
        this.state.sessions[id].pending.push(msg);
        this._persist();
        return msg;
    }

    /**
     * Get all pending messages for a session
     */
    getPendingMessages(id = this.currentId) {
        this._ensureSession(id);
        return this.state.sessions[id].pending || [];
    }

    /**
     * Remove a specific pending message
     */
    removePendingMessage(msgId, id = this.currentId) {
        const session = this.state.sessions[id];
        if (!session || !Array.isArray(session.pending)) return false;
        const targetId = String(msgId || '').trim();
        if (!targetId) return false;
        const before = session.pending.length;
        session.pending = session.pending.filter(m => String(m?.id || '') !== targetId);
        const changed = session.pending.length !== before;
        if (changed) this._persist();
        return changed;
    }

    /**
     * Update a pending message's content
     */
    updatePendingMessage(msgId, newContent, id = this.currentId) {
        const session = this.state.sessions[id];
        if (!session || !Array.isArray(session.pending)) return null;
        const idx = session.pending.findIndex(m => String(m?.id || '') === String(msgId));
        if (idx === -1) return null;
        session.pending[idx] = { ...session.pending[idx], content: newContent, timestamp: Date.now() };
        this._persist();
        return session.pending[idx];
    }

    /**
     * Clear all pending messages for a session
     */
    clearPendingMessages(id = this.currentId) {
        const session = this.state.sessions[id];
        if (!session) return false;
        session.pending = [];
        this._persist();
        return true;
    }

    /**
     * Get count of pending messages
     */
    getPendingCount(id = this.currentId) {
        return this.getPendingMessages(id).length;
    }
}
