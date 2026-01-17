/**
 * 日志工具
 * 迁移自: src-legacy/scripts/utils/logger.js
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS = {
  debug: '#9CA3AF',
  info: '#3B82F6',
  warn: '#F59E0B',
  error: '#EF4444',
};

class Logger {
  constructor() {
    this.level = import.meta.env.DEV ? 'debug' : 'info';
  }

  setLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
      this.level = level;
    }
  }

  _shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  _format(level, message, ...args) {
    const timestamp = new Date().toISOString().slice(11, 23);
    const color = COLORS[level];
    const prefix = `%c[${timestamp}] [${level.toUpperCase()}]`;
    console.log(prefix, `color: ${color}; font-weight: bold`, message, ...args);
  }

  debug(message, ...args) {
    if (this._shouldLog('debug')) {
      this._format('debug', message, ...args);
    }
  }

  info(message, ...args) {
    if (this._shouldLog('info')) {
      this._format('info', message, ...args);
    }
  }

  warn(message, ...args) {
    if (this._shouldLog('warn')) {
      this._format('warn', message, ...args);
    }
  }

  error(message, ...args) {
    if (this._shouldLog('error')) {
      this._format('error', message, ...args);
    }
  }
}

export const logger = new Logger();
