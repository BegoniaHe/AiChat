/**
 * 应用设置 Store
 * 迁移自: src-legacy/scripts/storage/app-settings.js
 */

import { logger } from '$utils';
import { tryInvoke } from '$utils/tauri.js';

const STORAGE_KEY = 'app_settings_v1';

// 默认设置
const DEFAULT_SETTINGS = {
  // 外观
  theme: 'auto', // 'light' | 'dark' | 'auto'
  fontSize: 16,
  userBubbleColor: '#95EC69',
  aiBubbleColor: '#FFFFFF',
  
  // 聊天
  sendOnEnter: true,
  showTimestamps: true,
  
  // 通知
  notificationsEnabled: true,
  soundEnabled: true,
  
  // 高级
  debugMode: false,
  autoSave: true,
  autoSaveInterval: 30000,
};

function createAppSettings() {
  let settings = $state({ ...DEFAULT_SETTINGS });
  let initialized = false;

  // 加载设置
  async function load() {
    try {
      // 尝试从 Tauri KV 加载
      let data = await tryInvoke('load_kv', { name: STORAGE_KEY });
      
      // 回退到 localStorage
      if (!data) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          data = JSON.parse(raw);
        }
      }

      if (data && typeof data === 'object') {
        settings = { ...DEFAULT_SETTINGS, ...data };
      }
      
      initialized = true;
      logger.info('App settings loaded');
    } catch (err) {
      logger.error('Failed to load app settings', err);
    }
  }

  // 保存设置
  async function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      await tryInvoke('save_kv', { name: STORAGE_KEY, data: settings });
    } catch (err) {
      logger.warn('Failed to save app settings', err);
    }
  }

  // 初始化
  load();

  return {
    get value() {
      return settings;
    },
    
    get(key) {
      return settings[key] ?? DEFAULT_SETTINGS[key];
    },
    
    set(key, value) {
      settings[key] = value;
      settings = { ...settings }; // 触发响应式更新
      save();
    },
    
    update(partial) {
      settings = { ...settings, ...partial };
      save();
    },
    
    reset() {
      settings = { ...DEFAULT_SETTINGS };
      save();
    },
    
    get isInitialized() {
      return initialized;
    },
    
    // === 快捷方法 ===
    
    // 主题
    get theme() {
      return settings.theme;
    },
    setTheme(theme) {
      settings.theme = theme;
      settings = { ...settings };
      save();
    },
    
    // 气泡颜色
    get userBubbleColor() {
      return settings.userBubbleColor;
    },
    setUserBubbleColor(color) {
      settings.userBubbleColor = color;
      settings = { ...settings };
      save();
    },
    
    get aiBubbleColor() {
      return settings.aiBubbleColor;
    },
    setAiBubbleColor(color) {
      settings.aiBubbleColor = color;
      settings = { ...settings };
      save();
    },
    
    // 通知
    get soundEnabled() {
      return settings.soundEnabled;
    },
    setSoundEnabled(enabled) {
      settings.soundEnabled = enabled;
      settings = { ...settings };
      save();
    },
    
    get notificationsEnabled() {
      return settings.notificationsEnabled;
    },
    setNotificationsEnabled(enabled) {
      settings.notificationsEnabled = enabled;
      settings = { ...settings };
      save();
    },
  };
}

export const appSettings = createAppSettings();
