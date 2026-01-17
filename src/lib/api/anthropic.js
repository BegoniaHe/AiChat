/**
 * Anthropic API Provider
 */

import { isTauri, safeInvoke } from '$utils/tauri.js';

export class AnthropicProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    this.model = config.model || 'claude-3-sonnet-20240229';
    this.timeout = config.timeout || 60000;
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  /**
   * 转换 OpenAI 格式消息为 Anthropic 格式
   */
  convertMessages(messages) {
    let systemPrompt = '';
    const converted = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt += (systemPrompt ? '\n' : '') + msg.content;
      } else {
        converted.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        });
      }
    }

    return { system: systemPrompt, messages: converted };
  }

  async chat(messages, options = {}) {
    const url = `${this.baseUrl}/v1/messages`;
    const { system, messages: converted } = this.convertMessages(messages);

    const body = JSON.stringify({
      model: options.model || this.model,
      messages: converted,
      system: system || undefined,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature,
    });

    const response = await this.request({
      url,
      method: 'POST',
      headers: this.getHeaders(),
      body,
    });

    if (response.status !== 200) {
      throw new Error(`Anthropic API error (${response.status})`);
    }

    const data = JSON.parse(response.body);
    return data.content?.[0]?.text || '';
  }

  async *streamChat(messages, options = {}) {
    const url = `${this.baseUrl}/v1/messages`;
    const { system, messages: converted } = this.convertMessages(messages);

    const body = JSON.stringify({
      model: options.model || this.model,
      messages: converted,
      system: system || undefined,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature,
      stream: true,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body,
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta') {
                const text = parsed.delta?.text;
                if (text) yield text;
              }
            } catch {
              // 忽略
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async request({ url, method, headers, body }) {
    if (isTauri()) {
      return safeInvoke('http_request', {
        url,
        method,
        headers,
        body,
        timeout_ms: this.timeout,
      });
    }

    const response = await fetch(url, { method, headers, body });
    return {
      status: response.status,
      body: await response.text(),
    };
  }

  async listModels() {
    return [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-3-5-sonnet-20240620',
    ];
  }

  async healthCheck() {
    return { ok: Boolean(this.apiKey), error: this.apiKey ? undefined : 'No API key' };
  }
}
