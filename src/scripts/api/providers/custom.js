/**
 * 自定义 API 适配器
 * 支持兼容 OpenAI 格式的自建 API
 */

import { handleSSE } from '../stream.js';

export class CustomProvider {
    constructor(config) {
        this.apiKey = config.apiKey || '';
        this.baseUrl = config.baseUrl;
        this.model = config.model || 'default';
        this.timeout = config.timeout || 60000;
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        return headers;
    }

    /**
     * 发送聊天消息（非流式）
     */
    async chat(messages, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: this.getHeaders(),
                signal: controller.signal,
                body: JSON.stringify({
                    model: this.model,
                    messages: messages,
                    stream: false,
                    ...options
                })
            });

            if (!response.ok) {
                const error = new Error(`Custom API Error: ${response.status}`);
                error.status = response.status;
                error.response = await response.text();
                throw error;
            }

            const data = await response.json();

            // 支持多种响应格式
            if (data.choices && data.choices[0]) {
                return data.choices[0].message?.content || data.choices[0].text;
            } else if (data.response) {
                return data.response;
            } else if (data.content) {
                return data.content;
            }

            throw new Error('Unknown response format');
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * 流式聊天
     */
    async *streamChat(messages, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: this.getHeaders(),
                signal: controller.signal,
                body: JSON.stringify({
                    model: this.model,
                    messages: messages,
                    stream: true,
                    ...options
                })
            });

            if (!response.ok) {
                const error = new Error(`Custom API Error: ${response.status}`);
                error.status = response.status;
                throw error;
            }

            for await (const data of handleSSE(response)) {
                // 支持多种流式响应格式
                const content =
                    data.choices?.[0]?.delta?.content ||
                    data.choices?.[0]?.text ||
                    data.delta?.content ||
                    data.content;

                if (content) {
                    yield content;
                }
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * 获取可用模型列表
     */
    async listModels() {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: this.getHeaders()
            });

            if (!response.ok) {
                return [this.model]; // 降级：返回当前配置的模型
            }

            const data = await response.json();

            if (Array.isArray(data)) {
                return data.map(m => m.id || m.name || m);
            } else if (data.data && Array.isArray(data.data)) {
                return data.data.map(m => m.id || m.name || m);
            }

            return [this.model];
        } catch (error) {
            console.warn('Failed to fetch models:', error);
            return [this.model];
        }
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            const testMessages = [{ role: 'user', content: 'test' }];
            await this.chat(testMessages, { max_tokens: 5 });
            return { ok: true };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }
}
