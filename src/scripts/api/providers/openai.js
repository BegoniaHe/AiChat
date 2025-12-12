/**
 * OpenAI API 适配器
 */

import { handleSSE } from '../stream.js';

export class OpenAIProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.model = config.model || 'gpt-3.5-turbo';
    this.timeout = config.timeout || 60000;
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
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
          ...options,
        }),
      });

      if (!response.ok) {
        const error = new Error(`OpenAI API Error: ${response.status}`);
        error.status = response.status;
        error.response = await response.text();
        throw error;
      }

      const data = await response.json();
      return data.choices[0].message.content;
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
          ...options,
        }),
      });

      if (!response.ok) {
        const error = new Error(`OpenAI API Error: ${response.status}`);
        error.status = response.status;
        throw error;
      }

      for await (const data of handleSSE(response)) {
        const content = data.choices?.[0]?.delta?.content;
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
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();
    return data.data.filter(m => m.id.includes('gpt')).map(m => m.id);
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      await this.listModels();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
}
