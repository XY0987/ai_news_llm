/**
 * 彩色日志输出工具
 * 使用 ANSI 转义码实现终端彩色输出
 */

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // 前景色
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // 背景色
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

/**
 * 获取当前时间戳
 * @returns {string} 格式化的时间字符串
 */
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * 日志级别
 */
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS'
};

/**
 * Logger 类
 */
export class Logger {
  constructor(prefix = '') {
    this.prefix = prefix;
  }

  /**
   * 输出调试信息
   */
  debug(...args) {
    const timestamp = colors.dim + getTimestamp() + colors.reset;
    const level = colors.cyan + '[DEBUG]' + colors.reset;
    const prefix = this.prefix ? colors.cyan + `[${this.prefix}]` + colors.reset : '';
    console.log(timestamp, level, prefix, ...args);
  }

  /**
   * 输出普通信息
   */
  info(...args) {
    const timestamp = colors.dim + getTimestamp() + colors.reset;
    const level = colors.blue + '[INFO]' + colors.reset;
    const prefix = this.prefix ? colors.blue + `[${this.prefix}]` + colors.reset : '';
    console.log(timestamp, level, prefix, ...args);
  }

  /**
   * 输出警告信息
   */
  warn(...args) {
    const timestamp = colors.dim + getTimestamp() + colors.reset;
    const level = colors.yellow + '[WARN]' + colors.reset;
    const prefix = this.prefix ? colors.yellow + `[${this.prefix}]` + colors.reset : '';
    console.warn(timestamp, level, prefix, ...args);
  }

  /**
   * 输出错误信息
   */
  error(...args) {
    const timestamp = colors.dim + getTimestamp() + colors.reset;
    const level = colors.red + '[ERROR]' + colors.reset;
    const prefix = this.prefix ? colors.red + `[${this.prefix}]` + colors.reset : '';
    console.error(timestamp, level, prefix, ...args);
  }

  /**
   * 输出成功信息
   */
  success(...args) {
    const timestamp = colors.dim + getTimestamp() + colors.reset;
    const level = colors.green + '[SUCCESS]' + colors.reset;
    const prefix = this.prefix ? colors.green + `[${this.prefix}]` + colors.reset : '';
    console.log(timestamp, level, prefix, ...args);
  }
}

/**
 * 创建带前缀的 Logger 实例
 * @param {string} prefix - 日志前缀
 * @returns {Logger}
 */
export function createLogger(prefix) {
  return new Logger(prefix);
}

/**
 * 默认 logger 实例
 */
export const logger = new Logger();
