/**
 * Moments (动态) store - simplified
 * - Persists to disk (Tauri save_kv/load_kv) with localStorage fallback
 * - Stores parsed moments from AI output (moment_start...moment_end) and replies
 */

import { logger } from '../utils/logger.js';

const safeInvoke = async (cmd, args) => {
    const invoker = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INVOKE__;
    if (typeof invoker !== 'function') {
        throw new Error('Tauri invoke not available');
    }
    return invoker(cmd, args);
};

const STORE_KEY = 'moments_store_v1';

const clone = (v) => {
    try {
        return structuredClone(v);
    } catch {
        return JSON.parse(JSON.stringify(v));
    }
};

const genId = (prefix = 'moment') => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

export class MomentsStore {
    constructor() {
        this.state = this._load();
        this._normalizeState();
        this.ready = this._hydrateFromDisk();
        this._pendingDiskSave = Promise.resolve();
        this.lastDiskError = '';
    }

    _normalizeState() {
        try {
            const list = Array.isArray(this.state?.moments) ? this.state.moments : [];
            list.forEach((m) => {
                if (!m || typeof m !== 'object') return;
                if (typeof m.authorAvatar === 'string') {
                    m.authorAvatar = this._sanitizeAvatarForStore(m.authorAvatar);
                }
            });
        } catch (err) {
            logger.warn('moments store normalize failed', err);
        }
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            return raw ? JSON.parse(raw) : { moments: [] };
        } catch (err) {
            logger.warn('moments store load failed, reset', err);
            return { moments: [] };
        }
    }

    async _hydrateFromDisk() {
        try {
            const kv = await safeInvoke('load_kv', { name: STORE_KEY });
            if (kv && typeof kv === 'object' && Array.isArray(kv.moments)) {
                this.state = kv;
                this._normalizeState();
                try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch (err) {
                    logger.warn('moments store hydrate -> localStorage failed (quota?)', err);
                }
                logger.info('moments store hydrated from disk');
            }
        } catch (err) {
            this.lastDiskError = String(err?.message || err || '');
            logger.debug('moments store disk load skipped (可能非 Tauri)', err);
        }
    }

    _sanitizeAvatarForStore(avatar) {
        const s = String(avatar || '').trim();
        if (!s) return '';
        // Avoid duplicating huge base64 blobs into moments file; rely on contactsStore for data: avatars.
        // (On mobile, large JSON can fail to persist and lead to "moments empty after restart".)
        if (s.startsWith('data:')) return '';
        return s;
    }

    _persist() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch (err) {
            logger.warn('moments store persist -> localStorage failed (quota?)', err);
        }
        this._pendingDiskSave = this._pendingDiskSave
            .catch(() => {}) // keep chain alive
            .then(() => safeInvoke('save_kv', { name: STORE_KEY, data: this.state }))
            .then(() => { this.lastDiskError = ''; })
            .catch((err) => {
                this.lastDiskError = String(err?.message || err || '');
                logger.warn('moments store save_kv failed (可能非 Tauri)', err);
            });
    }

    async flush() {
        await this._pendingDiskSave.catch(() => {});
        return true;
    }

    list() {
        const list = Array.isArray(this.state.moments) ? this.state.moments : [];
        return list.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    get(id) {
        const list = Array.isArray(this.state.moments) ? this.state.moments : [];
        return list.find(m => m.id === id) || null;
    }

    upsert(moment) {
        if (!moment || typeof moment !== 'object') return null;
        const sig = String(moment.signature || '').trim();
        const list = Array.isArray(this.state.moments) ? this.state.moments : [];
        const existingBySig = sig ? list.find(x => String(x.signature || '').trim() === sig) : null;
        const id = String(moment.id || '').trim() || existingBySig?.id || genId('moment');
        const existingById = list.find(m => m && m.id === id) || null;

        // Patch-safe updates: only overwrite fields if provided, otherwise keep existing value.
        // (UI may call upsert with partial objects for backfill/migration.)
        const authorId = hasOwn(moment, 'authorId') ? String(moment.authorId || '').trim() : (existingById?.authorId || existingBySig?.authorId || '');
        const author = hasOwn(moment, 'author') ? String(moment.author || '').trim() : (existingById?.author || existingBySig?.author || '');
        const content = hasOwn(moment, 'content') ? String(moment.content || '') : (existingById?.content || existingBySig?.content || '');
        const time = hasOwn(moment, 'time') ? String(moment.time || '') : (existingById?.time || existingBySig?.time || '');
        const originSessionId = hasOwn(moment, 'originSessionId') ? String(moment.originSessionId || '').trim() : (existingById?.originSessionId || existingBySig?.originSessionId || '');

        const views = hasOwn(moment, 'views')
            ? (Number.isFinite(Number(moment.views)) ? Number(moment.views) : 0)
            : (Number.isFinite(Number(existingById?.views)) ? Number(existingById.views) : (Number.isFinite(Number(existingBySig?.views)) ? Number(existingBySig.views) : 0));
        const likes = hasOwn(moment, 'likes')
            ? (Number.isFinite(Number(moment.likes)) ? Number(moment.likes) : 0)
            : (Number.isFinite(Number(existingById?.likes)) ? Number(existingById.likes) : (Number.isFinite(Number(existingBySig?.likes)) ? Number(existingBySig.likes) : 0));

        const comments = hasOwn(moment, 'comments')
            ? (Array.isArray(moment.comments) ? moment.comments : [])
            : (Array.isArray(existingById?.comments) ? existingById.comments : (Array.isArray(existingBySig?.comments) ? existingBySig.comments : []));

        const timestamp = hasOwn(moment, 'timestamp')
            ? (Number.isFinite(Number(moment.timestamp)) ? Number(moment.timestamp) : Date.now())
            : (Number.isFinite(Number(existingById?.timestamp)) ? Number(existingById.timestamp) : (Number.isFinite(Number(existingBySig?.timestamp)) ? Number(existingBySig.timestamp) : Date.now()));

        const signature = sig || existingById?.signature || existingBySig?.signature || `${author}\u0000${content}\u0000${time}`;
        const authorAvatarRaw = hasOwn(moment, 'authorAvatar')
            ? String(moment.authorAvatar || '')
            : String(existingById?.authorAvatar || existingBySig?.authorAvatar || '');
        const authorAvatar = this._sanitizeAvatarForStore(authorAvatarRaw);

        const next = {
            id,
            signature,
            authorId,
            author,
            authorAvatar,
            originSessionId,
            content,
            time,
            views,
            likes,
            comments,
            timestamp,
        };
        const idx = list.findIndex(m => m.id === id);
        if (idx === -1) list.push(next);
        else list[idx] = { ...list[idx], ...next };
        this.state.moments = list;
        this._persist();
        return next;
    }

    addMany(moments = []) {
        const added = [];
        (Array.isArray(moments) ? moments : []).forEach((m) => {
            const saved = this.upsert(m);
            if (saved) added.push(saved);
        });
        return added;
    }

    addComments(momentId, comments = []) {
        const id = String(momentId || '').trim();
        if (!id) return null;
        const m = this.get(id);
        if (!m) return null;
        const existing = Array.isArray(m.comments) ? m.comments.slice() : [];
        (Array.isArray(comments) ? comments : []).forEach((c) => {
            if (!c) return;
            existing.push({
                author: String(c.author || '').trim(),
                content: String(c.content || ''),
                time: String(c.time || ''),
                timestamp: Number.isFinite(Number(c.timestamp)) ? Number(c.timestamp) : Date.now(),
            });
        });
        // Keep at most 50 comments
        const trimmed = existing.slice(-50);
        this.upsert({ ...m, comments: trimmed, timestamp: m.timestamp || Date.now() });
        return this.get(id);
    }

    remove(momentId) {
        const id = String(momentId || '').trim();
        if (!id) return false;
        const list = Array.isArray(this.state.moments) ? this.state.moments : [];
        const next = list.filter(m => m && m.id !== id);
        if (next.length === list.length) return false;
        this.state.moments = next;
        this._persist();
        return true;
    }

    clearAll() {
        this.state.moments = [];
        this._persist();
    }

    exportState() {
        return clone(this.state);
    }
}
