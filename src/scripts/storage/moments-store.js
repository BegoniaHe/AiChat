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

export class MomentsStore {
    constructor() {
        this.state = this._load();
        this.ready = this._hydrateFromDisk();
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
                try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch {}
                logger.info('moments store hydrated from disk');
            }
        } catch (err) {
            logger.debug('moments store disk load skipped (可能非 Tauri)', err);
        }
    }

    _persist() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch {}
        safeInvoke('save_kv', { name: STORE_KEY, data: this.state }).catch(() => {});
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
        const next = {
            id,
            signature: sig || existingBySig?.signature || '',
            author: String(moment.author || '').trim(),
            content: String(moment.content || ''),
            time: String(moment.time || ''),
            views: Number.isFinite(Number(moment.views)) ? Number(moment.views) : 0,
            likes: Number.isFinite(Number(moment.likes)) ? Number(moment.likes) : 0,
            comments: Array.isArray(moment.comments) ? moment.comments : [],
            timestamp: Number.isFinite(Number(moment.timestamp)) ? Number(moment.timestamp) : Date.now(),
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

    clearAll() {
        this.state.moments = [];
        this._persist();
    }

    exportState() {
        return clone(this.state);
    }
}
