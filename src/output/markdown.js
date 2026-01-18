import { writeFileSync } from 'fs';
import {
  resolve,
  dirname,
  extname,
  basename,
  isAbsolute
} from 'path';
import { createLogger } from '../utils/logger.js';
import { ensureDirectorySync } from '../utils/fs.js';

const logger = createLogger('Markdown');

/**
 * Markdown 报告生成器
 * 负责将筛选后的新闻与统计信息输出为结构化文档
 */
export class MarkdownGenerator {
  constructor(options = {}) {
    // 默认输出路径支持传入文件或目录，使用日期目录格式
    this.defaultOutputPath = options.outputPath || this.buildDateBasedOutputPath();
  }

  /**
   * 构建基于日期的输出目录路径
   * @returns {string} 格式: output/article_YYYYMMDD/filtered-news.md
   */
  buildDateBasedOutputPath() {
    const dateDir = this.buildDateDirectory();
    return `output/${dateDir}/filtered-news.md`;
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
   * 生成 Markdown 文档
   * @param {Array} filteredNews - 通过过滤的新闻
   * @param {Object} stats - 统计信息
   * @param {Array} rejectedNews - 未通过过滤的新闻
   * @param {string} outputPath - 输出路径
   * @returns {Promise<string>}
   */
  async generate(filteredNews, stats, rejectedNews = [], outputPath = this.defaultOutputPath) {
    logger.info('开始生成 Markdown 文档...');

    try {
      const absolutePath = this.resolveOutputPath(outputPath);
      ensureDirectorySync(absolutePath);

      const content = this.buildMarkdownContent(filteredNews, stats, rejectedNews);
      writeFileSync(absolutePath, content, 'utf-8');

      logger.success(`Markdown 文档生成成功: ${absolutePath}`);
      return absolutePath;
    } catch (error) {
      logger.error('生成 Markdown 文档失败:', error.message);
      throw error;
    }
  }

  /**
   * 拼装完整的 Markdown 内容
   * @param {Array} filteredNews - 通过过滤的新闻
   * @param {Object} stats - 统计信息
   * @param {Array} rejectedNews - 未通过过滤的新闻
   * @returns {string}
   */
  buildMarkdownContent(filteredNews, stats, rejectedNews = []) {
    const sections = [
      this.buildHeader(),
      this.buildStatsSummary(stats),
      this.buildNewsSection(filteredNews),
      this.buildRejectedSection(rejectedNews),
      this.buildFooter()
    ];

    return sections.join('\n\n');
  }

  /**
   * 构建文档头部信息
   * @returns {string}
   */
  buildHeader() {
    const now = new Date();
    const dateStr = now.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    return `# AI 新闻采集报告

**生成时间**: ${dateStr}
**过滤方式**: LLM 智能评分`;
  }

  /**
   * 构建统计摘要表格
   * @param {Object} stats
   * @returns {string}
   */
  buildStatsSummary(stats) {
    const costEstimate = this.estimateCost(stats);
    const rows = [
      this.createTableRow('总采集数', `${stats.totalNews} 条`),
      this.createTableRow('有效评分', `${stats.validNews} 条`),
      this.createTableRow('过滤后数量', `${stats.filteredCount} 条`),
      this.createTableRow('过滤率', `${stats.filterRate.toFixed(1)}%`),
      this.createTableRow('平均评分', `${stats.averageScore.toFixed(2)} 分`),
      this.createTableRow('最高评分', `${stats.highestScore.toFixed(2)} 分`),
      this.createTableRow('执行耗时', `${stats.duration.toFixed(2)} 秒`),
      this.createTableRow('Token 使用', stats.totalTokens.toLocaleString()),
      this.createTableRow(
        '缓存命中',
        `${stats.cacheHitTokens.toLocaleString()} (${stats.cacheHitRate.toFixed(1)}%)`
      ),
      this.createTableRow('预估成本', `$${costEstimate.toFixed(4)}`)
    ];

    return `## 📊 统计摘要

| 指标 | 数值 |
|------|------|
${rows.join('\n')}`;
  }

  /**
   * 构建新闻主体部分
   * @param {Array} filteredNews
   * @returns {string}
   */
  buildNewsSection(filteredNews) {
    if (!filteredNews || filteredNews.length === 0) {
      return `## 📰 过滤后的新闻

*暂无符合过滤条件的新闻*`;
    }

    const grouped = this.groupBySource(filteredNews);
    const sourceSections = Object.entries(grouped).map(
      ([source, items]) => this.formatSourceSection(source, items)
    );

    return `## 📰 过滤后的新闻 (按评分排序，按数据源分组)

${sourceSections.join('\n\n')}`;
  }

  /**
   * 构建未通过过滤的文章展示区域
   * @param {Array} rejectedNews - 未通过过滤的新闻列表
   * @returns {string}
   */
  buildRejectedSection(rejectedNews) {
    if (!rejectedNews || rejectedNews.length === 0) {
      return '';
    }

    // 按评分降序排列
    const sortedRejected = [...rejectedNews].sort((a, b) => b.score - a.score);
    const grouped = this.groupBySource(sortedRejected);
    
    const sourceSections = Object.entries(grouped).map(
      ([source, items]) => this.formatRejectedSourceSection(source, items)
    );

    return `## 🚫 未通过过滤的文章 (共 ${rejectedNews.length} 条)

<details>
<summary>点击展开查看未通过的文章及原因</summary>

${sourceSections.join('\n\n')}

</details>`;
  }

  /**
   * 构建未通过文章的单个数据源展示
   * @param {string} source - 数据源名称
   * @param {Array} items - 该数据源的文章列表
   * @returns {string}
   */
  formatRejectedSourceSection(source, items) {
    const displayName = this.getSourceDisplayName(source);
    const header =
      '| 序号 | 标题 | 评分 | 未通过原因 |\n' +
      '|------|------|------|----------|';
    const rows = items.map((item, index) =>
      this.formatRejectedRow(item, index + 1)
    );

    return `### ${displayName} (${items.length} 条)\n\n${header}\n${rows.join('\n')}`;
  }

  /**
   * 构建未通过文章表格的单行
   * @param {Object} scoredItem - 评分后的文章对象
   * @param {number} index - 序号
   * @returns {string}
   */
  formatRejectedRow(scoredItem, index) {
    const { newsItem, score, reason, error } = scoredItem;
    const scoreEmoji = this.getScoreEmoji(score);
    
    // 未通过原因：优先显示错误信息，其次是评分理由
    const rejectReason = error || reason || '评分未达到阈值';
    
    const columns = [
      index,
      `[${this.escapeTableCell(newsItem.title)}](${newsItem.url})`,
      `${scoreEmoji} ${score.toFixed(1)}`,
      this.escapeTableCell(rejectReason)
    ];

    return `| ${columns.join(' | ')} |`;
  }

  /**
   * 构建单个数据源的展示段落
   * @param {string} source
   * @param {Array} items
   * @returns {string}
   */
  formatSourceSection(source, items) {
    const displayName = this.getSourceDisplayName(source);
    const header =
      '| 序号 | 标题 | 评分 | 发布时间 | 摘要 | 评分理由 | 互动数据 |\n' +
      '|------|------|------|----------|------|----------|----------|';
    const rows = items.map((item, index) =>
      this.formatNewsRow(item, index + 1)
    );

    return `### 📡 ${displayName} (${items.length} 条)\n\n${header}\n${rows.join('\n')}`;
  }

  /**
   * 构建表格中的单行
   * @param {Object} scoredItem
   * @param {number} index
   * @returns {string}
   */
  formatNewsRow(scoredItem, index) {
    const { newsItem, score, reason } = scoredItem;
    const scoreEmoji = this.getScoreEmoji(score);
    const publishTime = newsItem.createdAt.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    const metadata = this.formatMetadata(newsItem.metadata);
    const columns = [
      index,
      `[${this.escapeTableCell(newsItem.title)}](${newsItem.url})`,
      `${scoreEmoji} ${score.toFixed(1)}`,
      this.escapeTableCell(publishTime),
      this.escapeTableCell(newsItem.summary),
      this.escapeTableCell(reason),
      this.escapeTableCell(metadata)
    ];

    return `| ${columns.join(' | ')} |`;
  }

  /**
   * 格式化新闻的附加元数据
   * @param {Object} metadata
   * @returns {string}
   */
  formatMetadata(metadata = {}) {
    const parts = [];
    if (metadata.accountName) parts.push(`公众号: ${metadata.accountName}`);
    if (metadata.author) parts.push(`作者: ${metadata.author}`);
    if (metadata.likes !== undefined) parts.push(`👍 ${metadata.likes}`);
    if (metadata.comments !== undefined) parts.push(`💬 ${metadata.comments}`);
    if (metadata.retweets !== undefined) parts.push(`🔁 ${metadata.retweets}`);
    if (metadata.quotes !== undefined) parts.push(`📌 ${metadata.quotes}`);
    if (metadata.views !== undefined) parts.push(`👀 ${metadata.views}`);

    return parts.length > 0 ? parts.join('<br/>') : '';
  }

  /**
   * 转义 Markdown 表格中的单元格内容
   * @param {string|number} value
   * @returns {string}
   */
  escapeTableCell(value) {
    if (value === undefined || value === null || value === '') {
      return '--';
    }

    return String(value)
      .replace(/\r?\n/g, '<br/>')
      .replace(/\|/g, '\\|')
      .trim();
  }

  /**
   * 获取评分对应的表情符号
   * @param {number} score
   * @returns {string}
   */
  getScoreEmoji(score) {
    if (score >= 9) return '🔥';
    if (score >= 8) return '⭐';
    if (score >= 7) return '👍';
    if (score >= 6) return '👌';
    return '📋';
  }

  /**
   * 文档结尾说明
   * @returns {string}
   */
  buildFooter() {
    return `---

*本报告由 AI 新闻采集器自动生成*  
*使用 DeepSeek API 进行智能评分和过滤*`;
  }

  /**
   * 估算 LLM 调用成本
   * @param {Object} stats
   * @returns {number}
   */
  estimateCost(stats) {
    const inputTokens = stats.totalTokens - stats.cacheHitTokens;
    const outputTokens = stats.totalTokens * 0.1; // 输出占比粗略估算
    const cacheTokens = stats.cacheHitTokens;

    const inputCost = (inputTokens / 1_000_000) * 0.27;
    const outputCost = (outputTokens / 1_000_000) * 1.10;
    const cacheCost = (cacheTokens / 1_000_000) * 0.027;

    return inputCost + outputCost + cacheCost;
  }

  /**
   * 将新闻按来源分组
   * @param {Array} filteredNews
   * @returns {Object<string, Array>}
   */
  groupBySource(filteredNews) {
    return filteredNews.reduce((acc, item) => {
      const source = item.newsItem.source;
      if (!acc[source]) {
        acc[source] = [];
      }
      acc[source].push(item);
      return acc;
    }, {});
  }

  /**
   * 将内部数据源名称转换为展示名称
   * @param {string} source
   * @returns {string}
   */
  getSourceDisplayName(source) {
    const mapping = {
      'WeChat-MP': '微信公众号',
      'AIBase': 'AIBase',
      'Twitter': 'Twitter',
      '知识星球': '知识星球'
    };

    return mapping[source] || source;
  }

  /**
   * 构建 Markdown 表格的一行
   * @param {string} label
   * @param {string} value
   * @returns {string}
   */
  createTableRow(label, value) {
    return `| ${label} | ${value} |`;
  }

  /**
   * 解析输出路径并转为绝对路径
   * @param {string} outputPath
   * @returns {string}
   */
  resolveOutputPath(outputPath) {
    const target = outputPath || this.defaultOutputPath;
    const absoluteTarget = this.normalizeToAbsolute(target);
    const extension = extname(absoluteTarget);

    if (!extension) {
      // 当目标是目录时,使用默认文件名前缀生成时间戳文件
      return resolve(absoluteTarget, this.buildTimestampedFilename('filtered-news', '.md'));
    }

    const directory = dirname(absoluteTarget);
    const baseName = basename(absoluteTarget, extension);
    return resolve(directory, this.buildTimestampedFilename(baseName, extension));
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
   * @returns {string}
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
