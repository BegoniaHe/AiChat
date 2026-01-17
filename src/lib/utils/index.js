/**
 * 工具函数统一导出
 */

export {
    DialogueStreamParser,
    extractGroupNameFromTag,
    extractOtherNameFromPrivateChatTag,
    isGroupChatTag,
    normalizeNewlines,
    parseGroupChatBlock,
    parseMomentBlock,
    parseMomentReplyBlock,
    parsePrivateChatMessages,
    splitSpeakerSegments,
    stripThinkingBlocks
} from './dialogue-stream-parser.js';
export { logger } from './logger.js';
export { MacroEngine } from './macro-engine.js';
export {
    getMediaState, initMediaAssets, isAssetRef, isLikelyUrl, listMediaAssets, resolveMediaAsset
} from './media-assets.js';
export {
    MESSAGE_TYPES, parseSpecialMessage
} from './message-parser.js';
export { isTauri, safeInvoke, tryInvoke } from './tauri.js';

/**
 * 生成唯一 ID
 */
export function genId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

/**
 * 防抖函数
 */
export function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

/**
 * 节流函数
 */
export function throttle(fn, ms = 300) {
    let last = 0;
    return (...args) => {
        const now = Date.now();
        if (now - last >= ms) {
            last = now;
            fn(...args);
        }
    };
}

/**
 * 深拷贝
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    try {
        return structuredClone(obj);
    } catch {
        return JSON.parse(JSON.stringify(obj));
    }
}

/**
 * 安全解析 JSON
 */
export function safeJsonParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch {
        return defaultValue;
    }
}

/**
 * 格式化时间
 */
export function formatTime(timestamp, format = 'HH:mm') {
    const date = new Date(timestamp);
    const pad = (n) => String(n).padStart(2, '0');

    const tokens = {
        YYYY: date.getFullYear(),
        MM: pad(date.getMonth() + 1),
        DD: pad(date.getDate()),
        HH: pad(date.getHours()),
        mm: pad(date.getMinutes()),
        ss: pad(date.getSeconds()),
    };

    return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (match) => tokens[match]);
}

/**
 * 截断字符串
 */
export function truncate(str, maxLength = 100, suffix = '...') {
    if (!str || str.length <= maxLength) return str;
    return str.slice(0, maxLength - suffix.length) + suffix;
}
