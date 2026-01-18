import { LLMClient } from './llm-client.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Orchestrator');

/**
 * 主流程编排器
 * 负责协调采集、评分、过滤等流程
 */
export class Orchestrator {
  constructor(config = {}) {
    this.llmClient = new LLMClient(config.llm);
    this.batchSize = config.batchSize || 10;
  }

  /**
   * 判断是否存在待处理的新闻数据
   * @param {NewsItem[]} newsItems
   * @returns {boolean}
   */
  hasNews(newsItems) {
    return Array.isArray(newsItems) && newsItems.length > 0;
  }

  /**
   * 执行完整的评分与过滤流程
   * @param {NewsItem[]} newsItems
   * @param {Object} filterConfig
   * @returns {Promise<{scored: Array, filtered: Array, stats: Object}>}
   */
  async execute(newsItems, filterConfig) {
    if (!this.hasNews(newsItems)) {
      logger.warn('接收到空的新闻列表,跳过评分流程');
      return {
        scored: [],
        filtered: [],
        stats: this.createEmptyStats()
      };
    }

    logger.info(`开始执行过滤流程,共 ${newsItems.length} 条新闻`);
    const startTime = Date.now();

    try {
      // 第一步: 批量请求 LLM 完成评分
      const scoredNews = await this.scoreNewsItems(newsItems, filterConfig);

      // 第二步: 根据阈值配置执行动态过滤
      const filteredNews = this.applyDynamicThreshold(
        scoredNews,
        filterConfig.thresholdConfig || {}
      );

      // 第三步: 汇总统计信息,用于后续展示
      const stats = this.calculateStats(scoredNews, filteredNews, startTime);

      logger.success('过滤流程执行完成');
      logger.info(`  总数: ${stats.totalNews}`);
      logger.info(`  平均分: ${stats.averageScore.toFixed(2)}`);
      logger.info(`  过滤后: ${stats.filteredCount}`);
      logger.info(`  过滤率: ${stats.filterRate.toFixed(1)}%`);
      logger.info(`  耗时: ${stats.duration.toFixed(2)}s`);

      return {
        scored: scoredNews,
        filtered: filteredNews,
        stats
      };
    } catch (error) {
      logger.error('过滤流程执行失败:', error.message);
      throw error;
    }
  }

  /**
   * 调用 LLM 完成评分并合并结果
   * @param {NewsItem[]} newsItems
   * @param {Object} filterConfig
   * @returns {Promise<Array>}
   */
  async scoreNewsItems(newsItems, filterConfig) {
    const scoredResults = await this.llmClient.batchScore(
      newsItems,
      filterConfig,
      this.batchSize
    );

    return this.mergeScores(newsItems, scoredResults);
  }

  /**
   * 将评分信息挂载回原始新闻条目
   * @param {NewsItem[]} newsItems
   * @param {Array} scoredResults
   * @returns {Array}
   */
  mergeScores(newsItems, scoredResults) {
    const scoreMap = new Map(
      scoredResults.map(result => [result.newsId, result])
    );

    return newsItems.map(item => {
      const scoreData = scoreMap.get(item.id);
      if (!scoreData) {
        logger.warn(`新闻未找到评分结果: ${item.title}`);
        return {
          newsItem: item,
          score: 0,
          reason: '未评分',
          error: '未评分',
          isPassed: false
        };
      }

      return {
        newsItem: item,
        score: scoreData.score,
        reason: scoreData.reason,
        error: scoreData.error,
        tokenUsage: scoreData.tokenUsage,
        isPassed: false
      };
    });
  }

  /**
   * 根据固定分数阈值过滤新闻
   * @param {Array} scoredNews - 已评分的新闻列表
   * @param {Object} thresholdConfig - 阈值配置
   * @returns {Array} 通过过滤的新闻列表
   */
  applyDynamicThreshold(scoredNews, thresholdConfig) {
    const validNews = scoredNews.filter(item => !item.error && item.score > 0);
    if (validNews.length === 0) {
      logger.warn('没有有效的评分结果');
      return [];
    }

    // 使用固定分数阈值，默认 7 分
    const minScore = thresholdConfig.minScore ?? 7;
    
    // 筛选达到分数阈值的新闻
    const filtered = validNews
      .filter(item => item.score >= minScore)
      .sort((a, b) => b.score - a.score);

    logger.info(
      `固定阈值过滤: 最低分=${minScore}, ` +
      `通过=${filtered.length}/${validNews.length} ` +
      `(${(filtered.length / validNews.length * 100).toFixed(1)}%)`
    );

    this.markPassed(scoredNews, filtered);
    return filtered;
  }

  /**
   * 标记通过过滤的新闻
   * @param {Array} scoredNews
   * @param {Array} filtered
   * @returns {Array}
   */
  markPassed(scoredNews, filtered) {
    const passedIds = new Set(filtered.map(item => item.newsItem.id));

    scoredNews.forEach(item => {
      item.isPassed = passedIds.has(item.newsItem.id);
    });
  }

  /**
   * 构建空统计对象
   * @returns {Object}
   */
  createEmptyStats() {
    return {
      totalNews: 0,
      validNews: 0,
      filteredCount: 0,
      filterRate: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      duration: 0,
      totalTokens: 0,
      cacheHitTokens: 0,
      cacheHitRate: 0
    };
  }

  /**
   * 生成统计数据
   * @param {Array} scoredNews
   * @param {Array} filteredNews
   * @param {number} startTime
   * @returns {Object}
   */
  calculateStats(scoredNews, filteredNews, startTime) {
    const validScores = this.collectValidScores(scoredNews);
    const { totalTokens, cacheHitTokens } = this.calculateTokenStats(scoredNews);

    const averageScore = validScores.length > 0
      ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length
      : 0;

    return {
      totalNews: scoredNews.length,
      validNews: validScores.length,
      filteredCount: filteredNews.length,
      filterRate: scoredNews.length > 0
        ? (filteredNews.length / scoredNews.length) * 100
        : 0,
      averageScore,
      highestScore: validScores.length > 0 ? Math.max(...validScores) : 0,
      lowestScore: validScores.length > 0 ? Math.min(...validScores) : 0,
      duration: (Date.now() - startTime) / 1000,
      totalTokens,
      cacheHitTokens,
      cacheHitRate: totalTokens > 0
        ? (cacheHitTokens / totalTokens) * 100
        : 0
    };
  }

  /**
   * 收集所有有效分数
   * @param {Array} scoredNews
   * @returns {number[]}
   */
  collectValidScores(scoredNews) {
    return scoredNews
      .filter(item => !item.error && item.score > 0)
      .map(item => item.score);
  }

  /**
   * 统计 Token 使用情况
   * @param {Array} scoredNews
   * @returns {{totalTokens: number, cacheHitTokens: number}}
   */
  calculateTokenStats(scoredNews) {
    return scoredNews.reduce((acc, item) => {
      const tokenUsage = item.tokenUsage || {};
      acc.totalTokens += tokenUsage.totalTokens || 0;
      acc.cacheHitTokens += tokenUsage.cacheHitTokens || 0;
      return acc;
    }, {
      totalTokens: 0,
      cacheHitTokens: 0
    });
  }
}
