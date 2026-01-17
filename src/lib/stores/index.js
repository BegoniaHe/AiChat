/**
 * Stores 统一导出
 */

// Core stores
export { appSettings as appSettingsStore } from './app-settings.svelte.js';
export { chatStore } from './chat.svelte.js';
export { configStore, SUPPORTED_PROVIDERS } from './config.svelte.js';
export { contactsStore } from './contacts.svelte.js';
export { PERSONA_POSITIONS, personaStore } from './persona.svelte.js';
export { uiStore } from './ui.svelte.js';

// Feature stores
export { getGroupStore, GroupStore } from './group.svelte.js';
export { getMemoryTableStore, MemoryTableStore } from './memory-table.svelte.js';
export { getMemoryTemplateStore, MemoryTemplateStore } from './memory-template.svelte.js';
export { getMomentsStore, MomentsStore } from './moments.svelte.js';

// Preset store (SillyTavern-like)
export {
    DEFAULT_DIALOGUE_RULES_PRIVATE_CHAT,
    DEFAULT_GROUP_RULES, DEFAULT_MOMENT_COMMENT_RULES, DEFAULT_MOMENT_CREATION_RULES, DEFAULT_MOMENT_RULES, DEFAULT_SUMMARY_RULES, getPresetStore, PresetStore
} from './preset.svelte.js';

// Create singleton preset store
import { getPresetStore as _getPresetStore } from './preset.svelte.js';
/** @type {import('./preset.svelte.js').PresetStore} */
export const presetStore = _getPresetStore();

// Regex store (SillyTavern-like)
export {
    getRegexStore,
    regex_placement, RegexStore, substitute_find_regex
} from './regex.svelte.js';

// WorldInfo store
export { convertSTWorld, getWorldInfoStore, WorldInfoStore } from './worldinfo.svelte.js';

// Memory default template
export { DEFAULT_MEMORY_TEMPLATE } from './memory-default-template.js';

// 工具函数
export { createPersistentStore, createStore } from './persistent.svelte.js';
export { makeScopedKey, normalizeScopeId } from './store-scope.js';

