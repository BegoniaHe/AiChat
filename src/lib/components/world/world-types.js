/**
 * World Info Types and Constants
 */

/** Default entry depth */
export const DEFAULT_DEPTH = 4;

/** Default entry weight */
export const DEFAULT_WEIGHT = 100;

/** Selective logic options */
export const SELECTIVE_LOGIC_OPTIONS = [
    { value: 0, label: 'AND 任一（匹配任一关键词）' },
    { value: 1, label: 'NOT 全部（不匹配全部关键词）' },
    { value: 2, label: 'NOT 任一（不匹配任一关键词）' },
    { value: 3, label: 'AND 全部（匹配全部关键词）' },
];

/** Position options */
export const POSITION_OPTIONS = [
    { value: 0, label: '↑Char（角色前）' },
    { value: 1, label: '↓Char（角色后）' },
    { value: 2, label: '↑AT（作者备注前）' },
    { value: 3, label: '↓AT（作者备注后）' },
    { value: 4, label: '@Depth（按深度插入）' },
    { value: 5, label: '↑EM（例子前）' },
    { value: 6, label: '↓EM（例子后）' },
];

/** Role options */
export const ROLE_OPTIONS = [
    { value: 0, label: 'system' },
    { value: 1, label: 'user' },
    { value: 2, label: 'assistant' },
];

/**
 * Deep clone an object
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
export function deepClone(obj) {
    try {
        return structuredClone(obj);
    } catch {
        return JSON.parse(JSON.stringify(obj || {}));
    }
}

/**
 * Parse number with fallback
 * @param {*} val - Value to parse
 * @param {number} def - Default value
 * @returns {number}
 */
export function toNumber(val, def) {
    const n = Number(val);
    return Number.isFinite(n) ? n : def;
}

/**
 * Normalize value to array of strings
 * @param {*} val - Value to normalize
 * @returns {string[]}
 */
export function normalizeArray(val) {
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
    if (typeof val === 'string') {
        return val.split(/[,，\n\r]/).map(s => s.trim()).filter(Boolean);
    }
    return [];
}

/**
 * @typedef {Object} WorldEntry
 * @property {string} id - Entry ID
 * @property {number|null} uid - Numeric UID
 * @property {string} comment - Title/memo
 * @property {string} title - Same as comment (alias)
 * @property {string} content - Entry content
 * @property {string[]} key - Primary trigger keywords
 * @property {string[]} triggers - Same as key (alias)
 * @property {string[]} keysecondary - Secondary keywords
 * @property {string[]} secondary - Same as keysecondary (alias)
 * @property {number} order - Priority order
 * @property {number} priority - Same as order (alias)
 * @property {number} depth - Insertion depth
 * @property {number} position - Position type
 * @property {number} role - Role for @Depth position
 * @property {boolean} disable - Is disabled
 * @property {boolean} constant - Is always active
 * @property {boolean} selective - Is selective trigger
 * @property {number} selectiveLogic - Selective logic type
 * @property {number} probability - Trigger probability
 * @property {boolean} useProbability - Use probability
 * @property {boolean} ignoreBudget - Ignore token budget
 * @property {boolean} excludeRecursion - Exclude from recursion
 * @property {boolean} preventRecursion - Prevent recursion
 * @property {boolean} vectorized - Is vectorized
 * @property {boolean} addMemo - Add memo to output
 * @property {boolean} matchPersonaDescription - Match persona description
 * @property {boolean} matchCharacterDescription - Match character description
 * @property {boolean} matchCharacterPersonality - Match character personality
 * @property {boolean} matchCharacterDepthPrompt - Match character depth prompt
 * @property {boolean} matchScenario - Match scenario
 * @property {boolean} matchCreatorNotes - Match creator notes
 * @property {string} group - Group name
 * @property {boolean} groupOverride - Allow group override
 * @property {number} groupWeight - Group weight
 * @property {number|null} scanDepth - Scan depth override
 * @property {boolean|null} caseSensitive - Case sensitive override
 * @property {boolean|null} matchWholeWords - Match whole words override
 * @property {boolean|null} useGroupScoring - Use group scoring override
 * @property {string} automationId - Automation ID
 * @property {number|null} sticky - Sticky value
 * @property {number|null} cooldown - Cooldown value
 * @property {number|null} delay - Delay value
 * @property {number} delayUntilRecursion - Delay until recursion
 */

/**
 * Normalize a world entry
 * @param {Partial<WorldEntry>} entry - Entry to normalize
 * @param {number} index - Entry index
 * @returns {WorldEntry}
 */
export function normalizeEntry(entry = {}, index = 0) {
    const e = { ...entry };

    e.id = e.id ?? (Number.isInteger(e.uid) ? String(e.uid) : `entry-${index}`);
    if (e.uid == null && /^\d+$/.test(e.id)) {
        e.uid = Number(e.id);
    }

    const comment = e.comment ?? e.title ?? '';
    e.comment = comment;
    e.title = comment;

    const key = normalizeArray(e.key ?? e.triggers);
    const keysecondary = normalizeArray(e.keysecondary ?? e.secondary);
    e.key = key;
    e.triggers = key;
    e.keysecondary = keysecondary;
    e.secondary = keysecondary;

    const order = toNumber(e.order ?? e.priority, 100);
    e.order = order;
    e.priority = order;

    e.depth = toNumber(e.depth, DEFAULT_DEPTH);
    e.position = toNumber(e.position, 0);
    e.role = toNumber(e.role, 0);

    e.disable = Boolean(e.disable);
    e.constant = Boolean(e.constant);
    e.selective = e.selective !== false;
    e.selectiveLogic = toNumber(e.selectiveLogic, 0);

    // Probability: old format may be 0-1 ratio
    const rawProb = e.probability;
    const probPercent = typeof rawProb === 'number'
        ? (rawProb <= 1 ? Math.round(rawProb * 100) : Math.round(rawProb))
        : 100;
    e.probability = probPercent;
    e.useProbability = e.useProbability !== false;

    e.ignoreBudget = Boolean(e.ignoreBudget);
    e.excludeRecursion = Boolean(e.excludeRecursion);
    e.preventRecursion = Boolean(e.preventRecursion);
    e.vectorized = Boolean(e.vectorized);
    e.addMemo = Boolean(e.addMemo);

    e.matchPersonaDescription = Boolean(e.matchPersonaDescription);
    e.matchCharacterDescription = Boolean(e.matchCharacterDescription);
    e.matchCharacterPersonality = Boolean(e.matchCharacterPersonality);
    e.matchCharacterDepthPrompt = Boolean(e.matchCharacterDepthPrompt);
    e.matchScenario = Boolean(e.matchScenario);
    e.matchCreatorNotes = Boolean(e.matchCreatorNotes);

    e.group = e.group ?? '';
    e.groupOverride = Boolean(e.groupOverride);
    e.groupWeight = toNumber(e.groupWeight, DEFAULT_WEIGHT);

    e.scanDepth = e.scanDepth ?? null;
    e.caseSensitive = e.caseSensitive ?? null;
    e.matchWholeWords = e.matchWholeWords ?? null;
    e.useGroupScoring = e.useGroupScoring ?? null;

    e.automationId = e.automationId ?? '';
    e.sticky = e.sticky ?? null;
    e.cooldown = e.cooldown ?? null;
    e.delay = e.delay ?? null;
    e.delayUntilRecursion = toNumber(e.delayUntilRecursion, 0);

    e.content = e.content ?? '';
    return /** @type {WorldEntry} */ (e);
}

/**
 * Create a default entry
 * @param {number} index - Entry index
 * @returns {WorldEntry}
 */
export function createDefaultEntry(index = 0) {
    return normalizeEntry({ constant: true, selective: false }, index);
}

/**
 * Get position label for display
 * @param {number} pos - Position value
 * @param {number} role - Role value
 * @param {number} depth - Depth value
 * @returns {string}
 */
export function positionLabel(pos = 0, role = 0, depth = DEFAULT_DEPTH) {
    switch (Number(pos)) {
        case 0: return '↑Char';
        case 1: return '↓Char';
        case 2: return '↑AT';
        case 3: return '↓AT';
        case 4: return `@D${depth}/${ROLE_OPTIONS.find(r => r.value === role)?.label || 'system'}`;
        case 5: return '↑EM';
        case 6: return '↓EM';
        default: return String(pos);
    }
}

/**
 * Build select options HTML
 * @param {Array<{value: number, label: string}>} opts - Options array
 * @param {number} selected - Selected value
 * @returns {string}
 */
export function buildOptions(opts, selected) {
    return opts.map(o =>
        `<option value="${o.value}" ${Number(selected) === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');
}

/**
 * Download JSON file
 * @param {object} data - Data to download
 * @param {string} filename - Filename
 */
export function downloadJson(data, filename) {
    const text = JSON.stringify(data, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
    a.click();
    URL.revokeObjectURL(url);
}
