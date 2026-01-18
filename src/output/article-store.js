import { writeFileSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { createLogger } from '../utils/logger.js';
import { ensureDirectorySync } from '../utils/fs.js';

const logger = createLogger('ArticleStore');

/**
 * 公众号文章存储器
 * 负责将采集到的原始文章数据持久化存储
 */
export class ArticleStore {
  constructor(options = {}) {
    this.baseOutputDir = options.baseOutputDir || 'output';
  }

  /**
   * 构建日期目录名称
   * @returns {string} 格式: article_YYYYMMDD
   */
  buildDateDirectory() {
    const now = new Date();
    const pad = number => String(number).padStart(2, '0');
    const datePart = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate())
    ].join('');
    return `article_${datePart}`;
  }

  /**
   * 获取当日输出目录的绝对路径
   * @returns {string}
   */
  getOutputDirectory() {
    const dateDir = this.buildDateDirectory();
    const outputDir = `${this.baseOutputDir}/${dateDir}`;
    return this.normalizeToAbsolute(outputDir);
  }

  /**
   * 保存采集到的文章数据
   * @param {Object} newsItemsBySource - 按数据源分组的新闻对象
   * @returns {Promise<string>} 保存的文件路径
   */
  async saveArticles(newsItemsBySource) {
    logger.info('开始保存原始文章数据...');

    try {
      const outputDir = this.getOutputDirectory();
      const filePath = resolve(outputDir, this.buildTimestampedFilename('articles', '.json'));
      
      // ensureDirectorySync 接收文件路径，会自动创建其所在目录
      ensureDirectorySync(filePath);
      
      // 转换 NewsItem 对象为可序列化的格式
      const serializableData = this.serializeNewsItems(newsItemsBySource);
      
      const content = JSON.stringify(serializableData, null, 2);
      writeFileSync(filePath, content, 'utf-8');

      const totalCount = this.countTotalArticles(newsItemsBySource);
      logger.success(`原始文章保存成功: ${filePath} (共 ${totalCount} 条)`);
      
      return filePath;
    } catch (error) {
      logger.error('保存原始文章失败:', error.message);
      throw error;
    }
  }

  /**
   * 将 NewsItem 对象转换为可序列化的格式
   * @param {Object} newsItemsBySource
   * @returns {Object}
   */
  serializeNewsItems(newsItemsBySource) {
    const result = {
      savedAt: new Date().toISOString(),
      sources: {}
    };

    for (const [sourceName, newsItems] of Object.entries(newsItemsBySource)) {
      result.sources[sourceName] = newsItems.map(item => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        content: item.content || '',
        url: item.url,
        source: item.source,
        createdAt: item.createdAt?.toISOString() || null,
        fetchedAt: item.fetchedAt?.toISOString() || null,
        metadata: item.metadata || {}
      }));
    }

    return result;
  }

  /**
   * 统计文章总数
   * @param {Object} newsItemsBySource
   * @returns {number}
   */
  countTotalArticles(newsItemsBySource) {
    return Object.values(newsItemsBySource).reduce(
      (sum, items) => sum + items.length,
      0
    );
  }

  /**
   * 构建带时间戳的文件名
   * @param {string} baseName
   * @param {string} extension
   * @returns {string}
   */
  buildTimestampedFilename(baseName, extension) {
    return `${baseName}-${this.buildTimestamp()}${extension}`;
  }

  /**
   * 生成文件名使用的时间戳
   * @returns {string} 格式: YYYYMMDD-HHmmss
   */
  buildTimestamp() {
    const now = new Date();
    const pad = number => String(number).padStart(2, '0');

    const datePart = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate())
    ].join('');

    const timePart = [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds())
    ].join('');

    return `${datePart}-${timePart}`;
  }

  /**
   * 将路径转换为绝对路径
   * @param {string} target
   * @returns {string}
   */
  normalizeToAbsolute(target) {
    return isAbsolute(target)
      ? target
      : resolve(process.cwd(), target);
  }
}
