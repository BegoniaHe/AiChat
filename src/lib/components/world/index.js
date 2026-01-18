/**
 * World Module Exports
 */

// Components
export { default as WorldEditor } from './WorldEditor.svelte';
export { default as WorldEntryEditor } from './WorldEntryEditor.svelte';
export { default as WorldPanel } from './WorldPanel.svelte';

// Types and utilities
export {
  // Constants
  DEFAULT_DEPTH,
  DEFAULT_WEIGHT,
  POSITION_OPTIONS,
  ROLE_OPTIONS,
  SELECTIVE_LOGIC_OPTIONS,
  buildOptions,
  createDefaultEntry,
  // Functions
  deepClone,
  downloadJson,
  normalizeArray,
  normalizeEntry,
  positionLabel,
  toNumber,
} from './world-types.js';
