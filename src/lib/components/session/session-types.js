/**
 * Session 模块类型和工具函数
 * 迁移自: src/scripts/ui/session-panel.js
 */

/**
 * 格式化时间
 * @param {number} ts - 时间戳
 * @returns {string}
 */
export function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * 联系人显示信息
 * @typedef {Object} ContactDisplayInfo
 * @property {string} id
 * @property {string} name
 * @property {string} avatar
 * @property {boolean} isGroup
 * @property {number} membersCount
 * @property {string} snippet
 * @property {string} time
 * @property {number} unread
 * @property {boolean} isCurrent
 */

/**
 * 构建联系人显示信息
 * @param {Object} contact - 联系人数据
 * @param {Object} options
 * @param {string} options.currentId - 当前选中的 ID
 * @param {(id: string) => Object | null} options.getLastMessage - 获取最后消息的函数
 * @param {(id: string) => number} options.getUnreadCount - 获取未读数的函数
 * @returns {ContactDisplayInfo}
 */
export function buildContactDisplayInfo(contact, { currentId, getLastMessage, getUnreadCount }) {
    const id = contact.id;
    const isGroup = Boolean(contact.isGroup) || id.startsWith('group:');
    const membersCount = isGroup && Array.isArray(contact.members) ? contact.members.length : 0;

    const last = typeof getLastMessage === 'function' ? getLastMessage(id) : null;
    const snippet = last ? (last.content || '').slice(0, 32) : '新会话';
    const time = last?.timestamp ? formatTime(last.timestamp) : '';
    const unread = typeof getUnreadCount === 'function' ? getUnreadCount(id) : 0;

    return {
        id,
        name: contact.name || id,
        avatar: contact.avatar || '',
        isGroup,
        membersCount,
        snippet,
        time,
        unread,
        isCurrent: id === currentId,
    };
}

/**
 * 验证联系人名称
 * @param {string} name - 名称
 * @param {(id: string) => boolean} exists - 检查是否存在的函数
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateContactName(name, exists) {
    const trimmed = (name || '').trim();

    if (!trimmed) {
        return { valid: false, error: '请输入好友名称' };
    }

    if (trimmed.startsWith('group:')) {
        return { valid: false, error: '好友名称不可使用 group: 前缀' };
    }

    if (typeof exists === 'function' && exists(trimmed)) {
        return { valid: false, error: '名称已存在，请换一个' };
    }

    return { valid: true };
}
