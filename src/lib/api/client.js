/**
 * LLM API 客户端
 * 迁移自: src-legacy/scripts/api/client.js
 */

import { AnthropicProvider } from './anthropic.js';
import { CustomProvider } from './custom.js';
import { DeepseekProvider } from './deepseek.js';
import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';

const PROVIDERS = {
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  gemini: GeminiProvider,
  deepseek: DeepseekProvider,
  makersuite: GeminiProvider, // MakerSuite 使用 Gemini Provider
  vertexai: GeminiProvider, // Vertex AI 使用 Gemini Provider
  custom: CustomProvider,
};

export class LLMClient {
  constructor(config) {
    this.config = config;
    this.provider = this.createProvider(config.provider);
  }

  /**
   * 创建 Provider 实例
   */
  createProvider(type) {
    const ProviderClass = PROVIDERS[type] || OpenAIProvider;
    return new ProviderClass(this.config);
  }

  /**
   * 非流式聊天
   * @param {Array} messages - 消息数组
   * @param {Object} options - 选项
   * @returns {Promise<string>} AI 回复
   */
  async chat(messages, options = {}) {
    return this.provider.chat(messages, options);
  }

  /**
   * 流式聊天
   * @param {Array} messages - 消息数组
   * @param {Object} options - 选项
   * @yields {string} 逐字符文本
   */
  async *streamChat(messages, options = {}) {
    yield* this.provider.streamChat(messages, options);
  }

  /**
   * 获取模型列表
   */
  async listModels() {
    return this.provider.listModels();
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    return this.provider.healthCheck();
  }

  /**
   * 重新配置
   */
  reconfigure(newConfig) {
    this.config = newConfig;
    this.provider = this.createProvider(newConfig.provider);
  }
}

/**
 * 创建 LLM 客户端实例
 */
export function createLLMClient(config) {
  return new LLMClient(config);
}
