const SAFE_SCOPE_RE = /[^a-zA-Z0-9_-]/g;

export const normalizeScopeId = (raw) => {
  const base = String(raw || '').trim();
  if (!base) return '';
  return base.replace(SAFE_SCOPE_RE, '_').slice(0, 64);
};

export const makeScopedKey = (baseKey, scopeId) => {
  const scope = normalizeScopeId(scopeId);
  return scope ? `${baseKey}__${scope}` : baseKey;
};
