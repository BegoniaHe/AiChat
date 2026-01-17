/**
 * Stores 统一导出
 */

// Core stores
export { appSettings as appSettingsStore } from './app-settings.svelte.js';
export { chatStore } from './chat.svelte.js';
export { SUPPORTED_PROVIDERS, configStore } from './config.svelte.js';
export { contactsStore } from './contacts.svelte.js';
export { PERSONA_POSITIONS, personaStore } from './persona.svelte.js';
export { uiStore } from './ui.svelte.js';

// Feature stores
export { GroupStore, getGroupStore } from './group.svelte.js';
export { MemoryTableStore, getMemoryTableStore } from './memory-table.svelte.js';
export { MomentsStore, getMomentsStore } from './moments.svelte.js';

// Preset store (SillyTavern-like)
export {
    DEFAULT_DIALOGUE_RULES_PRIVATE_CHAT,
    DEFAULT_GROUP_RULES, DEFAULT_MOMENT_COMMENT_RULES, DEFAULT_MOMENT_CREATION_RULES, DEFAULT_MOMENT_RULES, DEFAULT_SUMMARY_RULES, PresetStore,
    getPresetStore
} from './preset.svelte.js';

// Regex store (SillyTavern-like)
export {
    RegexStore,
    getRegexStore,
    regex_placement,
    substitute_find_regex
} from './regex.svelte.js';

// WorldInfo store
export {
    WorldInfoStore, convertSTWorld, getWorldInfoStore
} from './worldinfo.svelte.js';

// 工具函数
export { createPersistentStore, createStore } from './persistent.svelte.js';
export { makeScopedKey, normalizeScopeId } from './store-scope.js';

