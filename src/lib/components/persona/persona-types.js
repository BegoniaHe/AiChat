/**
 * Persona 模块类型和常量
 * 迁移自: src/scripts/ui/persona-panel.js
 */

/**
 * 默认用户气泡颜色
 */
export const DEFAULT_USER_BUBBLE_COLOR = '#E8F0FE';

/**
 * 描述位置选项
 */
export const POSITION_OPTIONS = [
    { value: 0, label: 'IN_PROMPT（作为 system prompt 注入）' },
    { value: 4, label: 'AT_DEPTH（插入到聊天历史指定深度）' },
    { value: 9, label: 'NONE（不注入）' },
];

/**
 * 注入角色选项
 */
export const ROLE_OPTIONS = [
    { value: 0, label: 'system' },
    { value: 1, label: 'user' },
    { value: 2, label: 'assistant' },
];

/**
 * 规范化十六进制颜色
 * @param {string} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function normalizeHexColor(value, fallback = DEFAULT_USER_BUBBLE_COLOR) {
    const raw = String(value || '').trim();
    return /^#[0-9A-F]{6}$/i.test(raw) ? raw : fallback;
}

/**
 * Persona 类型定义
 * @typedef {Object} Persona
 * @property {string} id
 * @property {string} name
 * @property {string} avatar
 * @property {string} description
 * @property {string} userBubbleColor
 * @property {number} position
 * @property {number} depth
 * @property {number} role
 * @property {number} [created]
 * @property {number} [updated]
 */

/**
 * 创建默认 Persona
 * @returns {Persona}
 */
export function createDefaultPersona() {
    return {
        id: '',
        name: 'User',
        avatar: '',
        description: '',
        userBubbleColor: DEFAULT_USER_BUBBLE_COLOR,
        position: 0,
        depth: 2,
        role: 0,
    };
}

/**
 * 规范化 Persona
 * @param {Partial<Persona>} p
 * @returns {Persona}
 */
export function normalizePersona(p) {
    return {
        id: p.id || '',
        name: String(p.name || '').trim() || 'User',
        avatar: String(p.avatar || '').trim(),
        description: String(p.description || ''),
        userBubbleColor: normalizeHexColor(p.userBubbleColor),
        position: Number.isFinite(Number(p.position)) ? Number(p.position) : 0,
        depth: Number.isFinite(Number(p.depth)) ? Math.max(0, Math.trunc(Number(p.depth))) : 2,
        role: Number.isFinite(Number(p.role)) ? Math.max(0, Math.min(2, Math.trunc(Number(p.role)))) : 0,
        created: p.created || Date.now(),
        updated: p.updated || Date.now(),
    };
}
