/**
 * Google Vertex AI Provider
 * Supports both Express mode (API key) and Full mode (Service Account JSON)
 */

import { handleSSE } from '../stream.js';

const GEMINI_SAFETY = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

export class VertexAIProvider {
  constructor(config) {
    this.timeout = config.timeout || 60000;
    this.model = config.model || 'gemini-2.0-flash-exp';
    this.region = config.vertexaiRegion || 'us-central1';

    // Check if using Service Account JSON or API key
    this.serviceAccountJson = config.vertexaiServiceAccount;
    this.apiKey = config.apiKey;

    // Extract Project ID from Service Account JSON if available
    if (this.serviceAccountJson) {
      try {
        const sa = typeof this.serviceAccountJson === 'string'
          ? JSON.parse(this.serviceAccountJson)
          : this.serviceAccountJson;
        this.projectId = sa.project_id;
      } catch (e) {
        console.warn('Failed to parse Service Account JSON:', e);
      }
    }

    // Fall back to explicit projectId if provided
    if (!this.projectId) {
      this.projectId = config.vertexaiProjectId;
    }

    // Determine base URL
    const baseUrl = config.baseUrl || (
      this.region === 'global'
        ? 'https://aiplatform.googleapis.com'
        : `https://${this.region}-aiplatform.googleapis.com`
    );
    this.baseUrl = baseUrl;

    // Cache for OAuth2 token
    this.accessToken = null;
    this.tokenExpiry = 0;
  }

  /**
   * Get OAuth2 access token from Service Account JSON
   */
  async getAccessToken() {
    // Check if we have a cached valid token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.serviceAccountJson) {
      throw new Error('Service Account JSON is required for Vertex AI authentication');
    }

    try {
      // Parse service account JSON
      const serviceAccount = typeof this.serviceAccountJson === 'string'
        ? JSON.parse(this.serviceAccountJson)
        : this.serviceAccountJson;

      // Create JWT for OAuth2
      const header = {
        alg: 'RS256',
        typ: 'JWT',
        kid: serviceAccount.private_key_id,
      };

      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: serviceAccount.client_email,
        sub: serviceAccount.client_email,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
      };

      // Note: In a real browser environment, we cannot sign JWT with RS256
      // This would require a backend service to handle authentication
      // For now, we'll throw an error with instructions
      throw new Error(
        'Vertex AI Service Account 需要後端簽名，當前前端環境未實現。請改用 Google AI Studio (Makersuite) 或提供後端代理。'
      );

      // The proper implementation would be:
      // 1. Send service account JSON to backend
      // 2. Backend creates and signs JWT
      // 3. Backend exchanges JWT for access token
      // 4. Backend returns access token to frontend

    } catch (error) {
      if (error.message.includes('requires a backend service')) {
        throw error;
      }
      throw new Error(`Failed to authenticate with Service Account: ${error.message}`);
    }
  }

  /**
   * Convert OpenAI-style messages to Gemini format
   */
  convertMessages(messages) {
    const contents = [];
    let systemInstruction = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
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

    if (!this.projectId) {
      throw new Error('Vertex AI requires projectId');
    }

    const url = `${this.baseUrl}/v1/projects/${this.projectId}/locations/${this.region}/publishers/google/models/${this.model}:${endpoint}`;
    return stream ? `${url}?alt=sse` : url;
  }

  async getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Use Service Account authentication if available
    if (this.serviceAccountJson) {
      const token = await this.getAccessToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
    else {
      // API Key 不能直接作為 Vertex AI Authorization，提前提示
      throw new Error('Vertex AI 需要 Service Account (後端簽名)；前端不支持僅用 API Key');
    }

    return headers;
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
      const headers = await this.getHeaders();
      const body = this.buildRequestBody(messages, options);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Vertex AI Error: ${response.status} ${response.statusText}`);
        error.status = response.status;
        error.response = errorText;
        throw error;
      }

      const data = await response.json();

      const candidates = data?.candidates;
      if (!candidates || candidates.length === 0) {
        let errorMsg = 'No candidates returned';
        if (data?.promptFeedback?.blockReason) {
          errorMsg += `: ${data.promptFeedback.blockReason}`;
        }
        throw new Error(errorMsg);
      }

      const responseContent = candidates[0].content ?? candidates[0].output;
      const responseText = typeof responseContent === 'string'
        ? responseContent
        : responseContent?.parts
            ?.filter(part => !part.thought)
            ?.map(part => part.text)
            ?.join('\n\n');

      if (!responseText) {
        throw new Error('Empty response from Vertex AI');
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
      const headers = await this.getHeaders();
      const body = this.buildRequestBody(messages, options);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex AI Error: ${response.status} ${errorText}`);
      }

      for await (const data of handleSSE(response)) {
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
      if (!this.serviceAccountJson) {
        throw new Error('Vertex AI 列表需要 Service Account，前端未啟用，請改用 Makersuite');
      }
      if (!this.projectId) {
        throw new Error('Project ID required');
      }

      const headers = await this.getHeaders();
      const url = `${this.baseUrl}/v1/projects/${this.projectId}/locations/${this.region}/publishers/google/models`;

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      const models = data.models || [];
      return models.map(m => m.name.split('/').pop());
    } catch (error) {
      console.warn('Failed to list Vertex AI models:', error);
      return [
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
      ];
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const testMessages = [{ role: 'user', content: 'Hi' }];
      await this.chat(testMessages);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
}
