
/**
 * Tauri 兼容工具
 * 提供在浏览器（开发模式）与 Tauri 环境下通用的 invoke 方法
 */

export const safeInvoke = async (cmd, args) => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    // 尝试多种路径获取 invoke 函数
    const invoker = g?.__TAURI__?.core?.invoke || 
                    g?.__TAURI__?.invoke || 
                    g?.__TAURI_INVOKE__ || 
                    g?.__TAURI_INTERNALS__?.invoke;
    
    if (typeof invoker !== 'function') {
        // 如果找不到 invoke，抛出错误，调用者应捕获并回退到 localStorage 等
        throw new Error('Tauri invoke not available');
    }
    
    return invoker(cmd, args);
};
