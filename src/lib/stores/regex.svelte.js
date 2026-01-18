/**
 * Regex Store (Svelte 5 version)
 * SillyTavern-like regex replacement system with scoped rules
 * Scopes:
 *  1) global: always applies
 *  2) local: bound to preset/world (auto applies when bound target active)
 *  3) session: per chat session id
 */

import { safeInvoke } from '$utils/tauri';

// ST-like placement enum
export const regex_placement = {
    USER_INPUT: 1,
    AI_OUTPUT: 2,
    SLASH_COMMAND: 3,
    WORLD_INFO: 5,
    REASONING: 6,
};

export const substitute_find_regex = {
    NONE: 0,
    RAW: 1,
    ESCAPED: 2,
};

const STORE_KEY = 'regex_store_v1';

// Helpers
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
const ensureNumOrNull = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/**
 * Normalize a regex rule (ST-like format)
 * Also handles legacy {when/pattern/flags/replacement} format
 */
function normalizeRule(r = {}) {
    // Legacy format conversion
    const hasLegacy = ('pattern' in r) || ('when' in r) || ('replacement' in r);
    if (hasLegacy && !('findRegex' in r)) {
        const when = ['input', 'output', 'both'].includes(r.when) ? r.when : 'both';
        const pattern = String(r.pattern || '');
        const flags = (r.flags === undefined || r.flags === null) ? 'g' : String(r.flags);
        const repl = String(r.replacement ?? '');

        const placement = [];
        if (when === 'input' || when === 'both') placement.push(regex_placement.USER_INPUT);
        if (when === 'output' || when === 'both') placement.push(regex_placement.AI_OUTPUT);

        return {
            id: r.id || genId('re'),
            scriptName: String(r.name || '').trim(),
            findRegex: pattern ? `/${pattern}/${flags}` : '',
            replaceString: repl,
            trimStrings: [],
            placement,
            disabled: r.enabled === false,
            markdownOnly: false,
            promptOnly: false,
            runOnEdit: false,
            substituteRegex: substitute_find_regex.NONE,
            minDepth: null,
            maxDepth: null,
        };
    }

    // ST-like format
    const placement = Array.isArray(r.placement)
        ? r.placement.map(x => Number(x)).filter(n => Number.isFinite(n))
        : [];

    return {
        id: r.id || genId('re'),
        scriptName: String(r.scriptName || r.name || '').trim(),
        findRegex: String(r.findRegex || ''),
        replaceString: String(r.replaceString ?? r.replacement ?? ''),
        trimStrings: Array.isArray(r.trimStrings)
            ? r.trimStrings.map(s => String(s || '')).filter(Boolean)
            : [],
        placement,
        disabled: Boolean(r.disabled),
        markdownOnly: Boolean(r.markdownOnly),
        promptOnly: Boolean(r.promptOnly),
        runOnEdit: Boolean(r.runOnEdit),
        substituteRegex: [1, 2].includes(r.substituteRegex) ? Number(r.substituteRegex) : 0,
        minDepth: ensureNumOrNull(r.minDepth),
        maxDepth: ensureNumOrNull(r.maxDepth),
    };
}

/**
 * Normalize a local regex set
 */
function normalizeLocalSet(s = {}) {
    return {
        id: s.id || genId('re-set'),
        name: String(s.name || '未命名正则').trim() || '未命名正则',
        enabled: s.enabled !== false,
        // bind: null | { type:'preset', presetType, presetId } | { type:'world', worldId }
        bind: (s.bind && typeof s.bind === 'object') ? s.bind : null,
        rules: ensureArr(s.rules).map(normalizeRule),
        createdAt: s.createdAt || Date.now(),
        updatedAt: Date.now(),
    };
}

/**
 * Create default empty state
 */
function makeDefaultState() {
    return {
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
    };
}

/**
 * Check if binding matches current context
 */
function matchBind(bind, ctx) {
    if (!bind || typeof bind !== 'object') return false;

    if (bind.type === 'preset') {
        const pt = String(bind.presetType || '');
        const pid = String(bind.presetId || '');
        if (!pt || !pid) return false;
        return String(ctx?.activePresets?.[pt] || '') === pid;
    }

    if (bind.type === 'world') {
        const wid = String(bind.worldId || '');
        if (!wid) return false;
        const primary = String(ctx?.worldId || '');
        if (primary === wid) return true;
        const list = Array.isArray(ctx?.worldIds) ? ctx.worldIds.map(String) : [];
        return list.includes(wid);
    }

    return false;
}

/**
 * RegexStore - Svelte 5 reactive store for regex replacement rules
 */
export class RegexStore {
    // Reactive state
    #state = $state(null);
    #isLoaded = $state(false);
    #loading = $state(false);

    ready;

    constructor() {
        this.ready = this.load();
    }

    // Getters
    get state() { return this.#state; }
    get isLoaded() { return this.#isLoaded; }
    get loading() { return this.#loading; }

    /**
     * Load state from storage
     */
    async load() {
        if (this.#isLoaded && this.#state) return this.#state;

        this.#loading = true;
        let state = null;

        // Try Tauri KV
        try {
            const kv = await safeInvoke('load_kv', { name: STORE_KEY });
            if (kv && typeof kv === 'object' && Object.keys(kv).length) {
                state = kv;
            }
        } catch (err) {
            console.debug('load_kv regex store failed:', err);
        }

        // Fallback to localStorage
        if (!state) {
            try {
                const raw = localStorage.getItem(STORE_KEY);
                if (raw) state = JSON.parse(raw);
            } catch { }
        }

        // Initialize or normalize
        if (!state || typeof state !== 'object') {
            state = makeDefaultState();
            await this.persist(state);
        } else {
            // Normalize existing state
            state.version = 1;
            state.global = ensureObj(state.global, { enabled: true, rules: [] });
            state.global.enabled = state.global.enabled !== false;
            state.global.rules = ensureArr(state.global.rules).map(normalizeRule);

            state.local = ensureObj(state.local, { order: [], sets: {} });
            state.local.order = ensureArr(state.local.order);
            state.local.sets = ensureObj(state.local.sets, {});

            // Normalize local sets
            const normalizedSets = {};
            for (const [id, s] of Object.entries(state.local.sets)) {
                const next = normalizeLocalSet({ ...s, id });
                normalizedSets[next.id] = next;
            }
            state.local.sets = normalizedSets;

            // Sync order with existing sets
            const existingIds = new Set(Object.keys(state.local.sets));
            state.local.order = state.local.order.filter(id => existingIds.has(id));
            for (const id of existingIds) {
                if (!state.local.order.includes(id)) state.local.order.push(id);
            }

            // Normalize session data
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

        this.#state = state;
        this.#isLoaded = true;
        this.#loading = false;

        return this.#state;
    }

    /**
     * Persist state to storage
     */
    async persist(next = this.#state) {
        this.#state = next;

        try {
            await safeInvoke('save_kv', { name: STORE_KEY, data: this.#state });
        } catch (err) {
            console.warn('save_kv regex store failed, falling back to localStorage:', err);
            try {
                localStorage.setItem(STORE_KEY, JSON.stringify(this.#state));
            } catch { }
        }
    }

    /**
     * Get state clone
     */
    getState() {
        return this.#state ? clone(this.#state) : null;
    }

    // =============== Global Rules ===============

    getGlobal() {
        return clone(this.#state?.global || { enabled: true, rules: [] });
    }

    async setGlobal(next) {
        await this.ready;
        this.#state.global = {
            enabled: next?.enabled !== false,
            rules: ensureArr(next?.rules).map(normalizeRule),
        };
        await this.persist();
        return this.getGlobal();
    }

    // =============== Local Sets ===============

    listLocalSets() {
        const order = ensureArr(this.#state?.local?.order);
        const sets = ensureObj(this.#state?.local?.sets, {});
        return order.map(id => sets[id]).filter(Boolean).map(clone);
    }

    getLocalSet(id) {
        const s = this.#state?.local?.sets?.[id];
        return s ? clone(s) : null;
    }

    async upsertLocalSet({ id, name, enabled, bind, rules }) {
        await this.ready;
        const next = normalizeLocalSet({ id, name, enabled, bind, rules });

        this.#state.local ||= { order: [], sets: {} };
        this.#state.local.sets ||= {};
        this.#state.local.order ||= [];

        this.#state.local.sets[next.id] = next;
        if (!this.#state.local.order.includes(next.id)) {
            this.#state.local.order.push(next.id);
        }

        await this.persist();
        return next.id;
    }

    async removeLocalSet(id) {
        await this.ready;
        if (!id) return;

        delete this.#state?.local?.sets?.[id];
        if (Array.isArray(this.#state?.local?.order)) {
            this.#state.local.order = this.#state.local.order.filter(x => x !== id);
        }

        await this.persist();
    }

    /**
     * Auto-sync preset bindings when active preset changes
     */
    async syncPresetBindings(activePresets = {}) {
        await this.ready;
        const sets = ensureObj(this.#state?.local?.sets, {});
        let changed = false;

        for (const s of Object.values(sets)) {
            if (!s || typeof s !== 'object') continue;
            const bind = s.bind;
            if (!bind || typeof bind !== 'object' || bind.type !== 'preset') continue;

            const pt = String(bind.presetType || '').trim();
            const pid = String(bind.presetId || '').trim();
            if (!pt || !pid) continue;

            const shouldEnable = String(activePresets?.[pt] || '') === pid;
            if (s.enabled !== shouldEnable) {
                s.enabled = shouldEnable;
                s.updatedAt = Date.now();
                changed = true;
            }
        }

        if (changed) await this.persist();
        return changed;
    }

    // =============== Session Rules ===============

    getSession(sessionId) {
        const sid = String(sessionId || '');
        if (!sid) return { enabled: true, rules: [] };
        const v = this.#state?.session?.[sid];
        return v ? clone(v) : { enabled: true, rules: [] };
    }

    async setSession(sessionId, next) {
        await this.ready;
        const sid = String(sessionId || '');
        if (!sid) return;

        this.#state.session ||= {};
        this.#state.session[sid] = {
            enabled: next?.enabled !== false,
            rules: ensureArr(next?.rules).map(normalizeRule),
        };

        await this.persist();
        return this.getSession(sid);
    }

    // =============== Rule Application ===============

    /**
     * Compute all active rules for current context
     */
    computeActiveRules(ctx = {}) {
        const out = [];

        // Global rules
        const g = this.#state?.global;
        if (g?.enabled !== false) {
            for (const r of ensureArr(g?.rules)) {
                if (r) out.push(r);
            }
        }

        // Local sets (only bound + enabled)
        const sets = ensureObj(this.#state?.local?.sets, {});
        const order = ensureArr(this.#state?.local?.order);
        for (const id of order) {
            const s = sets[id];
            if (!s || s.enabled === false) continue;
            const bind = s.bind;
            if (!bind) continue; // unbound local sets are disabled by default
            if (!matchBind(bind, ctx)) continue;
            for (const r of ensureArr(s.rules)) {
                if (r) out.push(r);
            }
        }

        // Session rules
        const sid = String(ctx?.sessionId || '');
        const ses = sid ? this.#state?.session?.[sid] : null;
        if (ses?.enabled !== false) {
            for (const r of ensureArr(ses?.rules)) {
                if (r) out.push(r);
            }
        }

        return out.map(normalizeRule);
    }

    /**
     * Parse regex string (ST-like format: /pattern/flags)
     */
    regexFromString(input) {
        try {
            const str = String(input ?? '');
            const m = str.match(/(\/?)(.+)\1([a-z]*)/i);
            if (!m) return;
            if (m[3] && !/^(?!.*?(.).*?\1)[gmixXsuUAJ]+$/.test(m[3])) {
                return RegExp(str);
            }
            return new RegExp(m[2], m[3]);
        } catch {
            return;
        }
    }

    /**
     * Escape special characters for regex
     */
    sanitizeRegexMacro(x) {
        if (!x || typeof x !== 'string') return x;
        return x.replace(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/gs, (s) => {
            switch (s) {
                case '\n': return '\\\\n';
                case '\r': return '\\\\r';
                case '\t': return '\\\\t';
                case '\v': return '\\\\v';
                case '\f': return '\\\\f';
                case '\0': return '\\\\0';
                default: return '\\\\' + s;
            }
        });
    }

    /**
     * Apply macro substitution
     */
    applyMacros(text, vars, { escape = false } = {}) {
        const raw = String(text ?? '');
        if (!raw) return '';
        return raw.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => {
            let v = vars?.[key];
            v = (v === null || v === undefined) ? '' : String(v);
            return escape ? this.sanitizeRegexMacro(v) : v;
        });
    }

    /**
     * Filter string by removing trim strings
     */
    filterString(rawString, trimStrings = [], vars) {
        let out = String(rawString ?? '');
        (Array.isArray(trimStrings) ? trimStrings : []).forEach((t) => {
            const sub = this.applyMacros(String(t || ''), vars, { escape: false });
            if (sub) out = out.split(sub).join('');
        });
        return out;
    }

    /**
     * Run a single regex script
     */
    runRegexScript(script, rawString, vars) {
        let newString = String(rawString ?? '');
        if (!script || script.disabled || !script.findRegex || !newString) {
            return newString;
        }

        const getRegexString = () => {
            const mode = Number(script.substituteRegex ?? 0);
            switch (mode) {
                case substitute_find_regex.RAW:
                    return this.applyMacros(script.findRegex, vars, { escape: false });
                case substitute_find_regex.ESCAPED:
                    return this.applyMacros(script.findRegex, vars, { escape: true });
                default:
                    return script.findRegex;
            }
        };

        const regexString = getRegexString();
        const findRegex = this.regexFromString(regexString);
        if (!findRegex) return newString;

        const self = this;
        newString = newString.replace(findRegex, function (...args) {
            const replaceString = String(script.replaceString ?? '').replace(/{{match}}/gi, '$0');
            const replaceWithGroups = replaceString.replace(/\$(\d+)|\$<([^>]+)>/g, (_m, num, groupName) => {
                let match = '';
                if (num) {
                    match = args[Number(num)] || '';
                } else if (groupName) {
                    const groups = args[args.length - 1];
                    match = (groups && typeof groups === 'object' && groups[groupName]) ? groups[groupName] : '';
                }
                if (!match) return '';
                return self.filterString(match, script.trimStrings, vars);
            });
            return self.applyMacros(replaceWithGroups, vars, { escape: false });
        });

        return newString;
    }

    /**
     * Apply all matching regex rules to text
     */
    apply(text, ctx = {}, placement, { isMarkdown = false, isPrompt = false, isEdit = false, depth } = {}) {
        const raw = String(text ?? '');
        if (!raw) return raw;

        const scripts = this.computeActiveRules(ctx);
        const vars = ctx?.macroVars || {};
        let out = raw;
        const p = Number(placement);

        for (const s of scripts) {
            if (!s || s.disabled) continue;

            // Check markdown/prompt flags
            const mdOnly = Boolean(s.markdownOnly);
            const prOnly = Boolean(s.promptOnly);
            const allow =
                (mdOnly && isMarkdown) ||
                (prOnly && isPrompt) ||
                (!mdOnly && !prOnly && (isPrompt || (!isMarkdown && !isPrompt)));
            if (!allow) continue;

            // Check edit flag
            if (isEdit && !s.runOnEdit) continue;

            // Check depth constraints
            if (typeof depth === 'number' && Number.isFinite(depth)) {
                const minD = typeof s.minDepth === 'number' && Number.isFinite(s.minDepth) ? s.minDepth : null;
                const maxD = typeof s.maxDepth === 'number' && Number.isFinite(s.maxDepth) ? s.maxDepth : null;
                if (minD !== null && minD >= -1 && depth < minD) continue;
                if (maxD !== null && maxD >= 0 && depth > maxD) continue;
                if (minD !== null && maxD !== null && maxD < minD) continue;
            }

            // Check placement
            const placements = Array.isArray(s.placement) ? s.placement : [];
            if (Number.isFinite(p) && placements.length && !placements.includes(p)) continue;

            out = this.runRegexScript(s, out, vars);
        }

        return out;
    }
}

// Singleton instance
let regexStoreInstance = null;

/**
 * Get or create the regex store instance
 */
export function getRegexStore() {
    if (!regexStoreInstance) {
        regexStoreInstance = new RegexStore();
    }
    return regexStoreInstance;
}
