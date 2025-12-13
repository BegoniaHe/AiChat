/**
 * UI 桥接层 - 连接原有 UI 代码和新的 API 层
 */

import { LLMClient } from '../api/client.js';
import { ConfigManager } from '../storage/config.js';
import { ChatStorage } from '../storage/chat.js';
import { WorldInfoStore, convertSTWorld } from '../storage/worldinfo.js';
import { logger } from '../utils/logger.js';
import { retryWithBackoff, isRetryableError } from '../utils/retry.js';
// 在瀏覽器（開發模式）與 Tauri 環境下兼容的 invoke
const safeInvoke = async (cmd, args) => {
    const invoker = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INVOKE__;
    if (typeof invoker !== 'function') {
        throw new Error('Tauri invoke not available');
    }
    return invoker(cmd, args);
};

class AppBridge {
    constructor() {
        this.config = new ConfigManager();
        this.chatStorage = new ChatStorage();
        this.worldStore = new WorldInfoStore();
        this.client = null;
        this.initialized = false;
        this.currentCharacterId = 'default';
        this.currentWorldId = null;
        this.activeSessionId = 'default';
        this.worldSessionMap = this.loadWorldSessionMap();
        this.isGenerating = false;
        this.hydrateWorldSessionMap();
    }

    loadWorldSessionMap() {
        try {
            const raw = localStorage.getItem('world_session_map_v1');
            return raw ? JSON.parse(raw) : {};
        } catch (err) {
            logger.warn('world-session map 讀取失敗，重置', err);
            return {};
        }
    }

    async hydrateWorldSessionMap() {
        try {
            const kv = await safeInvoke('load_kv', { name: 'world_session_map_v1' });
            if (kv && typeof kv === 'object' && Object.keys(kv).length) {
                this.worldSessionMap = kv;
                localStorage.setItem('world_session_map_v1', JSON.stringify(kv));
                // 切換當前 session 的世界書
                if (this.activeSessionId && kv[this.activeSessionId]) {
                    this.currentWorldId = kv[this.activeSessionId];
                    window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: this.currentWorldId } }));
                }
                logger.info('world-session map hydrated from disk');
            }
        } catch (err) {
            logger.debug('world-session map 磁碟加載失敗（可能非 Tauri）', err);
        }
    }

    persistWorldSessionMap() {
        localStorage.setItem('world_session_map_v1', JSON.stringify(this.worldSessionMap || {}));
        safeInvoke('save_kv', { name: 'world_session_map_v1', data: this.worldSessionMap }).catch(() => {});
    }

    /**
     * 初始化桥接层
     */
    async init() {
        try {
            logger.info('初始化 AppBridge...');

            // 加载配置
            const config = await this.config.load();

            // 初始化 LLM 客户端
            if (config.apiKey) {
                this.client = new LLMClient(config);
                logger.info(`LLM 客户端初始化成功 (provider: ${config.provider})`);
            } else {
                logger.warn('未配置 API Key，请先配置');
            }

            this.initialized = true;
            logger.info('AppBridge 初始化完成');

            return true;
        } catch (error) {
            logger.error('AppBridge 初始化失败:', error);
            return false;
        }
    }

    /**
     * 检查是否已配置
     */
    isConfigured() {
        const config = this.config.get();
        return config && config.apiKey && config.apiKey.length > 0;
    }

    /**
     * 切換當前會話（影響世界書選中）
     */
    setActiveSession(sessionId = 'default') {
        this.activeSessionId = sessionId;
        this.currentWorldId = this.worldSessionMap[sessionId] || null;
        window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: this.currentWorldId } }));
    }

    /**
     * 生成 AI 回复
     * @param {string} userMessage - 用户消息
     * @param {Object} context - 上下文（角色设定、历史消息等）
     * @returns {Promise<string>|AsyncGenerator<string>} 回复内容或流
     */
    async generate(userMessage, context = {}) {
        if (!this.initialized) {
            await this.init();
        }

        if (!this.isConfigured()) {
            throw new Error('请先配置 API 信息');
        }

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            throw new Error('當前離線，請連接網絡後再試');
        }

        if (this.isGenerating) {
            throw new Error('正在生成中，请稍候...');
        }

        this.isGenerating = true;

        try {
            const messages = this.buildMessages(userMessage, context);
            const config = this.config.get();

            logger.debug('发送消息到 LLM:', { messageCount: messages.length, stream: config.stream });

            if (config.stream) {
                return this.generateStream(messages);
            } else {
                const response = await retryWithBackoff(
                    () => this.client.chat(messages),
                    {
                        maxRetries: config.maxRetries || 3,
                        shouldRetry: isRetryableError
                    }
                );

                // 保存到历史记录
                await this.saveToHistory(userMessage, response);

                return response;
            }
        } catch (error) {
            logger.error('生成失败:', error);
            throw error;
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * 流式生成
     */
    async *generateStream(messages) {
        let fullResponse = '';
        const userMessage = messages[messages.length - 1].content;

        try {
            for await (const chunk of this.client.streamChat(messages)) {
                fullResponse += chunk;
                yield chunk;
            }

            // 流式完成后保存到历史记录
            await this.saveToHistory(userMessage, fullResponse);
        } catch (error) {
            logger.error('流式生成失败:', error);
            throw error;
        }
    }

    /**
     * 构建消息数组
     */
    buildMessages(userMessage, context = {}) {
        const messages = [];

        // 系统提示词
        if (context.systemPrompt) {
            messages.push({
                role: 'system',
                content: context.systemPrompt
            });
        }

        // 世界書提示
        const worldPrompt = this.getActiveWorldPrompt();
        if (worldPrompt) {
            messages.push({
                role: 'system',
                content: worldPrompt
            });
        }

        // 角色设定
        if (context.character) {
            let characterPrompt = `你正在扮演: ${context.character.name}`;
            if (context.character.description) {
                characterPrompt += `\n\n角色描述:\n${context.character.description}`;
            }
            if (context.character.personality) {
                characterPrompt += `\n\n性格特点:\n${context.character.personality}`;
            }
            messages.push({
                role: 'system',
                content: characterPrompt
            });
        }

        // 历史消息
        if (context.history && context.history.length > 0) {
            messages.push(...context.history);
        }

        // 当前用户消息
        messages.push({
            role: 'user',
            content: userMessage
        });

        return messages;
    }

    /**
     * 保存到聊天历史
     */
    async saveToHistory(userMessage, assistantMessage) {
        try {
            const messages = [
                {
                    role: 'user',
                    content: userMessage,
                    timestamp: Date.now()
                },
                {
                    role: 'assistant',
                    content: assistantMessage,
                    timestamp: Date.now()
                }
            ];

            await this.chatStorage.saveMessages(this.currentCharacterId, messages);
            logger.debug('聊天记录已保存');
        } catch (error) {
            logger.error('保存聊天记录失败:', error);
        }
    }

    /**
     * 获取聊天历史
     */
    async getChatHistory(characterId, limit = 50) {
        const messages = await this.chatStorage.getMessages(characterId || this.currentCharacterId, limit);
        return messages;
    }

    /**
     * 清除聊天历史
     */
    async clearChatHistory(characterId) {
        await this.chatStorage.clearMessages(characterId || this.currentCharacterId);
        logger.info('聊天记录已清除');
    }

    /**
     * 获取世界书数据
     */
    async getWorldInfo(characterId) {
        try {
            const id = characterId || this.currentCharacterId;
            if (this.worldStore.ready) {
                await this.worldStore.ready;
            }
            const local = this.worldStore.load(id);
            if (local) return local;

            // 後端佔位（若已實作）
            try {
                const res = await safeInvoke('get_world_info', { characterId: id });
                return res;
            } catch (err) {
                logger.debug('後端世界書命令不可用，使用空白', err);
            }
            return null;
        } catch (error) {
            logger.error('获取世界书失败:', error);
            return {};
        }
    }

    /**
     * 保存世界书数据
     */
    async saveWorldInfo(characterId, data) {
        try {
            const id = characterId || this.currentCharacterId;
            await this.worldStore.save(id, data);

            // 如果後端支持可同步保存（忽略失敗）
            safeInvoke('save_world_info', { characterId: id, data }).catch(() => {});

            logger.debug('世界书已保存', id);
        } catch (error) {
            logger.error('保存世界书失败:', error);
            throw error;
        }
    }

    async listWorlds() {
        if (this.worldStore.ready) {
            await this.worldStore.ready;
        }
        return this.worldStore.list();
    }

    setCurrentWorld(worldId, sessionId = this.activeSessionId) {
        this.currentWorldId = worldId;
        if (sessionId) {
            this.worldSessionMap[sessionId] = worldId;
            this.persistWorldSessionMap();
        }
        window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId } }));
    }

    /**
        * 生成當前世界書的提示串
        */
    getActiveWorldPrompt() {
        if (!this.currentWorldId) return '';
        const data = this.worldStore.load(this.currentWorldId);
        if (!data || !Array.isArray(data.entries)) return '';
        const entries = [...data.entries].sort((a, b) => (b.priority || 0) - (a.priority || 0));
        const parts = entries.map(e => e.content).filter(Boolean);
        if (!parts.length) return '';
        return `世界書提示（${this.currentWorldId}）：\n` + parts.join('\n\n');
    }

    getWorldForSession(sessionId = this.activeSessionId) {
        return this.worldSessionMap[sessionId] || null;
    }
}

// 创建全局实例
window.appBridge = new AppBridge();

// 兼容层：提供类似 SillyTavern 的全局函数
window.triggerSlash = async (command) => {
    logger.info('执行命令:', command);
    // TODO: 解析并执行命令
    // 例如: /echo -> 显示消息, /gen -> 生成, /clear -> 清空
};

window.getWorldInfoSettings = async () => {
    return await window.appBridge.getWorldInfo();
};

window.saveWorldInfo = async (data) => {
    await window.appBridge.saveWorldInfo(window.appBridge.currentCharacterId, data);
};

// 兼容：從 ST world JSON 導入（期望前端讀取後調用）
window.importSTWorld = async (jsonObj, name = 'imported') => {
    const simplified = convertSTWorld(jsonObj, name);
    await window.appBridge.saveWorldInfo(name, simplified);
    return simplified;
};

// 初始化
window.appBridge.init().then(() => {
    logger.info('✅ App Bridge 初始化完成');
}).catch(error => {
    logger.error('❌ App Bridge 初始化失败:', error);
});

export { AppBridge };
