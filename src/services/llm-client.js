import OpenAI from 'openai';
import { createLogger } from '../utils/logger.js';
import { buildSystemPrompt, buildUserPrompt, parseResponse } from './prompt-builder.js';
import { LLM_CONSTANTS } from '../config/constants.js';

const logger = createLogger('LLM');

/**
 * DeepSeek LLM 客户端
 * 负责统一封装提示词构造、请求发送与结果解析
 */
export class LLMClient {
  constructor(config = {}) {
    const {
      DEFAULT_MODEL,
      DEFAULT_TEMPERATURE,
      DEFAULT_MAX_TOKENS,
      BATCH_SIZE
    } = LLM_CONSTANTS;

    this.model = config.model || process.env.LLM_MODEL || DEFAULT_MODEL;
    this.maxTokens = config.maxTokens || parseInt(process.env.LLM_MAX_TOKENS || DEFAULT_MAX_TOKENS);
    this.temperature = config.temperature || parseFloat(process.env.LLM_TEMPERATURE || DEFAULT_TEMPERATURE);
    this.batchSize = config.batchSize || BATCH_SIZE;

    this.client = new OpenAI({
      baseURL: process.env.LLM_URL,
      apiKey: process.env.DEEPSEEK_API_KEY
    });

    logger.info(`LLM 客户端初始化完成, model=${this.model}`);
  }

  /**
   * 构建用于请求的消息体
   * @param {Object} newsItem
   * @param {Object} filterConfig
   * @returns {{messages: Array}}
   */
  buildChatMessages(newsItem, filterConfig) {
    const systemPrompt = buildSystemPrompt(filterConfig);
    const userPrompt = buildUserPrompt(newsItem);

    return {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };
  }

  /**
   * 构建请求参数
   * @param {Array} messages
  * @returns {Object}
   */
  buildCompletionPayload(messages) {
    return {
      model: this.model,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: { type: 'json_object' }
    };
  }

  /**
   * 对单条新闻进行评分
   * @param {NewsItem} newsItem
   * @param {Object} filterConfig
   * @returns {Promise<{score: number, reason: string, tokenUsage: Object}>}
   */
  async scoreNewsItem(newsItem, filterConfig) {
    try {
      const { messages } = this.buildChatMessages(newsItem, filterConfig);
      const payload = this.buildCompletionPayload(messages);
      const completion = await this.client.chat.completions.create(payload);

      const result = parseResponse(completion);
      this.logTokenUsage(result.tokenUsage, newsItem.title);
      return result;
    } catch (error) {
      logger.error(`评分失败 (新闻ID: ${newsItem.id}): ${error.message}`);
      throw error;
    }
  }

  /**
   * 批量评分新闻
   * @param {NewsItem[]} newsItems
   * @param {Object} filterConfig
   * @param {number} batchSize
   * @returns {Promise<Array<{newsId: string, score: number, reason: string, error?: string}>>}
   */
  async batchScore(newsItems, filterConfig, batchSize = this.batchSize) {
    if (!Array.isArray(newsItems) || newsItems.length === 0) {
      logger.warn('批量评分收到空列表');
      return [];
    }

    logger.info(`开始批量评分,共 ${newsItems.length} 条新闻`);
    const batches = this.sliceIntoBatches(newsItems, batchSize);
    const results = [];

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const batchNo = index + 1;
      logger.info(
        `处理批次 ${batchNo}/${batches.length} ` +
        `(第 ${this.getBatchRange(batchNo, batchSize, newsItems.length)} 条)`
      );

      const batchResults = await this.processBatch(batch, filterConfig);
      results.push(...batchResults);
    }

    const successCount = results.filter(item => !item.error).length;
    logger.success(`批量评分完成,成功 ${successCount}/${newsItems.length} 条`);

    return results;
  }

  /**
   * 处理单个批次,内部并发调用评分
   * @param {NewsItem[]} batch
   * @param {Object} filterConfig
   * @returns {Promise<Array>}
   */
  async processBatch(batch, filterConfig) {
    const settled = await Promise.allSettled(
      batch.map(item => this.scoreItemSafely(item, filterConfig))
    );

    const collected = [];
    settled.forEach(result => {
      if (result.status === 'fulfilled') {
        collected.push(result.value);
        return;
      }

      // 当 Promise 本身失败时记录详细原因
      logger.error('批次任务执行异常:', result.reason);
    });

    return collected;
  }

  /**
   * 安全地评分单条新闻,任何异常都转成可识别的结果
   * @param {NewsItem} newsItem
   * @param {Object} filterConfig
   * @returns {Promise<Object>}
   */
  async scoreItemSafely(newsItem, filterConfig) {
    try {
      const result = await this.scoreNewsItem(newsItem, filterConfig);
      return {
        newsId: newsItem.id,
        score: result.score,
        reason: result.reason,
        tokenUsage: result.tokenUsage
      };
    } catch (error) {
      logger.error(`评分失败 - 标题: ${newsItem.title}`);
      return {
        newsId: newsItem.id,
        score: 0,
        reason: '评分失败',
        error: error.message
      };
    }
  }

  /**
   * 将数组按照批次大小拆分
   * @param {Array} items
   * @param {number} batchSize
   * @returns {Array<Array>}
   */
  sliceIntoBatches(items, batchSize) {
    if (batchSize <= 0) {
      return [items];
    }

    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 获取批次在原始数组中的范围描述
   * @param {number} batchNo
   * @param {number} batchSize
   * @param {number} total
   * @returns {string}
   */
  getBatchRange(batchNo, batchSize, total) {
    const start = (batchNo - 1) * batchSize + 1;
    const end = Math.min(batchNo * batchSize, total);
    return `${start}-${end}`;
  }

  /**
   * 记录 token 使用情况,方便后续排查成本问题
   * @param {Object} tokenUsage
   * @param {string} title
   */
  logTokenUsage(tokenUsage, title) {
    if (!tokenUsage) return;
    logger.debug(
      `Token 使用 | 标题="${title}" | 输入=${tokenUsage.inputTokens} | ` +
      `输出=${tokenUsage.outputTokens} | 缓存命中=${tokenUsage.cacheHitTokens}`
    );
  }
}
