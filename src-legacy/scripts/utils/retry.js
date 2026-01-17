/**
 * 重试工具 - 支持指数退避和条件重试
 */

import { logger } from './logger.js';

export class RetryStrategy {
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.initialDelay = options.initialDelay || 1000;
        this.maxDelay = options.maxDelay || 30000;
        this.exponentialBase = options.exponentialBase || 2;
        this.jitter = options.jitter !== false; // 默认启用抖动
    }

    /**
     * 计算延迟时间（指数退避 + 随机抖动）
     */
    calculateDelay(attempt) {
        let delay = this.initialDelay * Math.pow(this.exponentialBase, attempt);
        delay = Math.min(delay, this.maxDelay);

        // 添加随机抖动（避免雪崩效应）
        if (this.jitter) {
            delay = delay * (0.5 + Math.random() * 0.5);
        }

        return Math.floor(delay);
    }

    /**
     * 执行带重试的操作
     * @param {Function} fn - 要执行的异步函数
     * @param {Object} options - 选项
     * @param {Function} options.shouldRetry - 判断是否应该重试
     * @param {Function} options.onRetry - 重试前的回调
     * @returns {Promise} 函数执行结果
     */
    async execute(fn, options = {}) {
        const shouldRetry = options.shouldRetry || (() => true);
        const onRetry = options.onRetry || (() => {});

        let lastError;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                logger.debug(`尝试执行 (${attempt + 1}/${this.maxRetries + 1})`);
                return await fn();
            } catch (error) {
                lastError = error;

                // 检查是否应该重试
                if (!shouldRetry(error)) {
                    logger.error('错误不可重试:', error.message);
                    throw error;
                }

                // 最后一次尝试失败
                if (attempt === this.maxRetries) {
                    logger.error(`所有重试失败 (${this.maxRetries + 1} 次)`, error);
                    throw error;
                }

                // 计算延迟并等待
                const delay = this.calculateDelay(attempt);
                logger.warn(
                    `重试 ${attempt + 1}/${this.maxRetries}，等待 ${delay}ms...`,
                    error.message
                );

                onRetry(attempt, delay, error);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }
}

/**
 * 便捷函数：使用默认策略重试
 */
export async function retryWithBackoff(fn, options = {}) {
    const strategy = new RetryStrategy(options);
    return strategy.execute(fn, options);
}

/**
 * 判断错误是否可重试
 */
export function isRetryableError(error) {
    // 网络错误
    if (error instanceof TypeError && error.message.includes('fetch')) {
        return true;
    }

    // HTTP 状态码
    if (error.status) {
        const retryableStatuses = [408, 429, 500, 502, 503, 504];
        return retryableStatuses.includes(error.status);
    }

    // 超时错误
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
        return true;
    }

    // 速率限制
    if (error.message.includes('rate limit') || error.message.includes('too many requests')) {
        return true;
    }

    return false;
}

/**
 * 创建带超时的 Promise
 */
export function withTimeout(promise, timeoutMs, errorMessage = 'Operation timed out') {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
        )
    ]);
}
