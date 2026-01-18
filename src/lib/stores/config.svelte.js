/**
 * 配置管理 Store
 * 迁移自: src-legacy/scripts/storage/config.js
 * 管理 LLM API 配置和密钥
 */

import { genId, logger } from '$utils';
import { tryInvoke } from '$utils/tauri.js';

const PROFILE_STORE_KEY = 'llm_profiles_v1';
const ACTIVE_PROFILE_KEY = 'llm_active_profile_v1';

export const SUPPORTED_PROVIDERS = [
  'openai',
  'anthropic',
  'gemini',
  'deepseek',
  'makersuite',
  'vertexai',
  'custom',
];

/**
 * 规范化配置
 */
function normalizeProfile(p) {
  return {
    id: p.id || genId('profile'),
    name: p.name || '未命名',
    provider: SUPPORTED_PROVIDERS.includes(p.provider) ? p.provider : 'openai',
    baseUrl: p.baseUrl || 'https://api.openai.com/v1',
    model: p.model || 'gpt-3.5-turbo',
    apiKey: p.apiKey || '',
    stream: p.stream !== false,
    timeout: typeof p.timeout === 'number' ? p.timeout : 60000,
    maxRetries: typeof p.maxRetries === 'number' ? p.maxRetries : 3,
    temperature: typeof p.temperature === 'number' ? p.temperature : 0.7,
    maxTokens: typeof p.maxTokens === 'number' ? p.maxTokens : 4096,
    createdAt: p.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * 创建默认配置
 */
function createDefaultProfile() {
  return {
    id: 'default',
    name: '默认配置',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-3.5-turbo',
    apiKey: '',
    stream: true,
    timeout: 60000,
    maxRetries: 3,
    temperature: 0.7,
    maxTokens: 4096,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createConfigStore() {
  let profiles = $state([]);
  let activeId = $state('default');
  let initialized = false;

  // 加载
  async function load() {
    try {
      let data = await tryInvoke('load_kv', { name: PROFILE_STORE_KEY });
      let active = await tryInvoke('load_kv', { name: ACTIVE_PROFILE_KEY });

      if (!data) {
        const raw = localStorage.getItem(PROFILE_STORE_KEY);
        if (raw) data = JSON.parse(raw);
      }
      if (!active) {
        active = localStorage.getItem(ACTIVE_PROFILE_KEY);
      }

      if (Array.isArray(data)) {
        profiles = data.map(normalizeProfile);
      }

      if (active) {
        activeId = active;
      }

      // 确保有默认配置
      if (profiles.length === 0) {
        profiles = [createDefaultProfile()];
        activeId = 'default';
        await save();
      } else if (!profiles.find((p) => p.id === activeId)) {
        activeId = profiles[0].id;
        await save();
      }

      initialized = true;
      logger.info(`Config store loaded: ${profiles.length} profiles, active: ${activeId}`);
    } catch (err) {
      logger.error('Failed to load config store', err);
      profiles = [createDefaultProfile()];
      activeId = 'default';
    }
  }

  // 保存
  async function save() {
    try {
      // 保存时不存储 apiKey 到 localStorage
      const safeProfiles = profiles.map((p) => ({ ...p, apiKey: '' }));
      localStorage.setItem(PROFILE_STORE_KEY, JSON.stringify(safeProfiles));
      localStorage.setItem(ACTIVE_PROFILE_KEY, activeId);

      // Tauri KV 可以安全存储
      await tryInvoke('save_kv', { name: PROFILE_STORE_KEY, data: profiles });
      await tryInvoke('save_kv', { name: ACTIVE_PROFILE_KEY, data: activeId });
    } catch (err) {
      logger.warn('Failed to save config store', err);
    }
  }

  // 初始化
  load();

  return {
    get list() {
      return profiles;
    },

    get activeId() {
      return activeId;
    },

    get active() {
      return profiles.find((p) => p.id === activeId) || profiles[0] || createDefaultProfile();
    },

    get(id) {
      return profiles.find((p) => p.id === id);
    },

    setActive(id) {
      if (profiles.find((p) => p.id === id)) {
        activeId = id;
        save();
      }
    },

    add(profile) {
      const normalized = normalizeProfile(profile);
      profiles = [...profiles, normalized];
      save();
      return normalized;
    },

    update(id, updates) {
      const index = profiles.findIndex((p) => p.id === id);
      if (index === -1) return null;

      profiles[index] = normalizeProfile({
        ...profiles[index],
        ...updates,
      });
      profiles = [...profiles];
      save();
      return profiles[index];
    },

    remove(id) {
      if (profiles.length <= 1) return false;

      profiles = profiles.filter((p) => p.id !== id);

      if (activeId === id) {
        activeId = profiles[0]?.id || 'default';
      }

      save();
      return true;
    },

    // 遮蔽 API Key 显示
    maskApiKey(key) {
      const raw = String(key || '').trim();
      if (!raw) return '';
      if (raw.length <= 4) return `${raw.slice(0, 1)}••${raw.slice(-1)}`;
      return `${raw.slice(0, 2)}••••••••${raw.slice(-2)}`;
    },

    get isInitialized() {
      return initialized;
    },
  };
}

export const configStore = createConfigStore();
