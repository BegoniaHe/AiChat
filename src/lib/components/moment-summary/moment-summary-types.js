/**
 * Moment Summary 模块类型和工具函数
 * 迁移自: src/scripts/ui/moment-summary-panel.js
 */

/**
 * 摘要项
 * @typedef {Object} SummaryItem
 * @property {string} text - 摘要文本
 * @property {number} at - 时间戳
 */

/**
 * 压缩摘要
 * @typedef {Object} CompactedSummary
 * @property {string} text - 摘要文本
 * @property {number} at - 时间戳
 */

/**
 * 生成摘要项的唯一 key
 * @param {SummaryItem} item
 * @returns {string}
 */
export function getSummaryKey(item) {
  const at = Number(item?.at || 0) || 0;
  const text = typeof item === 'string' ? item : String(item?.text || '');
  return `${at}|${text}`;
}

/**
 * 从 key 解析摘要项
 * @param {string} key
 * @returns {{ at: number, text: string }}
 */
export function parseSummaryKey(key) {
  const [atStr, ...rest] = String(key).split('|');
  return {
    at: Number(atStr || 0) || 0,
    text: rest.join('|'),
  };
}

/**
 * 解析编辑后的摘要文本为行数组
 * @param {string} text
 * @returns {string[]}
 */
export function parseEditedSummaryLines(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map((s) => String(s).trim());
  // 优先识别 bullet 格式
  const bullet = lines
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
  if (bullet.length) return bullet;
  return lines.filter(Boolean);
}

/**
 * 格式化时间戳
 * @param {number} ts
 * @returns {string}
 */
export function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

/**
 * 转义 HTML
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text || '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
