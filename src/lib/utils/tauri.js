/**
 * Tauri 工具函数
 * 迁移自: src-legacy/scripts/utils/tauri.js
 */

/**
 * 检测是否在 Tauri 环境中运行
 */
export function isTauri() {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  return Boolean(g?.__TAURI__);
}

/**
 * 获取 Tauri invoke 函数
 */
function getInvoker() {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  return (
    g?.__TAURI__?.core?.invoke ||
    g?.__TAURI__?.invoke ||
    g?.__TAURI_INVOKE__ ||
    g?.__TAURI_INTERNALS__?.invoke
  );
}

/**
 * 等待 Tauri invoke 函数可用
 */
async function waitForInvoker(timeoutMs = 5000) {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  if (!g?.__TAURI__) return null;

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const inv = getInvoker();
    if (typeof inv === 'function') return inv;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

/**
 * 安全调用 Tauri 命令
 * @param {string} cmd - 命令名称
 * @param {object} args - 参数
 * @returns {Promise<any>}
 */
export async function safeInvoke(cmd, args = {}) {
  const invoker = getInvoker() || (await waitForInvoker());
  if (typeof invoker !== 'function') {
    throw new Error('Tauri invoke not available');
  }
  return invoker(cmd, args);
}

/**
 * 尝试调用 Tauri 命令，失败时返回默认值
 * @param {string} cmd - 命令名称
 * @param {object} args - 参数
 * @param {any} defaultValue - 默认值
 * @returns {Promise<any>}
 */
export async function tryInvoke(cmd, args = {}, defaultValue = null) {
  try {
    return await safeInvoke(cmd, args);
  } catch {
    return defaultValue;
  }
}
