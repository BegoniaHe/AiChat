/**
 * OpenAI 兼容 API Provider
 * 迁移自: src-legacy/scripts/api/providers/openai.js
 */

import { isTauri, safeInvoke } from '$utils/tauri.js';
import { handleSSE, parseSSEText } from './stream.js';

/**
 * 创建 AbortError
 */
function makeAbortError() {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

export class OpenAIProvider {
  constructor(config) {
    this.provider = config.provider || 'openai';
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
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
   * 规范化请求选项
   */
  normalizeOptions(options = {}) {
    const out = {};

    if (typeof options.temperature === 'number') out.temperature = options.temperature;
    if (typeof options.top_p === 'number') out.top_p = options.top_p;
    if (typeof options.presence_penalty === 'number')
      out.presence_penalty = options.presence_penalty;
    if (typeof options.frequency_penalty === 'number')
      out.frequency_penalty = options.frequency_penalty;

    if (Number.isFinite(options.max_tokens)) out.max_tokens = Math.trunc(options.max_tokens);
    if (Number.isFinite(options.maxTokens) && !out.max_tokens)
      out.max_tokens = Math.trunc(options.maxTokens);

    if (typeof options.stop === 'string' || Array.isArray(options.stop)) {
      out.stop = options.stop;
    }

    return out;
  }

  /**
   * 提取错误详情
   */
  extractErrorDetail(bodyText) {
    const raw = String(bodyText ?? '').trim();
    if (!raw) return '';

    try {
      const j = JSON.parse(raw);
      const msg = j?.error?.message || j?.message || j?.detail || j?.error || '';
      if (msg) return String(msg);
    } catch {
      // 不是 JSON
    }

    return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
  }

  /**
   * 发送 HTTP 请求
   */
  async request({ url, method = 'GET', headers = {}, body, signal }) {
    // 优先使用 Tauri 原生 HTTP
    if (isTauri()) {
      if (signal?.aborted) throw makeAbortError();

      try {
        return await safeInvoke('http_request', {
          url,
          method,
          headers,
          body: body != null ? String(body) : null,
          timeout_ms: this.timeout,
        });
      } catch (err) {
        throw new Error(`HTTP request failed: ${err.message}`);
      }
    }

    // 回退到 fetch
    const controller = new AbortController();
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      return {
        status: response.status,
        body: await response.text(),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 非流式聊天
   */
  async chat(messages, options = {}) {
    const url = `${this.baseUrl}/chat/completions`;
    const body = JSON.stringify({
      model: options.model || this.model,
      messages,
      stream: false,
      ...this.normalizeOptions(options),
    });

    const response = await this.request({
      url,
      method: 'POST',
      headers: this.getHeaders(),
      body,
      signal: options.signal,
    });

    if (response.status !== 200) {
      const detail = this.extractErrorDetail(response.body);
      throw new Error(`API error (${response.status}): ${detail}`);
    }

    const data = JSON.parse(response.body);
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * 流式聊天
   */
  async *streamChat(messages, options = {}) {
    const url = `${this.baseUrl}/chat/completions`;
    const body = JSON.stringify({
      model: options.model || this.model,
      messages,
      stream: true,
      ...this.normalizeOptions(options),
    });

    // Tauri 环境使用轮询方式
    if (isTauri()) {
      const response = await this.request({
        url,
        method: 'POST',
        headers: this.getHeaders(),
        body,
        signal: options.signal,
      });

      if (response.status !== 200) {
        const detail = this.extractErrorDetail(response.body);
        throw new Error(`API error (${response.status}): ${detail}`);
      }

      for (const chunk of parseSSEText(response.body)) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) yield content;
      }
      return;
    }

    // 浏览器环境使用 fetch stream
    const controller = new AbortController();
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      const detail = this.extractErrorDetail(text);
      throw new Error(`API error (${response.status}): ${detail}`);
    }

    for await (const chunk of handleSSE(response)) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) yield content;
    }
  }

  /**
   * 获取模型列表
   */
  async listModels() {
    const url = `${this.baseUrl}/models`;

    const response = await this.request({
      url,
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to list models: ${response.status}`);
    }

    const data = JSON.parse(response.body);
    return (data.data || []).map((m) => m.id);
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      await this.listModels();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}
