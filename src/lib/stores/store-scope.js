/**
 * Store Scope 工具
 * 迁移自: src-legacy/scripts/storage/store-scope.js
 */

const SAFE_SCOPE_RE = /[^a-zA-Z0-9_-]/g;

/**
 * 规范化 scope ID
 */
export function normalizeScopeId(raw) {
  const base = String(raw || '').trim();
  if (!base) return '';
  return base.replace(SAFE_SCOPE_RE, '_').slice(0, 64);
}

/**
 * 创建带 scope 的存储 key
 */
export function makeScopedKey(baseKey, scopeId) {
  const scope = normalizeScopeId(scopeId);
  return scope ? `${baseKey}__${scope}` : baseKey;
}
