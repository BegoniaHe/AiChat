/**
 * Prompt Preset Store (SillyTavern-like)
 * - Persists selected presets and custom edits to disk (Tauri save_kv/load_kv)
 * - Loads bundled ST default presets from `assets/presets/st-defaults.json`
 */

import { logger } from '../utils/logger.js';

const safeInvoke = async (cmd, args) => {
    const invoker = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INVOKE__;
    if (typeof invoker !== 'function') {
        throw new Error('Tauri invoke not available');
    }
    return invoker(cmd, args);
};

const STORE_KEY = 'prompt_preset_store_v1';

const genId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const clone = (v) => {
    try {
        return structuredClone(v);
    } catch {
        return JSON.parse(JSON.stringify(v));
    }
};

const normalizeType = (type) => {
    const t = String(type || '').toLowerCase();
    if (t === 'sysprompt' || t === 'context' || t === 'instruct' || t === 'openai') return t;
    throw new Error(`Unknown preset type: ${type}`);
};

const ensureObj = (v, fallback) => (v && typeof v === 'object') ? v : fallback;

const makeDefaultState = (defaultsByType) => {
    const findIdByName = (type, name) => {
        const entries = Object.entries(defaultsByType?.[type] || {});
        const hit = entries.find(([_, p]) => (p?.name || '') === name) || entries[0];
        return hit ? hit[0] : null;
    };

    const ctxId = findIdByName('context', 'Default') || findIdByName('context', 'ChatML');
    const sysId = findIdByName('sysprompt', 'Neutral - Chat') || findIdByName('sysprompt', 'Roleplay - Immersive');
    const insId = findIdByName('instruct', 'ChatML') || findIdByName('instruct', 'Llama 3 Instruct');
    const openaiId = findIdByName('openai', 'Default');

    return {
        version: 1,
        presets: {
            sysprompt: defaultsByType?.sysprompt || {},
            context: defaultsByType?.context || {},
            instruct: defaultsByType?.instruct || {},
            openai: defaultsByType?.openai || {},
        },
        active: {
            sysprompt: sysId,
            context: ctxId,
            instruct: insId,
            openai: openaiId,
        },
        enabled: {
            sysprompt: true,
            context: true,
            instruct: false,
            openai: true,
        }
    };
};

export class PresetStore {
    constructor() {
        this.state = null;
        this.isLoaded = false;
        this.ready = this.load();
    }

    async loadBundledDefaults() {
        try {
            const resp = await fetch('./assets/presets/st-defaults.json', { cache: 'no-cache' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();
            const types = ensureObj(json?.types, {});
            const byType = {
                sysprompt: ensureObj(types.sysprompt, {}),
                context: ensureObj(types.context, {}),
                instruct: ensureObj(types.instruct, {}),
                openai: ensureObj(types.openai, {}),
            };

            // Convert {name -> presetData} to {id -> presetDataWithName} (stable id = name)
            const out = {};
            for (const type of Object.keys(byType)) {
                out[type] = {};
                for (const [name, data] of Object.entries(byType[type])) {
                    out[type][name] = { ...data, name: data?.name || name };
                }
            }
            return out;
        } catch (err) {
            logger.warn('加载内置 ST 预设失败', err);
            return { sysprompt: {}, context: {}, instruct: {}, openai: {} };
        }
    }

    async load() {
        if (this.isLoaded && this.state) return this.state;

        let state = null;
        try {
            const kv = await safeInvoke('load_kv', { name: STORE_KEY });
            if (kv && typeof kv === 'object' && Object.keys(kv).length) state = kv;
        } catch (err) {
            logger.debug('load_kv preset store failed (可能非 Tauri)', err);
        }

        if (!state) {
            try {
                const raw = localStorage.getItem(STORE_KEY);
                if (raw) state = JSON.parse(raw);
            } catch {}
        }

        const defaults = await this.loadBundledDefaults();
        if (!state || typeof state !== 'object' || !state.presets) {
            state = makeDefaultState(defaults);
            await this.persist(state);
        } else {
            // ensure structure and merge defaults (do not overwrite user edits)
            state.version = 1;
            state.enabled = ensureObj(state.enabled, {});
            state.active = ensureObj(state.active, {});
            state.presets = ensureObj(state.presets, {});

            for (const type of ['sysprompt', 'context', 'instruct', 'openai']) {
                state.presets[type] = ensureObj(state.presets[type], {});
                for (const [id, data] of Object.entries(defaults[type] || {})) {
                    if (!state.presets[type][id]) state.presets[type][id] = data;
                }
                if (!state.active[type] || !state.presets[type][state.active[type]]) {
                    state.active[type] = Object.keys(state.presets[type])[0] || null;
                }
                if (typeof state.enabled[type] !== 'boolean') {
                    state.enabled[type] = (type === 'sysprompt' || type === 'context' || type === 'openai');
                }
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
            logger.warn('save_kv preset store failed (可能非 Tauri)，回退 localStorage', err);
            try {
                localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
            } catch {}
        }
    }

    getState() {
        return this.state ? clone(this.state) : null;
    }

    async importState(imported, { mode = 'merge' } = {}) {
        await this.ready;
        if (!imported || typeof imported !== 'object') throw new Error('无效的预设设定档');
        if (!imported.presets || !imported.active || !imported.enabled) throw new Error('不是预设设定档格式');

        const next = clone(this.state || {});
        if (mode === 'replace') {
            this.state = clone(imported);
            this.isLoaded = false;
            await this.persist(this.state);
            await this.load(); // normalize + merge defaults
            return this.getState();
        }

        // merge: overwrite by id, keep existing otherwise
        for (const t of ['sysprompt', 'context', 'instruct', 'openai']) {
            next.presets ||= {};
            next.presets[t] ||= {};
            const incoming = imported.presets?.[t];
            if (incoming && typeof incoming === 'object') {
                for (const [id, data] of Object.entries(incoming)) {
                    next.presets[t][id] = data;
                }
            }
            if (imported.active?.[t]) next.active ||= {};
            if (imported.active?.[t]) next.active[t] = imported.active[t];
            if (typeof imported.enabled?.[t] === 'boolean') {
                next.enabled ||= {};
                next.enabled[t] = imported.enabled[t];
            }
        }

        this.state = next;
        this.isLoaded = false;
        await this.persist(this.state);
        await this.load();
        return this.getState();
    }

    getEnabled(type) {
        const t = normalizeType(type);
        return Boolean(this.state?.enabled?.[t]);
    }

    async setEnabled(type, enabled) {
        await this.ready;
        const t = normalizeType(type);
        this.state.enabled[t] = Boolean(enabled);
        await this.persist();
        return this.getState();
    }

    list(type) {
        const t = normalizeType(type);
        const entries = Object.entries(this.state?.presets?.[t] || {});
        entries.sort((a, b) => String(a[1]?.name || a[0]).localeCompare(String(b[1]?.name || b[0])));
        return entries.map(([id, data]) => ({ id, ...clone(data) }));
    }

    getActiveId(type) {
        const t = normalizeType(type);
        return this.state?.active?.[t] || null;
    }

    getActive(type) {
        const t = normalizeType(type);
        const id = this.getActiveId(t);
        return id ? clone(this.state?.presets?.[t]?.[id] || null) : null;
    }

    async setActive(type, id) {
        await this.ready;
        const t = normalizeType(type);
        if (!id || !this.state?.presets?.[t]?.[id]) return this.getState();
        this.state.active[t] = id;
        await this.persist();
        return this.getState();
    }

    async upsert(type, { id, name, data }) {
        await this.ready;
        const t = normalizeType(type);
        const presetId = id || genId(`preset-${t}`);
        const next = { ...(data || {}), name: String(name || data?.name || presetId) };
        this.state.presets[t][presetId] = next;
        this.state.active[t] = presetId;
        await this.persist();
        return presetId;
    }

    async remove(type, id) {
        await this.ready;
        const t = normalizeType(type);
        if (!id || !this.state?.presets?.[t]?.[id]) return;
        delete this.state.presets[t][id];
        const ids = Object.keys(this.state.presets[t]);
        if (this.state.active[t] === id) {
            this.state.active[t] = ids[0] || null;
        }
        await this.persist();
    }
}
