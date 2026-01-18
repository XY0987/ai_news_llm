#!/usr/bin/env node

import 'dotenv/config';
import { loadFilterConfigForSource } from './config/loader.js';
import { getEnabledDataSources } from './config/datasources.js';
import { AIBaseCollector } from './collectors/aibase.js';
import { ZSXQCollector } from './collectors/zsxq.js';
import { WeChatMPCollector } from './collectors/wechat-mp.js';
import { TwitterCollector } from './collectors/twitter.js';
import { YouTubeCollector } from './collectors/youtube.js';
import { Orchestrator } from './services/orchestrator.js';
import { MarkdownGenerator } from './output/markdown.js';
import { ArticleStore } from './output/article-store.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('Main');

/**
 * 创建采集器实例
 * @param {Object} sourceConfig - 数据源配置
 * @returns {BaseCollector|null} 采集器实例
 */
function createCollector(sourceConfig) {
  const collectorMap = {
    'AIBase': AIBaseCollector,
    '知识星球': ZSXQCollector,
    'WeChat-MP': WeChatMPCollector,
    'Twitter': TwitterCollector,
    'YouTube': YouTubeCollector
  };

  const CollectorClass = collectorMap[sourceConfig.name];

  if (!CollectorClass) {
    logger.warn(`未知的数据源类型: ${sourceConfig.name}`);
    return null;
  }

  return new CollectorClass(sourceConfig);
}

/**
 * 从单个数据源采集新闻
 * @param {Object} sourceConfig - 数据源配置
 * @returns {Promise<Array>} 新闻数组
 */
async function collectFromSource(sourceConfig) {
  logger.info('');
  logger.info(`正在采集: ${sourceConfig.name}`);

  try {
    const collector = createCollector(sourceConfig);
    if (!collector) {
      return [];
    }

    return await collector.collect();
  } catch (error) {
    logger.error(`采集 ${sourceConfig.name} 时出错:`, error.message);
    return [];
  }
}

/**
 * 从所有启用的数据源采集新闻
 * @returns {Promise<Object>} 按数据源分组的新闻对象
 */
async function collectNewsFromAllSources() {
  const enabledSources = getEnabledDataSources();
  logger.info(`启用的数据源: ${enabledSources.map(s => s.name).join(', ')}`);

  const newsItemsBySource = {};

  for (const sourceConfig of enabledSources) {
    const newsItems = await collectFromSource(sourceConfig);
    newsItemsBySource[sourceConfig.name] = newsItems;
  }

  return newsItemsBySource;
}

/**
 * 初始化统计对象
 * @returns {Object} 统计对象
 */
function initializeStats() {
  return {
    totalNews: 0,
    validNews: 0,
    filteredCount: 0,
    averageScore: 0,
    highestScore: 0,
    duration: 0,
    totalTokens: 0,
    cacheHitTokens: 0,
    cacheHitRate: 0
  };
}

/**
 * 合并单个数据源的统计结果
 * @param {Object} combinedStats - 合并的统计对象
 * @param {Object} sourceStats - 单个数据源的统计对象
 */
function mergeStats(combinedStats, sourceStats) {
  combinedStats.totalNews += sourceStats.totalNews;
  combinedStats.validNews += sourceStats.validNews || sourceStats.totalNews;
  combinedStats.filteredCount += sourceStats.filteredCount;
  combinedStats.duration += sourceStats.duration;
  combinedStats.totalTokens += sourceStats.totalTokens;
  combinedStats.cacheHitTokens += sourceStats.cacheHitTokens || 0;

  // 更新最高分
  if (sourceStats.highestScore > combinedStats.highestScore) {
    combinedStats.highestScore = sourceStats.highestScore;
  }
}

/**
 * 计算总体统计指标
 * @param {Object} combinedStats - 合并的统计对象
 * @param {Array} allFilteredNews - 所有过滤后的新闻
 */
function calculateFinalStats(combinedStats, allFilteredNews) {
  // 计算总体平均分
  combinedStats.averageScore = allFilteredNews.length > 0
    ? allFilteredNews.reduce((sum, item) => sum + item.score, 0) / allFilteredNews.length
    : 0;

  // 计算过滤率
  combinedStats.filterRate = combinedStats.totalNews > 0
    ? (combinedStats.filteredCount / combinedStats.totalNews) * 100
    : 0;

  // 计算缓存命中率
  combinedStats.cacheHitRate = combinedStats.totalTokens > 0
    ? (combinedStats.cacheHitTokens / combinedStats.totalTokens) * 100
    : 0;
}

/**
 * 对新闻进行评分和过滤
 * @param {Object} newsItemsBySource - 按数据源分组的新闻
 * @returns {Promise<Object>} 包含过滤结果、未通过结果和统计信息的对象
 */
async function scoreAndFilterNews(newsItemsBySource) {
  const orchestrator = new Orchestrator();
  const allFilteredNews = [];
  const allRejectedNews = [];  // 收集未通过的文章
  const combinedStats = initializeStats();

  // 对每个数据源使用其专属的过滤规则
  for (const [sourceName, newsItems] of Object.entries(newsItemsBySource)) {
    if (newsItems.length === 0) continue;

    logger.info('');
    logger.info(`正在评分: ${sourceName} (${newsItems.length} 条)`);

    // 为该数据源加载专属配置
    const sourceRules = loadFilterConfigForSource(sourceName);

    // 执行评分和过滤
    const result = await orchestrator.execute(newsItems, sourceRules);

    // 合并通过的结果
    allFilteredNews.push(...result.filtered);
    
    // 收集未通过的文章（已评分但未通过过滤的）
    const rejectedItems = result.scored.filter(item => !item.isPassed);
    allRejectedNews.push(...rejectedItems);
    
    mergeStats(combinedStats, result.stats);

    logger.info(`  ${sourceName} 过滤后: ${result.stats.filteredCount}/${result.stats.totalNews} 条`);
  }

  // 计算总体统计指标
  calculateFinalStats(combinedStats, allFilteredNews);

  return {
    filtered: allFilteredNews,
    rejected: allRejectedNews,  // 返回未通过的文章
    stats: combinedStats
  };
}

/**
 * 主函数
 */
async function main() {
  try {
    logger.info('========================================');
    logger.info('AI 新闻采集器 v1.0');
    logger.info('========================================');

    // 1. 验证环境变量
    if (!process.env.DEEPSEEK_API_KEY) {
      logger.error('缺少环境变量: DEEPSEEK_API_KEY');
      logger.info('请在 .env 文件中设置 DEEPSEEK_API_KEY');
      logger.info('获取 API Key: https://platform.deepseek.com/api_keys');
      process.exit(1);
    }

    // 2. 采集新闻 - 支持多数据源
    logger.info('');
    logger.info('步骤 1/4: 采集新闻');

    const newsItemsBySource = await collectNewsFromAllSources();

    // 计算总采集数
    const totalNews = Object.values(newsItemsBySource).reduce((sum, items) => sum + items.length, 0);

    if (totalNews === 0) {
      logger.warn('未采集到任何新闻,程序退出');
      process.exit(0);
    }

    logger.info('');
    logger.success(`总共采集 ${totalNews} 条新闻`);

    // 2.5. 保存原始文章数据
    logger.info('');
    logger.info('步骤 2/4: 保存原始文章');
    const articleStore = new ArticleStore();
    const articlesPath = await articleStore.saveArticles(newsItemsBySource);

    // 3. LLM 评分和过滤 - 按数据源分别评分
    logger.info('');
    logger.info('步骤 3/4: LLM 评分和过滤');

    const result = await scoreAndFilterNews(newsItemsBySource);

    // 4. 生成 Markdown 输出
    logger.info('');
    logger.info('步骤 4/4: 生成 Markdown 报告');
    const markdownGenerator = new MarkdownGenerator();
    const outputPath = await markdownGenerator.generate(
      result.filtered,
      result.stats,
      result.rejected  // 传入未通过的文章
    );

    // 6. 输出执行摘要
    logger.info('');
    logger.success('========================================');
    logger.success('执行完成!');
    logger.success('========================================');
    logger.info(`📁 文章存储: ${articlesPath}`);
    logger.info(`📄 报告路径: ${outputPath}`);
    logger.info(`📊 总采集数: ${result.stats.totalNews} 条`);
    logger.info(`✨ 过滤后: ${result.stats.filteredCount} 条 (${result.stats.filterRate.toFixed(1)}%)`);
    logger.info(`⏱️  总耗时: ${result.stats.duration.toFixed(2)} 秒`);
    logger.info(`💰 预估成本: $${(result.stats.totalTokens / 1000000 * 0.5).toFixed(4)}`);
    logger.info('');

  } catch (error) {
    logger.error('');
    logger.error('========================================');
    logger.error('执行失败');
    logger.error('========================================');
    logger.error('错误详情:', error.message);
    
    if (error.stack) {
      logger.debug('堆栈信息:');
      logger.debug(error.stack);
    }

    process.exit(1);
  }
}

// 运行主函数
main();
