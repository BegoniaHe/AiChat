/**
 * Regex Types and Utilities
 * Shared between RegexPanel and RegexSessionPanel
 */

// Re-export from store
export { regex_placement, substitute_find_regex } from '$stores/regex.svelte.js';

import { regex_placement, substitute_find_regex } from '$stores/regex.svelte.js';

/**
 * Placement labels for display
 */
export const PLACEMENT_LABELS = {
  [regex_placement.USER_INPUT]: '用户输入',
  [regex_placement.AI_OUTPUT]: 'AI输出',
  [regex_placement.SLASH_COMMAND]: 'Slash',
  [regex_placement.WORLD_INFO]: '世界书',
  [regex_placement.REASONING]: '推理',
};

/**
 * Placement options for checkboxes
 */
export const PLACEMENT_OPTIONS = [
  { value: regex_placement.USER_INPUT, label: '用户输入' },
  { value: regex_placement.AI_OUTPUT, label: 'AI输出' },
  { value: regex_placement.SLASH_COMMAND, label: 'Slash' },
  { value: regex_placement.WORLD_INFO, label: '世界书' },
  { value: regex_placement.REASONING, label: '推理' },
];

/**
 * Substitute options for select
 */
export const SUBSTITUTE_OPTIONS = [
  { value: 0, label: '不替换' },
  { value: 1, label: '替换（raw）' },
  { value: 2, label: '替换（escaped）' },
];

/**
 * Preset types for local binding
 */
export const PRESET_TYPES = [
  { id: 'sysprompt', label: '系统提示词' },
  { id: 'context', label: '上下文模板' },
  { id: 'instruct', label: 'Instruct 模板' },
  { id: 'openai', label: '生成参数/自定义' },
  { id: 'reasoning', label: '推理格式' },
];

/**
 * Generate unique ID
 * @param {string} prefix - ID prefix
 * @returns {string}
 */
export function genId(prefix = 're') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

/**
 * Deep clone object
 * @param {*} v - Value to clone
 * @returns {*}
 */
export function deepClone(v) {
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
}

/**
 * @typedef {Object} RegexRule
 * @property {string} id - Rule ID
 * @property {string} scriptName - Script name
 * @property {string} findRegex - Find regex pattern
 * @property {string} replaceString - Replace string
 * @property {string[]} trimStrings - Strings to trim out
 * @property {number[]} placement - Placement types
 * @property {boolean} disabled - Is disabled
 * @property {boolean} markdownOnly - Only affect display
 * @property {boolean} promptOnly - Only affect prompt
 * @property {boolean} runOnEdit - Run on edit
 * @property {number} substituteRegex - Substitute type
 * @property {number|null} minDepth - Min depth
 * @property {number|null} maxDepth - Max depth
 */

/**
 * Normalize a regex rule (supports legacy format)
 * @param {Partial<RegexRule> & Record<string, any>} r - Raw rule
 * @returns {RegexRule}
 */
export function normalizeScript(r = {}) {
  // Legacy support
  if (!('findRegex' in r) && ('pattern' in r || 'when' in r || 'replacement' in r)) {
    const when = r.when === 'input' || r.when === 'output' || r.when === 'both' ? r.when : 'both';
    const pattern = String(r.pattern || '');
    const flags = r.flags === undefined || r.flags === null ? 'g' : String(r.flags);
    const placement = [];
    if (when === 'input' || when === 'both') placement.push(regex_placement.USER_INPUT);
    if (when === 'output' || when === 'both') placement.push(regex_placement.AI_OUTPUT);
    return {
      id: r.id || genId('re'),
      scriptName: String(r.name || '').trim(),
      findRegex: pattern ? `/${pattern}/${flags}` : '',
      replaceString: String(r.replacement ?? ''),
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

  return {
    id: r.id || genId('re'),
    scriptName: String(r.scriptName || r.name || '').trim(),
    findRegex: String(r.findRegex || ''),
    replaceString: String(r.replaceString ?? r.replacement ?? ''),
    trimStrings: Array.isArray(r.trimStrings)
      ? r.trimStrings.map((s) => String(s || '')).filter(Boolean)
      : [],
    placement: Array.isArray(r.placement)
      ? r.placement.map((n) => Number(n)).filter(Number.isFinite)
      : [],
    disabled: Boolean(r.disabled),
    markdownOnly: Boolean(r.markdownOnly),
    promptOnly: Boolean(r.promptOnly),
    runOnEdit: Boolean(r.runOnEdit),
    substituteRegex:
      r.substituteRegex === 1 || r.substituteRegex === 2 ? Number(r.substituteRegex) : 0,
    minDepth:
      r.minDepth === '' || r.minDepth === undefined
        ? null
        : r.minDepth === null
          ? null
          : Number(r.minDepth),
    maxDepth:
      r.maxDepth === '' || r.maxDepth === undefined
        ? null
        : r.maxDepth === null
          ? null
          : Number(r.maxDepth),
  };
}

/**
 * Create a default new rule
 * @returns {RegexRule}
 */
export function createDefaultRule() {
  return normalizeScript({
    placement: [regex_placement.USER_INPUT],
    markdownOnly: true,
    runOnEdit: true,
    disabled: false,
  });
}

/**
 * Get display title for a rule
 * @param {RegexRule} rule - The rule
 * @returns {string}
 */
export function getRuleTitle(rule) {
  const name = rule.scriptName?.trim();
  const find = rule.findRegex?.trim();
  return name || (find ? `${find.slice(0, 36)}${find.length > 36 ? '…' : ''}` : '未命名正则');
}

/**
 * Get display subtitle for a rule
 * @param {RegexRule} rule - The rule
 * @returns {string}
 */
export function getRuleSubtitle(rule) {
  const affects = rule.placement?.length
    ? rule.placement.map((p) => PLACEMENT_LABELS[p] || String(p)).join(' / ')
    : '未选择';

  const mdOnly = rule.markdownOnly;
  const prOnly = rule.promptOnly;
  const epi = `${mdOnly ? '显示' : ''}${mdOnly && prOnly ? '+' : ''}${prOnly ? 'Prompt' : ''}`;

  const sub = `${affects}${epi ? ` · ${epi}` : ''}${rule.disabled ? ' · Disabled' : ''}`;
  return sub;
}

/**
 * Format binding info for display
 * @param {{ type?: string, worldId?: string, presetType?: string, presetId?: string } | null} bind
 * @returns {string}
 */
export function formatBind(bind) {
  if (!bind) return '';
  if (bind.type === 'world') return `绑定世界书：${bind.worldId || ''}`;
  if (bind.type === 'preset') return `绑定预设：${bind.presetType || ''}/${bind.presetId || ''}`;
  return '绑定：未知';
}
