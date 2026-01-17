/**
 * Deepseek API Provider
 * Uses OpenAI-compatible API
 */

import { OpenAIProvider } from './openai.js';

export class DeepseekProvider extends OpenAIProvider {
  constructor(config) {
    // Deepseek uses OpenAI-compatible API
    const deepseekConfig = {
      ...config,
      baseUrl: config.baseUrl || 'https://api.deepseek.com/v1',
      model: config.model || 'deepseek-chat',
    };

    super(deepseekConfig);
  }

  /**
   * Get available Deepseek models
   */
  async listModels() {
    try {
      const data = await this.requestJson({
        url: `${this.baseUrl}/models`,
        method: 'GET',
        headers: this.getHeaders(),
      });
      return (data.data || []).filter(m => m.id.includes('deepseek')).map(m => m.id);
    } catch (error) {
      console.warn('Failed to list Deepseek models, using defaults:', error);
      // Return common Deepseek models as fallback
      return [
        'deepseek-chat',
        'deepseek-coder',
      ];
    }
  }

  /**
   * Health check
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
