/**
 * Persona Store
 * 迁移自: src-legacy/scripts/storage/persona-store.js
 */

import { genId, logger } from '$utils';
import { tryInvoke } from '$utils/tauri.js';

const STORAGE_KEY = 'user_personas_v1';
const ACTIVE_KEY = 'user_personas_active_id_v1';

// 描述位置常量
export const PERSONA_POSITIONS = {
  IN_PROMPT: 0,
  AT_DEPTH: 4,
  NONE: 9,
};

const DEFAULT_BUBBLE_COLOR = '#E8F0FE';

/**
 * 规范化 Persona
 */
function normalizePersona(p) {
  return {
    id: p.id || genId('persona'),
    name: p.name || '我',
    avatar: p.avatar || '',
    description: p.description || '',
    userBubbleColor: p.userBubbleColor || DEFAULT_BUBBLE_COLOR,
    position: p.position ?? PERSONA_POSITIONS.IN_PROMPT,
    depth: p.depth ?? 2,
    role: p.role ?? 0,
    created: p.created || Date.now(),
    updated: p.updated || Date.now(),
  };
}

/**
 * 创建默认 Persona
 */
function createDefaultPersona() {
  return {
    id: 'default',
    name: '我',
    avatar: '',
    description: '',
    userBubbleColor: DEFAULT_BUBBLE_COLOR,
    position: PERSONA_POSITIONS.IN_PROMPT,
    depth: 2,
    role: 0,
    created: Date.now(),
    updated: Date.now(),
  };
}

function createPersonaStore() {
  let personas = $state([]);
  let activeId = $state('default');
  let initialized = false;

  // 加载
  async function load() {
    try {
      let data = await tryInvoke('load_kv', { name: STORAGE_KEY });
      let active = await tryInvoke('load_kv', { name: ACTIVE_KEY });

      if (!data) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) data = JSON.parse(raw);
      }
      if (!active) {
        active = localStorage.getItem(ACTIVE_KEY);
      }

      if (Array.isArray(data)) {
        personas = data.map(normalizePersona);
      }

      if (active) {
        activeId = active;
      }

      // 确保有默认 persona
      if (personas.length === 0) {
        personas = [createDefaultPersona()];
        activeId = 'default';
        await save();
      } else if (!personas.find((p) => p.id === activeId)) {
        activeId = personas[0].id;
        await save();
      }

      initialized = true;
      logger.info(`Persona store loaded: ${personas.length} personas, active: ${activeId}`);
    } catch (err) {
      logger.error('Failed to load persona store', err);
      personas = [createDefaultPersona()];
      activeId = 'default';
    }
  }

  // 保存
  async function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(personas));
      localStorage.setItem(ACTIVE_KEY, activeId);
      await tryInvoke('save_kv', { name: STORAGE_KEY, data: personas });
      await tryInvoke('save_kv', { name: ACTIVE_KEY, data: activeId });
    } catch (err) {
      logger.warn('Failed to save persona store', err);
    }
  }

  // 初始化
  load();

  return {
    get list() {
      return personas;
    },

    get activeId() {
      return activeId;
    },

    get active() {
      return personas.find((p) => p.id === activeId) || personas[0] || createDefaultPersona();
    },

    get(id) {
      return personas.find((p) => p.id === id);
    },

    setActive(id) {
      if (personas.find((p) => p.id === id)) {
        activeId = id;
        save();
      }
    },

    add(persona) {
      const normalized = normalizePersona(persona);
      personas = [...personas, normalized];
      save();
      return normalized;
    },

    update(id, updates) {
      const index = personas.findIndex((p) => p.id === id);
      if (index === -1) return null;

      personas[index] = {
        ...personas[index],
        ...updates,
        updated: Date.now(),
      };
      personas = [...personas];
      save();
      return personas[index];
    },

    remove(id) {
      if (id === 'default') return false;

      personas = personas.filter((p) => p.id !== id);

      if (activeId === id) {
        activeId = personas[0]?.id || 'default';
      }

      save();
      return true;
    },

    get isInitialized() {
      return initialized;
    },
  };
}

export const personaStore = createPersonaStore();
