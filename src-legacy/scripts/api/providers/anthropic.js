/**
 * Anthropic (Claude) API 适配器
 */

import { handleSSE } from '../stream.js';
import { createLinkedAbortController, splitRequestOptions } from '../abort.js';

export class AnthropicProvider {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
        this.model = config.model || 'claude-3-5-sonnet-20241022';
        this.timeout = config.timeout || 60000;
        this.apiVersion = '2023-06-01';
    }

    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': this.apiVersion
        };
    }

    /**
     * 转换消息格式（OpenAI -> Anthropic）
     */
    convertMessages(messages) {
        const parseDataUrl = (url) => {
            const raw = String(url || '').trim();
            if (!raw.startsWith('data:')) return null;
            const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
            if (!match) return null;
            return { mime: match[1], data: match[2] };
        };
        const toAnthropicContent = (content) => {
            if (Array.isArray(content)) {
                const parts = [];
                content.forEach((part) => {
                    if (!part || typeof part !== 'object') return;
                    if (part.type === 'text') {
                        const text = String(part.text || '');
                        if (text) parts.push({ type: 'text', text });
                        return;
                    }
                    if (part.type === 'image_url') {
                        const url = part?.image_url?.url;
                        const parsed = parseDataUrl(url);
                        if (parsed?.data) {
                            parts.push({
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: parsed.mime || 'image/jpeg',
                                    data: parsed.data,
                                },
                            });
                        } else if (url) {
                            parts.push({ type: 'text', text: `[图片] ${String(url)}` });
                        }
                    }
                });
                return parts.length ? parts : [{ type: 'text', text: '' }];
            }
            return [{ type: 'text', text: String(content ?? '') }];
        };
        const toSystemText = (content) => {
            if (Array.isArray(content)) {
                return content
                    .map((part) => (part?.type === 'text' ? String(part.text || '') : ''))
                    .filter(Boolean)
                    .join('\n');
            }
            return String(content ?? '');
        };
        const systemMessages = messages.filter(m => m.role === 'system');
        const otherMessages = messages.filter(m => m.role !== 'system');

        const system = systemMessages.map(m => toSystemText(m.content)).join('\n');

        return {
            system: system || undefined,
            messages: otherMessages.map(m => ({
                role: m.role,
                content: toAnthropicContent(m.content),
            })),
        };
    }

    /**
     * 发送聊天消息（非流式）
     */
    async chat(messages, options = {}) {
        const { signal, options: payloadOptionsRaw } = splitRequestOptions(options);
        const maxTokens = payloadOptionsRaw?.maxTokens ?? payloadOptionsRaw?.max_tokens;
        const payloadOptions = { ...(payloadOptionsRaw || {}) };
        delete payloadOptions.maxTokens;
        const { controller, cleanup } = createLinkedAbortController({ timeoutMs: this.timeout, signal });

        const { system, messages: convertedMessages } = this.convertMessages(messages);

        try {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: this.getHeaders(),
                signal: controller.signal,
                body: JSON.stringify({
                    model: this.model,
                    messages: convertedMessages,
                    system: system,
                    max_tokens: maxTokens || payloadOptions.max_tokens || 4096,
                    stream: false,
                    ...payloadOptions
                })
            });

            if (!response.ok) {
                const error = new Error(`Anthropic API Error: ${response.status}`);
                error.status = response.status;
                error.response = await response.text();
                throw error;
            }

            const data = await response.json();
            return data.content[0].text;
        } finally {
            cleanup();
        }
    }

    /**
     * 流式聊天
     */
    async *streamChat(messages, options = {}) {
        const { signal, options: payloadOptionsRaw } = splitRequestOptions(options);
        const maxTokens = payloadOptionsRaw?.maxTokens ?? payloadOptionsRaw?.max_tokens;
        const payloadOptions = { ...(payloadOptionsRaw || {}) };
        delete payloadOptions.maxTokens;
        const { controller, cleanup } = createLinkedAbortController({ timeoutMs: this.timeout, signal });

        const { system, messages: convertedMessages } = this.convertMessages(messages);

        try {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: this.getHeaders(),
                signal: controller.signal,
                body: JSON.stringify({
                    model: this.model,
                    messages: convertedMessages,
                    system: system,
                    max_tokens: maxTokens || payloadOptions.max_tokens || 4096,
                    stream: true,
                    ...payloadOptions
                })
            });

            if (!response.ok) {
                const error = new Error(`Anthropic API Error: ${response.status}`);
                error.status = response.status;
                throw error;
            }

            for await (const data of handleSSE(response)) {
                if (data.type === 'content_block_delta') {
                    const content = data.delta?.text;
                    if (content) {
                        yield content;
                    }
                }
            }
        } finally {
            cleanup();
        }
    }

    /**
     * 获取可用模型列表
     */
    async listModels() {
        // Anthropic 不提供模型列表 API，返回常用模型
        return [
            'claude-3-5-sonnet-20241022',
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307'
        ];
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            // 发送一个最小的请求来验证连接
            const testMessages = [{ role: 'user', content: 'Hi' }];
            await this.chat(testMessages, { maxTokens: 10 });
            return { ok: true };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }
}
