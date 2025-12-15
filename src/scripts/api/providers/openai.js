/**
 * OpenAI API 适配器
 */

import { handleSSE } from '../stream.js';

const getTauriInvoker = () => {
  const g = typeof globalThis !== 'undefined' ? globalThis : undefined;
  // Tauri v2 typically exposes __TAURI__.core.invoke; some builds expose __TAURI_INVOKE__.
  const inv =
    g?.__TAURI__?.core?.invoke ||
    g?.__TAURI__?.invoke ||
    g?.__TAURI_INVOKE__ ||
    g?.__TAURI_INTERNALS__?.invoke;
  return inv;
};

const isTauriWebview = () => {
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : undefined;
    const origin = String(g?.location?.origin || '');
    return Boolean(g?.__TAURI__ || g?.__TAURI_INTERNALS__ || origin.includes('tauri.localhost'));
  } catch (_e) {
    return false;
  }
};

const parseSSEText = function* (text) {
  const raw = String(text ?? '');
  const lines = raw.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (!data || data === '[DONE]') continue;
    try {
      yield JSON.parse(data);
    } catch (_e) {
      // ignore partial/invalid lines
    }
  }
};

export class OpenAIProvider {
  constructor(config) {
    this.provider = config.provider || 'openai';
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

  canUseNativeHttp() {
    try {
      return typeof getTauriInvoker() === 'function';
    } catch (_e) {
      return false;
    }
  }

  normalizeOptions(options = {}) {
    const src = (options && typeof options === 'object') ? options : {};
    const out = {};

    // Common OpenAI-compatible parameters
    if (typeof src.temperature === 'number') out.temperature = src.temperature;
    if (typeof src.top_p === 'number') out.top_p = src.top_p;
    if (typeof src.presence_penalty === 'number') out.presence_penalty = src.presence_penalty;
    if (typeof src.frequency_penalty === 'number') out.frequency_penalty = src.frequency_penalty;

    // Token limits
    if (Number.isFinite(src.max_tokens)) out.max_tokens = Math.trunc(src.max_tokens);
    if (Number.isFinite(src.maxTokens) && !Number.isFinite(out.max_tokens)) out.max_tokens = Math.trunc(src.maxTokens);

    // stop can be string or array
    if (typeof src.stop === 'string' || Array.isArray(src.stop)) out.stop = src.stop;

    // Some servers reject unsupported fields (DeepSeek is stricter).
    const isDeepSeek = String(this.provider || '').toLowerCase() === 'deepseek';
    if (!isDeepSeek) {
      if (Number.isFinite(src.n)) out.n = Math.trunc(src.n);
      if (Number.isFinite(src.seed)) out.seed = Math.trunc(src.seed);
    }

    return out;
  }

  extractErrorDetail(bodyText) {
    const raw = String(bodyText ?? '').trim();
    if (!raw) return '';
    try {
      const j = JSON.parse(raw);
      const msg = j?.error?.message || j?.message || j?.detail || j?.error || '';
      if (msg) return String(msg);
    } catch (_e) {}
    return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
  }

  async request({ url, method = 'GET', headers = {}, body = undefined }) {
    const mergedHeaders = { ...headers };
    const invoker = getTauriInvoker();
    if (typeof invoker === 'function') {
      try {
        return await invoker('http_request', {
          url,
          method,
          headers: mergedHeaders,
          body: typeof body === 'string' ? body : body == null ? null : String(body),
          timeout_ms: this.timeout,
        });
      } catch (err) {
        if (isTauriWebview()) {
          const e = new Error(`native http_request failed: ${err?.message || err}`);
          e.cause = err;
          throw e;
        }
        console.warn('native http_request failed, fallback to fetch:', err);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(url, {
        method,
        headers: mergedHeaders,
        signal: controller.signal,
        body,
      });
      const text = await response.text();
      const outHeaders = {};
      response.headers.forEach((v, k) => {
        outHeaders[k] = v;
      });
      return { status: response.status, ok: response.ok, headers: outHeaders, body: text };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async requestJson({ url, method = 'GET', headers = {}, body = undefined }) {
    const res = await this.request({ url, method, headers, body });
    if (!res.ok) {
      const detail = this.extractErrorDetail(res.body);
      const error = new Error(`OpenAI API Error: ${res.status}${detail ? ` - ${detail}` : ''}`);
      error.status = res.status;
      error.response = res.body;
      throw error;
    }
    try {
      return JSON.parse(res.body || '{}');
    } catch (e) {
      const error = new Error(`Invalid JSON response: ${e.message}`);
      error.status = res.status;
      error.response = res.body;
      throw error;
    }
  }

  /**
   * 发送聊天消息（非流式）
   */
  async chat(messages, options = {}) {
    const normalized = this.normalizeOptions(options);
    const data = await this.requestJson({
      url: `${this.baseUrl}/chat/completions`,
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        stream: false,
        ...normalized,
      }),
    });

    return data.choices?.[0]?.message?.content ?? '';
  }

  /**
   * 流式聊天
   */
  async *streamChat(messages, options = {}) {
    const normalized = this.normalizeOptions(options);
    const payload = JSON.stringify({
      model: this.model,
      messages: messages,
      stream: true,
      ...normalized,
    });

    if (this.canUseNativeHttp()) {
      const res = await this.request({
        url: `${this.baseUrl}/chat/completions`,
        method: 'POST',
        headers: { ...this.getHeaders(), Accept: 'text/event-stream' },
        body: payload,
      });
      if (!res.ok) {
        const detail = this.extractErrorDetail(res.body);
        const error = new Error(`OpenAI API Error: ${res.status}${detail ? ` - ${detail}` : ''}`);
        error.status = res.status;
        error.response = res.body;
        throw error;
      }
      for (const data of parseSSEText(res.body)) {
        const content = data.choices?.[0]?.delta?.content;
        if (content) yield content;
      }
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { ...this.getHeaders(), Accept: 'text/event-stream' },
        signal: controller.signal,
        body: payload,
      });

      if (!response.ok) {
        const txt = await response.text();
        const detail = this.extractErrorDetail(txt);
        const error = new Error(`OpenAI API Error: ${response.status}${detail ? ` - ${detail}` : ''}`);
        error.status = response.status;
        error.response = txt;
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
    const data = await this.requestJson({
      url: `${this.baseUrl}/models`,
      method: 'GET',
      headers: this.getHeaders(),
    });

    return (data.data || []).filter(m => m.id.includes('gpt')).map(m => m.id);
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
