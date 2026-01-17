/**
 * SSE 流处理工具
 * 迁移自: src-legacy/scripts/api/stream.js
 */

/**
 * 处理 Server-Sent Events (SSE) 流
 * @param {Response} response - Fetch API 返回的响应对象
 * @yields {Object} 解析后的数据
 */
export async function* handleSSE(response) {
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
            yield JSON.parse(data);
          } catch {
            // 忽略无效行
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 处理 Chunked Transfer Encoding 流
 * @param {Response} response - Fetch API 返回的响应对象
 * @yields {string} 文本数据
 */
export async function* handleChunked(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 解析 SSE 文本
 * @param {string} text - SSE 文本
 * @yields {Object} 解析后的数据
 */
export function* parseSSEText(text) {
  const raw = String(text ?? '');
  const lines = raw.split('\n');

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (!data || data === '[DONE]') continue;

    try {
      yield JSON.parse(data);
    } catch {
      // 忽略无效行
    }
  }
}
