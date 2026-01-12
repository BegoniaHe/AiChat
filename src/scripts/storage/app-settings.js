const SETTINGS_KEY = 'app_settings_v1';

const defaults = {
  showDebugToggle: false,
  typingDotsEnabled: true,
  allowRichIframeScripts: false,
  creativeHistoryMax: 3,
  creativeWideBubble: false,
  reasoningAutoParse: false,
  reasoningAutoExpand: false,
  reasoningShowHidden: false,
  reasoningAddToPrompts: false,
  reasoningMaxAdditions: 1,
  personaBindContacts: true,
  promptCurrentTimeEnabled: false,
  memoryStorageMode: 'summary',
  memoryAutoExtract: false,
  memoryAutoExtractMode: 'inline',
  memoryUpdateApiMode: 'chat',
  memoryUpdateProfileId: '',
  memoryUpdateContextRounds: 6,
  memoryMaxRows: 30,
  memoryMaxTokens: 2000,
  memoryInjectPosition: 'template',
  memoryInjectDepth: 4,
  memoryTokenMode: 'rough',
  memoryAutoConfirm: false,
  memoryAutoStepByStep: false,
};

const readSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeSettings = (next) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {}
};

const migrateSettings = (settings = {}) => {
  const next = { ...(settings || {}) };
  if (next.memoryUpdateContextRounds == null && next.memoryUpdateContextCount != null) {
    const raw = Math.trunc(Number(next.memoryUpdateContextCount));
    const safe = Number.isFinite(raw) ? Math.max(0, raw) : defaults.memoryUpdateContextRounds;
    next.memoryUpdateContextRounds = safe;
  }
  return next;
};

export const appSettings = {
  get() {
    return { ...defaults, ...migrateSettings(readSettings()) };
  },
  update(patch = {}) {
    const next = { ...defaults, ...migrateSettings(readSettings()), ...patch };
    writeSettings(next);
    return next;
  },
};
