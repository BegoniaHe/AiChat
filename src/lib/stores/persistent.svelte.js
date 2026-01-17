/**
 * 持久化存储基类
 * 提供 localStorage + Tauri KV 双层存储
 */

import { logger, safeJsonParse } from '$utils';
import { tryInvoke } from '$utils/tauri.js';

/**
 * 检查是否是配额错误
 */
function isQuotaError(err) {
  try {
    const name = String(err?.name || '');
    const msg = String(err?.message || '');
    return (
      name === 'QuotaExceededError' ||
      name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      Number(err?.code) === 22 ||
      /quota/i.test(msg)
    );
  } catch {
    return false;
  }
}

/**
 * 创建持久化存储
 * @param {string} key - 存储键名
 * @param {any} initialValue - 初始值
 * @returns 包含 get/set/subscribe 的 store
 */
export function createPersistentStore(key, initialValue) {
  let value = $state(initialValue);
  let initialized = false;
  let lsDisabled = false;

  // 从 localStorage 加载
  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = safeJsonParse(raw);
        if (parsed !== null) {
          value = parsed;
        }
      }
    } catch (err) {
      logger.warn(`Failed to load ${key} from localStorage`, err);
    }
  }

  // 保存到 localStorage
  function saveToLocalStorage(data) {
    if (lsDisabled) return;
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      if (isQuotaError(err)) {
        lsDisabled = true;
        logger.warn(`localStorage quota exceeded for ${key}, using Tauri KV only`);
      }
    }
  }

  // 从 Tauri KV 加载
  async function loadFromTauri() {
    const data = await tryInvoke('load_kv', { name: key });
    if (data !== null) {
      value = data;
      saveToLocalStorage(data);
    }
  }

  // 保存到 Tauri KV
  async function saveToTauri(data) {
    await tryInvoke('save_kv', { name: key, data });
  }

  // 初始化
  async function init() {
    if (initialized) return;
    loadFromLocalStorage();
    await loadFromTauri();
    initialized = true;
  }

  // 立即初始化
  init();

  return {
    get value() {
      return value;
    },
    set value(newValue) {
      value = newValue;
      saveToLocalStorage(newValue);
      saveToTauri(newValue);
    },
    async reload() {
      await loadFromTauri();
    },
  };
}

/**
 * 创建简单的内存 store（用于临时状态）
 */
export function createStore(initialValue) {
  let value = $state(initialValue);

  return {
    get value() {
      return value;
    },
    set value(newValue) {
      value = newValue;
    },
    update(fn) {
      value = fn(value);
    },
  };
}
