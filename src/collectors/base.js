import { retryWithBackoff, shouldRetryError } from '../services/retry.js';
import { validateNewsItems } from '../models/news-item.js';
import { createLogger } from '../utils/logger.js';

/**
 * BaseCollector 抽象类
 * 所有数据源采集器的基类
 */
export class BaseCollector {
  constructor(config) {
    this.config = config;
    this.logger = createLogger(config.name);
  }

  /**
   * 采集新闻 - 子类必须实现此方法
   * @returns {Promise<NewsItem[]>}
   */
  async collect() {
    throw new Error('collect() 方法必须由子类实现');
  }

  /**
   * 带重试的网络请求
   * @param {Function} fn - 异步函数
   * @returns {Promise<any>}
   */
  async retryWithBackoff(fn) {
    return retryWithBackoff(fn, {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      shouldRetry: shouldRetryError,
      onRetry: (error, attempt) => {
        this.logger.warn(`重试第 ${attempt}/3 次: ${error.message}`);
      }
    });
  }

  /**
   * 验证新闻条目
   * @param {NewsItem[]} newsItems
   * @returns {{ valid: NewsItem[], invalid: Array }}
   */
  validateNewsItems(newsItems) {
    const result = validateNewsItems(newsItems);

    if (result.invalid.length > 0) {
      this.logger.warn(`发现 ${result.invalid.length} 条无效新闻`);
      result.invalid.forEach(({ item, errors }) => {
        this.logger.debug(`无效新闻 - 标题: ${item.title || '无标题'}`);
        errors.forEach(err => this.logger.debug(`  错误: ${err}`));
      });
    }

    return result;
  }
}
