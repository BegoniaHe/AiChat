/**
 * Google AI Studio (Makersuite) API Provider
 * Uses API key in URL parameter
 */

import { handleSSE } from '../stream.js';

const GEMINI_SAFETY = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

export class MakersuiteProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-2.0-flash-exp';
    this.timeout = config.timeout || 60000;
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com';
    this.apiVersion = config.apiVersion || 'v1beta';
  }

  /**
   * Convert OpenAI-style messages to Gemini format
   */
  convertMessages(messages) {
    const contents = [];
    let systemInstruction = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Accumulate system messages into systemInstruction
        systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    return { contents, systemInstruction };
  }

  /**
   * Build the request URL
   */
  buildUrl(stream = false) {
    const endpoint = stream ? 'streamGenerateContent' : 'generateContent';
    const url = `${this.baseUrl}/${this.apiVersion}/models/${this.model}:${endpoint}`;
    const keyParam = `key=${this.apiKey}`;
    return stream ? `${url}?${keyParam}&alt=sse` : `${url}?${keyParam}`;
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Build request body in Gemini format
   */
  buildRequestBody(messages, options = {}) {
    const { contents, systemInstruction } = this.convertMessages(messages);

    const body = {
      contents,
      safetySettings: GEMINI_SAFETY,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        topP: options.top_p ?? 0.9,
        topK: options.top_k ?? 40,
        maxOutputTokens: options.maxTokens ?? 2048,
      },
    };

    // Add system instruction if present
    if (systemInstruction) {
      body.systemInstruction = {
        role: 'user',
        parts: [{ text: systemInstruction }],
      };
    }

    return body;
  }

  /**
   * Send chat message (non-streaming)
   */
  async chat(messages, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = this.buildUrl(false);
      const body = this.buildRequestBody(messages, options);

      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Gemini API Error: ${response.status} ${response.statusText}`);
        error.status = response.status;
        error.response = errorText;
        throw error;
      }

      const data = await response.json();

      // Check for candidates
      const candidates = data?.candidates;
      if (!candidates || candidates.length === 0) {
        let errorMsg = 'No candidates returned';
        if (data?.promptFeedback?.blockReason) {
          errorMsg += `: ${data.promptFeedback.blockReason}`;
        }
        throw new Error(errorMsg);
      }

      // Extract text from response
      const responseContent = candidates[0].content ?? candidates[0].output;
      const responseText = typeof responseContent === 'string'
        ? responseContent
        : responseContent?.parts
            ?.filter(part => !part.thought)
            ?.map(part => part.text)
            ?.join('\n\n');

      if (!responseText) {
        throw new Error('Empty response from Gemini');
      }

      return responseText;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Stream chat messages
   */
  async *streamChat(messages, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = this.buildUrl(true);
      const body = this.buildRequestBody(messages, options);

      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} ${errorText}`);
      }

      // Handle SSE stream
      for await (const data of handleSSE(response)) {
        // Extract text from each chunk
        const candidates = data?.candidates;
        if (candidates && candidates.length > 0) {
          const content = candidates[0].content;
          if (content?.parts) {
            for (const part of content.parts) {
              if (part.text) {
                yield part.text;
              }
            }
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * List available models
   */
  async listModels() {
    try {
      const url = `${this.baseUrl}/${this.apiVersion}/models?key=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();

      // Filter for models that support generateContent
      const models = data.models || [];
      return models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.split('/').pop()); // Extract model ID from full name
    } catch (error) {
      console.warn('Failed to list Gemini models:', error);
      // Return common models as fallback
      return [
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-1.5-pro-002',
        'gemini-1.5-flash-002',
      ];
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Try a simple request with minimal content
      const testMessages = [{ role: 'user', content: 'Hi' }];
      await this.chat(testMessages);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
}
