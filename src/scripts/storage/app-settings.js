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

export const appSettings = {
  get() {
    return { ...defaults, ...readSettings() };
  },
  update(patch = {}) {
    const next = { ...defaults, ...readSettings(), ...patch };
    writeSettings(next);
    return next;
  },
};
