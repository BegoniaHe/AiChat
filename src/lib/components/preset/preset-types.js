/**
 * Preset Panel - Type Definitions and Constants
 */

export const PRESET_TYPES = [
    { id: 'sysprompt', label: '系统提示词' },
    { id: 'chatprompts', label: '聊天提示词' },
    { id: 'context', label: '上下文模板' },
    { id: 'instruct', label: 'Instruct 模板' },
    { id: 'reasoning', label: '推理格式' },
    { id: 'openai', label: '生成参数' },
    { id: 'custom', label: '自定义' },
];

export const EXT_PROMPT_TYPES = {
    NONE: -1,
    IN_PROMPT: 0,
    IN_CHAT: 1,
    BEFORE_PROMPT: 2,
    SYSTEM_DEPTH_1: 3, // 固定：history 后（<chat_guide>）
};

export const EXT_PROMPT_ROLES = {
    SYSTEM: 0,
    USER: 1,
    ASSISTANT: 2,
};

export const OPENAI_KNOWN_BLOCKS = {
    main: { label: 'Main Prompt', marker: false },
    nsfw: { label: 'Auxiliary Prompt', marker: false },
    dialogueExamples: { label: 'Chat Examples', marker: true },
    jailbreak: { label: 'Post-History Instructions', marker: false },
    chatHistory: { label: 'Chat History', marker: true },
    worldInfoAfter: { label: 'World Info (after)', marker: true },
    worldInfoBefore: { label: 'World Info (before)', marker: true },
    enhanceDefinitions: { label: 'Enhance Definitions', marker: false },
    charDescription: { label: 'Char Description', marker: true },
    charPersonality: { label: 'Char Personality', marker: true },
    scenario: { label: 'Scenario', marker: true },
    personaDescription: { label: 'Persona Description', marker: true },
};

/**
 * Convert role ID to name
 * @param {string|number} role - Role ID or name
 * @returns {string} - Role name
 */
export function roleIdToName(role) {
    const r = String(role || '').toLowerCase();
    if (r === 'system' || r === 'user' || r === 'assistant') return r;
    return 'system';
}

/**
 * Convert role name to ID
 * @param {string} name - Role name
 * @returns {number} - Role ID
 */
export function roleNameToId(name) {
    const r = String(name || '').toLowerCase();
    if (r === 'user') return EXT_PROMPT_ROLES.USER;
    if (r === 'assistant') return EXT_PROMPT_ROLES.ASSISTANT;
    return EXT_PROMPT_ROLES.SYSTEM;
}

/**
 * Deep clone utility
 * @template T
 * @param {T} v - Value to clone
 * @returns {T} - Cloned value
 */
export function deepClone(v) {
    try {
        return structuredClone(v);
    } catch {
        return JSON.parse(JSON.stringify(v));
    }
}

/**
 * Get number with fallback
 * @param {any} val - Value to parse
 * @param {number} fallback - Fallback value
 * @returns {number}
 */
export function getNum(val, fallback) {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Get integer with fallback
 * @param {any} val - Value to parse
 * @param {number} fallback - Fallback value
 * @returns {number}
 */
export function getInt(val, fallback) {
    const n = Number(val);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * Get type label
 * @param {string} type - Preset type
 * @returns {string}
 */
export function getTypeLabel(type) {
    const hit = PRESET_TYPES.find(t => t.id === type);
    return hit?.label || String(type || '');
}

/**
 * Get store type from active type
 * @param {string} activeType - Active tab type
 * @returns {string}
 */
export function getStoreType(activeType) {
    if (activeType === 'custom') return 'openai';
    if (activeType === 'chatprompts') return 'sysprompt';
    return activeType;
}

/**
 * Detect preset type from object
 * @param {any} obj - Object to detect
 * @returns {string|null}
 */
export function detectPresetType(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.presets && obj.active && obj.enabled) return 'store';
    if (typeof obj.story_string === 'string') return 'context';
    if (typeof obj.content === 'string' && ('post_history' in obj)) return 'sysprompt';
    if (typeof obj.input_sequence === 'string' || typeof obj.output_sequence === 'string') return 'instruct';
    if (
        typeof obj.prefix === 'string' &&
        typeof obj.suffix === 'string' &&
        typeof obj.separator === 'string'
    ) return 'reasoning';
    if (
        'temperature' in obj ||
        'top_p' in obj ||
        'temp_openai' in obj ||
        'top_p_openai' in obj ||
        'openai_max_context' in obj ||
        'openai_max_tokens' in obj ||
        ('prompts' in obj) ||
        ('prompt_order' in obj)
    ) return 'openai';
    return null;
}

/**
 * Download JSON file
 * @param {string} filename - Filename to download
 * @param {any} dataObj - Object to serialize
 */
export function downloadJson(filename, dataObj) {
    const data = JSON.stringify(dataObj, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * Convert ST regex scripts to rules format
 * @param {any[]} regexes - Array of regex scripts
 * @returns {Object[]}
 */
export function convertStRegexScriptsToRules(regexes = []) {
    const scripts = Array.isArray(regexes) ? regexes : [];
    /** @type {Object[]} */
    const rules = [];
    scripts.forEach((s) => {
        const findRegex = String(s?.findRegex || '').trim();
        if (!findRegex) return;
        rules.push({
            id: s?.id || undefined,
            scriptName: String(s?.scriptName || '').trim(),
            findRegex,
            replaceString: String(s?.replaceString ?? ''),
            trimStrings: Array.isArray(s?.trimStrings) ? s.trimStrings : [],
            placement: Array.isArray(s?.placement) ? s.placement : [],
            disabled: Boolean(s?.disabled),
            markdownOnly: Boolean(s?.markdownOnly),
            promptOnly: Boolean(s?.promptOnly),
            runOnEdit: Boolean(s?.runOnEdit),
            substituteRegex: Number(s?.substituteRegex ?? 0),
            minDepth: s?.minDepth ?? null,
            maxDepth: s?.maxDepth ?? null,
        });
    });
    return rules;
}

/**
 * Get rule signature for deduplication
 * @param {any} r - Rule object
 * @returns {string}
 */
export function getRuleSignature(r) {
    const findRegex = String(r?.findRegex || '').trim();
    const replaceString = String(r?.replaceString ?? '');
    const trim = Array.isArray(r?.trimStrings) ? r.trimStrings.map(String).join('\n') : '';
    const placement = Array.isArray(r?.placement) ? r.placement.map((/** @type {any} */ n) => Number(n)).filter(Number.isFinite).sort((/** @type {number} */ a, /** @type {number} */ b) => a - b).join(',') : '';
    const disabled = r?.disabled ? '1' : '0';
    const markdownOnly = r?.markdownOnly ? '1' : '0';
    const promptOnly = r?.promptOnly ? '1' : '0';
    const runOnEdit = r?.runOnEdit ? '1' : '0';
    const sub = String(Number(r?.substituteRegex ?? 0));
    const minD = (r?.minDepth === null || r?.minDepth === undefined || r?.minDepth === '') ? '' : String(r?.minDepth);
    const maxD = (r?.maxDepth === null || r?.maxDepth === undefined || r?.maxDepth === '') ? '' : String(r?.maxDepth);
    if (!findRegex && String(r?.pattern || '').trim()) {
        const when = String(r?.when || 'both');
        const pattern = String(r?.pattern || '').trim();
        const flags = (r?.flags === undefined || r?.flags === null) ? 'g' : String(r?.flags);
        const replacement = String(r?.replacement ?? '');
        return `${when}\u0000${pattern}\u0000${flags}\u0000${replacement}`;
    }
    return [
        findRegex, replaceString, trim, placement,
        disabled, markdownOnly, promptOnly, runOnEdit, sub, minD, maxD
    ].join('\u0000');
}

/**
 * Extract ST RegexBinding sets from object
 * @param {any} obj - Object to extract from
 * @param {Function} [getRuleSig] - Optional function to get rule signature
 * @returns {Array<{name: string, enabled: boolean, rules: Object[]}>}
 */
export function extractStRegexBindingSets(obj, getRuleSig) {
    /** @type {Array<{name: string, enabled: boolean, rules: Object[]}>} */
    const out = [];
    /** @type {Set<string>} */
    const seenScriptIds = new Set();

    /** @param {any} container */
    const tryAddRegexes = (container) => {
        const regexes = container?.RegexBinding?.regexes;
        if (!Array.isArray(regexes) || !regexes.length) return;
        const filtered = regexes.filter((/** @type {any} */ r) => {
            const id = String(r?.id || '');
            if (!id) return true;
            if (seenScriptIds.has(id)) return false;
            seenScriptIds.add(id);
            return true;
        });
        if (!filtered.length) return;
        const rules = convertStRegexScriptsToRules(filtered);
        if (!rules.length) return;
        out.push({ name: 'RegexBinding', enabled: true, rules });
    };

    /** @param {string} s */
    const tryParseJsonString = (s) => {
        const raw = String(s || '').trim();
        if (!raw) return null;
        if (!raw.includes('RegexBinding')) return null;
        if (!(raw.startsWith('{') || raw.startsWith('['))) return null;
        try { return JSON.parse(raw); } catch { return null; }
    };

    /**
     * @param {any} node
     * @param {number} depth
     */
    const walk = (node, depth = 0) => {
        if (!node || depth > 18) return;
        if (typeof node === 'string') {
            const parsed = tryParseJsonString(node);
            if (parsed && typeof parsed === 'object') {
                tryAddRegexes(parsed);
                walk(parsed, depth + 1);
            }
            return;
        }
        if (Array.isArray(node)) {
            node.forEach(v => walk(v, depth + 1));
            return;
        }
        if (typeof node === 'object') {
            tryAddRegexes(node);
            for (const v of Object.values(node)) walk(v, depth + 1);
        }
    };

    walk(obj, 0);
    return out;
}
