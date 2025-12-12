/**
 * 配置管理 - 负责配置的持久化存储
 */

import { logger } from '../utils/logger.js';

const SUPPORTED_PROVIDERS = ['openai', 'makersuite', 'vertexai', 'anthropic', 'deepseek', 'gemini', 'custom'];

const safeInvoke = async (cmd, args) => {
    const invoker = window.__TAURI__?.core?.invoke;
    if (typeof invoker === 'function') return invoker(cmd, args);
    return null;
};

export class ConfigManager {
    constructor() {
        this.config = null;
        this.isLoaded = false;
    }

    /**
     * 加载配置
     */
    async load() {
        if (this.isLoaded && this.config) {
            return this.config;
        }

        try {
            logger.debug('从 Tauri 后端加载配置...');
            this.config = await safeInvoke('load_config');
            this.isLoaded = true;
            logger.info('配置加载成功');
        } catch (e) {
            logger.warn('从 Tauri 加载失败，尝试 localStorage:', e);

            // 降级到 localStorage - 加载所有配置
            const stored = localStorage.getItem('llm_configs');
            if (stored) {
                try {
                    const allConfigs = JSON.parse(stored);

                    // 获取当前选择的 provider
                    const currentProvider = allConfigs.currentProvider || 'openai';

                    // 解密对应 provider 的配置
                    if (allConfigs[currentProvider]) {
                        this.config = this.decryptConfig(allConfigs[currentProvider]);
                        this.config.provider = currentProvider;
                    } else {
                        this.config = this.getDefault();
                    }

                    this.isLoaded = true;
                    logger.info('从 localStorage 加载配置成功');
                } catch (parseError) {
                    logger.error('解析配置失败:', parseError);
                    this.config = this.getDefault();
                }
            } else {
                // 尝试旧格式兼容
                const oldStored = localStorage.getItem('llm_config');
                if (oldStored) {
                    try {
                        this.config = JSON.parse(oldStored);
                        this.config = this.decryptConfig(this.config);
                        this.isLoaded = true;
                        logger.info('从 localStorage 加载旧配置成功');
                    } catch (e) {
                        this.config = this.getDefault();
                    }
                } else {
                    logger.info('未找到已保存的配置，使用默认值');
                    this.config = this.getDefault();
                }
            }
        }

        return this.config;
    }

    /**
     * 解密配置
     */
    decryptConfig(config) {
        const decrypted = { ...config };

        // 解密 API Key
        if (decrypted._encrypted && decrypted.apiKey) {
            try {
                decrypted.apiKey = atob(decrypted.apiKey);
            } catch (e) {
                logger.error('解密 API Key 失败:', e);
            }
            delete decrypted._encrypted;
        }

        // 解密 Service Account JSON
        if (decrypted._saEncrypted && decrypted.vertexaiServiceAccount) {
            try {
                decrypted.vertexaiServiceAccount = atob(decrypted.vertexaiServiceAccount);
            } catch (e) {
                logger.error('解密 Service Account 失败:', e);
            }
            delete decrypted._saEncrypted;
        }

        return decrypted;
    }

    /**
     * 保存配置
     */
    async save(config) {
        // 验证配置
        try {
            this.validate(config);
        } catch (error) {
            logger.error('配置验证失败:', error);
            throw error;
        }

        this.config = config;

        try {
            logger.debug('保存配置到 Tauri 后端...');
            // 避免持久化 API Key 到文件
            const { apiKey, ...rest } = config;
            await safeInvoke('save_config', { config: rest });
            logger.info('配置保存成功');
        } catch (e) {
            logger.warn('保存到 Tauri 失败，使用 localStorage:', e);

            // 降级到 localStorage - 分别保存每个 provider 的配置
            const provider = config.provider;

            // 加载现有所有配置
            let allConfigs = {};
            try {
                const stored = localStorage.getItem('llm_configs');
                if (stored) {
                    allConfigs = JSON.parse(stored);
                }
            } catch (e) {
                logger.warn('加载现有配置失败:', e);
            }

            // 加密当前配置
            const toSave = { ...config };
            delete toSave.provider; // provider 作为 key，不需要存储
            // 不保存 API Key 到持久层
            delete toSave.apiKey;

            // 加密 Service Account JSON
            if (toSave.vertexaiServiceAccount) {
                toSave.vertexaiServiceAccount = btoa(toSave.vertexaiServiceAccount);
                toSave._saEncrypted = true;
            }

            // 保存到对应 provider 的配置
            allConfigs[provider] = toSave;
            allConfigs.currentProvider = provider;

            localStorage.setItem('llm_configs', JSON.stringify(allConfigs));
            logger.info(`配置保存到 localStorage (provider: ${provider})`);
        }
    }

    /**
     * 获取当前配置
     */
    get() {
        return this.config || this.getDefault();
    }

    /**
     * 更新當前配置緩存（不持久化）
     */
    set(config) {
        this.config = config;
        this.isLoaded = true;
    }

    /**
     * 获取默认配置
     */
    getDefault() {
        return {
            provider: 'openai',
            apiKey: '',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-3.5-turbo',
            stream: true,
            timeout: 60000,
            maxRetries: 3
        };
    }

    /**
     * 验证配置完整性
     */
    validate(config) {
        const required = ['provider', 'baseUrl', 'model'];

        for (const key of required) {
            if (!config[key]) {
                throw new Error(`缺少必需的配置项: ${key}`);
            }
        }

        // 验证 provider
        if (!SUPPORTED_PROVIDERS.includes(config.provider)) {
            throw new Error(`无效的 provider: ${config.provider}。可用: ${SUPPORTED_PROVIDERS.join(', ')}`);
        }

        // 验证 URL
        try {
            new URL(config.baseUrl);
        } catch (e) {
            throw new Error(`无效的 baseUrl: ${config.baseUrl}`);
        }

        return true;
    }

    /**
     * 重置为默认配置
     */
    async reset() {
        this.config = this.getDefault();
        await this.save(this.config);
        logger.info('配置已重置为默认值');
    }
}
