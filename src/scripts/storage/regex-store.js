/**
 * Regex Store (SillyTavern-like, scoped)
 * Scopes:
 *  1) global: always applies
 *  2) local: bound to preset/world (auto applies when bound target active)
 *  3) session: per chat session id
 */
import { logger } from '../utils/logger.js';

const safeInvoke = async (cmd, args) => {
    const invoker = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INVOKE__;
    if (typeof invoker !== 'function') {
        throw new Error('Tauri invoke not available');
    }
    return invoker(cmd, args);
};

const STORE_KEY = 'regex_store_v1';

const genId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const clone = (v) => {
    try {
        return structuredClone(v);
    } catch {
        return JSON.parse(JSON.stringify(v));
    }
};

const ensureObj = (v, fallback) => (v && typeof v === 'object') ? v : fallback;
const ensureArr = (v) => Array.isArray(v) ? v : [];

const normalizeRule = (r = {}) => ({
    id: r.id || genId('re'),
    name: String(r.name || '').trim(),
    enabled: r.enabled !== false,
    when: (r.when === 'input' || r.when === 'output' || r.when === 'both') ? r.when : 'both',
    pattern: String(r.pattern || ''),
    replacement: String(r.replacement ?? ''),
    // allow empty flags ('') to represent "no flags"
    flags: (r.flags === undefined || r.flags === null) ? 'g' : String(r.flags),
});

const normalizeLocalSet = (s = {}) => ({
    id: s.id || genId('re-set'),
    name: String(s.name || '未命名正则').trim() || '未命名正则',
    enabled: s.enabled !== false,
    // bind: null | { type:'preset', presetType, presetId } | { type:'world', worldId }
    bind: (s.bind && typeof s.bind === 'object') ? s.bind : null,
    rules: ensureArr(s.rules).map(normalizeRule),
    createdAt: s.createdAt || Date.now(),
    updatedAt: Date.now(),
});

const makeDefaultState = () => ({
    version: 1,
    global: {
        enabled: true,
        rules: [],
    },
    local: {
        order: [],
        sets: {},
    },
    session: {}, // sessionId -> { enabled, rules }
});

const matchBind = (bind, ctx) => {
    if (!bind || typeof bind !== 'object') return false;
    const type = bind.type;
    if (type === 'preset') {
        const pt = String(bind.presetType || '');
        const pid = String(bind.presetId || '');
        if (!pt || !pid) return false;
        return String(ctx?.activePresets?.[pt] || '') === pid;
    }
    if (type === 'world') {
        const wid = String(bind.worldId || '');
        if (!wid) return false;
        return String(ctx?.worldId || '') === wid;
    }
    return false;
};

export class RegexStore {
    constructor() {
        this.state = null;
        this.isLoaded = false;
        this.ready = this.load();
    }

    async load() {
        if (this.isLoaded && this.state) return this.state;

        let state = null;
        try {
            const kv = await safeInvoke('load_kv', { name: STORE_KEY });
            if (kv && typeof kv === 'object' && Object.keys(kv).length) state = kv;
        } catch (err) {
            logger.debug('load_kv regex store failed (可能非 Tauri)', err);
        }

        if (!state) {
            try {
                const raw = localStorage.getItem(STORE_KEY);
                if (raw) state = JSON.parse(raw);
            } catch {}
        }

        if (!state || typeof state !== 'object') {
            state = makeDefaultState();
            await this.persist(state);
        } else {
            state.version = 1;
            state.global = ensureObj(state.global, { enabled: true, rules: [] });
            state.global.enabled = state.global.enabled !== false;
            state.global.rules = ensureArr(state.global.rules).map(normalizeRule);

            state.local = ensureObj(state.local, { order: [], sets: {} });
            state.local.order = ensureArr(state.local.order);
            state.local.sets = ensureObj(state.local.sets, {});

            // normalize sets and order
            const normalizedSets = {};
            for (const [id, s] of Object.entries(state.local.sets)) {
                const next = normalizeLocalSet({ ...s, id });
                normalizedSets[next.id] = next;
            }
            state.local.sets = normalizedSets;
            const existingIds = new Set(Object.keys(state.local.sets));
            state.local.order = state.local.order.filter(id => existingIds.has(id));
            for (const id of existingIds) {
                if (!state.local.order.includes(id)) state.local.order.push(id);
            }

            state.session = ensureObj(state.session, {});
            for (const [sid, v] of Object.entries(state.session)) {
                const obj = ensureObj(v, {});
                state.session[sid] = {
                    enabled: obj.enabled !== false,
                    rules: ensureArr(obj.rules).map(normalizeRule),
                };
            }

            await this.persist(state);
        }

        this.state = state;
        this.isLoaded = true;
        return this.state;
    }

    async persist(next = this.state) {
        this.state = next;
        try {
            await safeInvoke('save_kv', { name: STORE_KEY, data: this.state });
        } catch (err) {
            logger.warn('save_kv regex store failed (可能非 Tauri)，回退 localStorage', err);
            try {
                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
            } catch {}
        }
    }

    getState() {
        return this.state ? clone(this.state) : null;
    }

    /* ---------------- Global ---------------- */
    getGlobal() {
        return clone(this.state?.global || { enabled: true, rules: [] });
    }

    async setGlobal(next) {
        await this.ready;
        this.state.global = {
            enabled: next?.enabled !== false,
            rules: ensureArr(next?.rules).map(normalizeRule),
        };
        await this.persist();
        return this.getGlobal();
    }

    /* ---------------- Local sets ---------------- */
    listLocalSets() {
        const order = ensureArr(this.state?.local?.order);
        const sets = ensureObj(this.state?.local?.sets, {});
        return order.map(id => sets[id]).filter(Boolean).map(clone);
    }

    getLocalSet(id) {
        const s = this.state?.local?.sets?.[id];
        return s ? clone(s) : null;
    }

    async upsertLocalSet({ id, name, enabled, bind, rules }) {
        await this.ready;
        const next = normalizeLocalSet({ id, name, enabled, bind, rules });
        this.state.local ||= { order: [], sets: {} };
        this.state.local.sets ||= {};
        this.state.local.order ||= [];
        this.state.local.sets[next.id] = next;
        if (!this.state.local.order.includes(next.id)) this.state.local.order.push(next.id);
        await this.persist();
        return next.id;
    }

    async removeLocalSet(id) {
        await this.ready;
        if (!id) return;
        delete this.state?.local?.sets?.[id];
        if (Array.isArray(this.state?.local?.order)) {
            this.state.local.order = this.state.local.order.filter(x => x !== id);
        }
        await this.persist();
    }

    /* ---------------- Session ---------------- */
    getSession(sessionId) {
        const sid = String(sessionId || '');
        if (!sid) return { enabled: true, rules: [] };
        const v = this.state?.session?.[sid];
        if (!v) return { enabled: true, rules: [] };
        return clone(v);
    }

    async setSession(sessionId, next) {
        await this.ready;
        const sid = String(sessionId || '');
        if (!sid) return;
        this.state.session ||= {};
        this.state.session[sid] = {
            enabled: next?.enabled !== false,
            rules: ensureArr(next?.rules).map(normalizeRule),
        };
        await this.persist();
        return this.getSession(sid);
    }

    /* ---------------- Apply ---------------- */
    computeActiveRules(ctx = {}, when = 'both') {
        const out = [];
        const w = when === 'input' || when === 'output' ? when : 'both';

        const g = this.state?.global;
        if (g?.enabled !== false) {
            for (const r of ensureArr(g?.rules)) {
                if (r?.enabled === false) continue;
                if (r.when === 'both' || r.when === w) out.push(r);
            }
        }

        const sets = ensureObj(this.state?.local?.sets, {});
        const order = ensureArr(this.state?.local?.order);
        for (const id of order) {
            const s = sets[id];
            if (!s || s.enabled === false) continue;
            const bind = s.bind;
            // local set without bind: treat as disabled by default (to keep "局部"语义清晰)
            if (!bind) continue;
            if (!matchBind(bind, ctx)) continue;
            for (const r of ensureArr(s.rules)) {
                if (r?.enabled === false) continue;
                if (r.when === 'both' || r.when === w) out.push(r);
            }
        }

        const sid = String(ctx?.sessionId || '');
        const ses = sid ? this.state?.session?.[sid] : null;
        if (ses?.enabled !== false) {
            for (const r of ensureArr(ses?.rules)) {
                if (r?.enabled === false) continue;
                if (r.when === 'both' || r.when === w) out.push(r);
            }
        }

        return out.map(normalizeRule);
    }

    apply(text, ctx = {}, when = 'both') {
        const raw = String(text ?? '');
        if (!raw) return raw;
        const rules = this.computeActiveRules(ctx, when);
        let out = raw;
        for (const r of rules) {
            const pattern = String(r.pattern || '');
            if (!pattern) continue;
            try {
                const flags = (r.flags === undefined || r.flags === null) ? 'g' : String(r.flags);
                const re = new RegExp(pattern, flags);
                out = out.replace(re, String(r.replacement ?? ''));
            } catch (err) {
                // ignore invalid regex
                continue;
            }
        }
        return out;
    }
}
