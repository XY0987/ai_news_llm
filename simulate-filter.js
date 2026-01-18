#!/usr/bin/env node

/**
 * 模拟 LLM 评分脚本
 * 基于正反面示例进行关键词匹配和相似度计算
 * 不依赖真实 API 调用
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import stringSimilarity from 'string-similarity';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载过滤配置
const filterConfigPath = resolve(__dirname, 'config/filter-rules-wechat-mp.json');
const filterConfig = JSON.parse(readFileSync(filterConfigPath, 'utf8'));

// 加载新闻数据源
const dataSourcePath = resolve(__dirname, 'output/article_20260117/articles-20260117-111013.json');
console.log('正在读取数据源...');
const dataSource = JSON.parse(readFileSync(dataSourcePath, 'utf8'));

// 提取正反面示例
const positiveExamples = filterConfig.positiveExamples || [];
const negativeExamples = filterConfig.negativeExamples || [];
const minScore = filterConfig.thresholdConfig?.minScore || 7;

// 正面关键词和主题
const positiveKeywords = [
  // AI 编程工具
  'Cursor', 'Claude Code', 'Copilot', 'Windsurf', 'Codex', 'OpenCode',
  // 大模型
  'GPT-5', 'Claude 4', 'Gemini 3', 'MiniMax', 'DeepSeek', 'GLM', '混元',
  // 开发者工具
  'React', 'Vue', 'Node.js', 'TypeScript', 'Next.js', 'Vite',
  // 职业相关
  '程序员', '开发', '工程师', '招聘', '裁员', '薪资', '职业',
  // 行业动态
  '融资', '收购', '政策', '突破', '开源', '发布', '更新',
  // 实用价值
  '免费', '额度', '工具', '推荐', '效率', '提升', '技巧'
];

// 负面关键词和主题
const negativeKeywords = [
  // 非 AI 热点
  '新材料', '生物', '材料', '制药', '医疗', '金融', '量化',
  // 营销内容
  '推广', '营销', '广告', '软文', '课程', '培训', '教程',
  // 小众领域
  '生物AI', '材料AI', '化学AI', '物理AI',
  // 非新闻类
  '技巧', '方法', '经验', '分享', '总结'
];

/**
 * 计算文本与示例的相似度
 */
function calculateSimilarity(text, examples) {
  if (!text || examples.length === 0) return 0;
  
  const textLower = text.toLowerCase();
  let totalSimilarity = 0;
  let count = 0;
  
  for (const example of examples) {
    const exampleText = `${example.title} ${example.summary}`.toLowerCase();
    const similarity = stringSimilarity.compareTwoStrings(textLower, exampleText);
    totalSimilarity += similarity;
    count++;
  }
  
  return count > 0 ? totalSimilarity / count : 0;
}

/**
 * 关键词匹配得分
 */
function calculateKeywordScore(text) {
  if (!text) return 0;
  
  const textLower = text.toLowerCase();
  let positiveScore = 0;
  let negativeScore = 0;
  
  // 计算正面关键词匹配
  for (const keyword of positiveKeywords) {
    if (textLower.includes(keyword.toLowerCase())) {
      positiveScore += 1;
    }
  }
  
  // 计算负面关键词匹配
  for (const keyword of negativeKeywords) {
    if (textLower.includes(keyword.toLowerCase())) {
      negativeScore += 1;
    }
  }
  
  // 综合得分：正面权重 - 负面权重
  const baseScore = Math.min(positiveScore * 2, 8); // 关键词最多贡献8分
  const penalty = Math.min(negativeScore * 1.5, 5); // 负面最多扣5分
  return Math.max(0, baseScore - penalty);
}

/**
 * 模拟 LLM 评分
 */
function simulateLLMScoring(newsItem) {
  const combinedText = `${newsItem.title} ${newsItem.summary}`;
  
  // 1. 计算与正面示例的相似度 (0-5分)
  const positiveSimilarity = calculateSimilarity(combinedText, positiveExamples);
  const similarityScore = positiveSimilarity * 5;
  
  // 2. 计算关键词得分 (0-8分)
  const keywordScore = calculateKeywordScore(combinedText);
  
  // 3. 计算与负面示例的相似度 (扣分)
  const negativeSimilarity = calculateSimilarity(combinedText, negativeExamples);
  const negativePenalty = negativeSimilarity * 3;
  
  // 4. 基础分调整
  const baseScore = similarityScore + keywordScore - negativePenalty;
  
  // 5. 引入随机波动 (±1分) 模拟真实评分
  const randomFactor = (Math.random() * 2) - 1; // -1 到 1
  const finalScore = Math.max(0, Math.min(10, baseScore + randomFactor));
  
  // 6. 生成评分理由
  const reason = generateScoringReason(newsItem, finalScore, similarityScore, keywordScore, negativePenalty);
  
  return {
    score: Math.round(finalScore * 10) / 10, // 保留一位小数
    reason
  };
}

/**
 * 生成评分理由
 */
function generateScoringReason(newsItem, finalScore, similarityScore, keywordScore, negativePenalty) {
  const { title, summary } = newsItem;
  const summaryPreview = summary.length > 100 ? summary.substring(0, 100) + '...' : summary;
  
  if (finalScore >= 8) {
    return `属于高质量AI编程新闻，内容聚焦${title.includes('GPT') ? 'GPT模型' : title.includes('Claude') ? 'Claude模型' : '前沿AI工具'}，技术深度和行业影响力显著，完全符合程序员关注的AI技术发展趋势。`;
  } else if (finalScore >= 7) {
    return `属于AI领域相关新闻，涉及${title.includes('AI') ? 'AI技术' : '开发者工具'}，具有一定行业关注度，但非一线热点或核心编程工具更新，信息价值中等。`;
  } else if (finalScore >= 6) {
    return `与AI技术有一定关联，但内容偏向${summary.includes('趋势') ? '行业趋势' : summary.includes('分析') ? '分析评论' : '应用场景'}，缺乏具体技术细节或工具更新，程序员直接相关度一般。`;
  } else if (finalScore >= 4) {
    return `内容与AI领域相关度较低，偏向${summary.includes('营销') ? '营销推广' : summary.includes('课程') ? '教育培训' : '其他领域'}，缺乏实质性技术新闻价值，不符合程序员核心关注点。`;
  } else {
    return `与AI编程、开发者工具或程序员职业发展关联度弱，属于${summary.includes('广告') ? '广告内容' : '非新闻类信息'}，不符合选题目标。`;
  }
}

/**
 * 主处理函数
 */
async function main() {
  console.log('开始模拟评分...');
  
  const newsItems = dataSource.sources['WeChat-MP'] || [];
  console.log(`共发现 ${newsItems.length} 条新闻`);
  
  const scoredNews = [];
  const startTime = Date.now();
  
  for (let i = 0; i < newsItems.length; i++) {
    const newsItem = newsItems[i];
    const result = simulateLLMScoring(newsItem);
    
    scoredNews.push({
      newsItem,
      score: result.score,
      reason: result.reason
    });
    
    // 进度显示
    if (i % 100 === 0) {
      console.log(`已处理 ${i}/${newsItems.length} 条新闻`);
    }
  }
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  // 统计信息
  const validNews = scoredNews.filter(item => item.score > 0);
  const filteredNews = scoredNews.filter(item => item.score >= minScore);
  const rejectedNews = scoredNews.filter(item => item.score < minScore);
  
  const totalScore = filteredNews.reduce((sum, item) => sum + item.score, 0);
  const averageScore = filteredNews.length > 0 ? totalScore / filteredNews.length : 0;
  const highestScore = filteredNews.length > 0 ? Math.max(...filteredNews.map(item => item.score)) : 0;
  const filterRate = newsItems.length > 0 ? (filteredNews.length / newsItems.length) * 100 : 0;
  
  const stats = {
    totalNews: newsItems.length,
    validNews: validNews.length,
    filteredCount: filteredNews.length,
    filterRate,
    averageScore,
    highestScore,
    duration,
    totalTokens: newsItems.length * 500, // 模拟token使用
    cacheHitTokens: 0,
    cacheHitRate: 0
  };
  
  console.log('\n统计摘要:');
  console.log(`总采集数: ${stats.totalNews} 条`);
  console.log(`有效评分: ${stats.validNews} 条`);
  console.log(`过滤后数量: ${stats.filteredCount} 条`);
  console.log(`过滤率: ${stats.filterRate.toFixed(1)}%`);
  console.log(`平均评分: ${stats.averageScore.toFixed(2)} 分`);
  console.log(`最高评分: ${stats.highestScore.toFixed(2)} 分`);
  console.log(`执行耗时: ${stats.duration.toFixed(2)} 秒`);
  
  // 生成Markdown报告
  const markdownContent = generateMarkdownReport(filteredNews, stats, rejectedNews);
  
  // 输出文件
  const outputPath = resolve(__dirname, 'filtered-news-simulated.md');
  writeFileSync(outputPath, markdownContent, 'utf8');
  
  console.log(`\n报告已生成: ${outputPath}`);
  console.log(`通过过滤: ${filteredNews.length} 条，未通过: ${rejectedNews.length} 条`);
}

/**
 * 生成Markdown报告
 */
function generateMarkdownReport(filteredNews, stats, rejectedNews) {
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
  
  // 按评分排序
  const sortedFilteredNews = [...filteredNews].sort((a, b) => b.score - a.score);
  const sortedRejectedNews = [...rejectedNews].sort((a, b) => b.score - a.score);
  
  // 统计表格
  const statsRows = [
    `| 指标 | 数值 |`,
    `|------|------|`,
    `| 总采集数 | ${stats.totalNews} 条 |`,
    `| 有效评分 | ${stats.validNews} 条 |`,
    `| 过滤后数量 | ${stats.filteredCount} 条 |`,
    `| 过滤率 | ${stats.filterRate.toFixed(1)}% |`,
    `| 平均评分 | ${stats.averageScore.toFixed(2)} 分 |`,
    `| 最高评分 | ${stats.highestScore.toFixed(2)} 分 |`,
    `| 执行耗时 | ${stats.duration.toFixed(2)} 秒 |`,
    `| Token 使用 | ${stats.totalTokens.toLocaleString()} |`,
    `| 缓存命中 | ${stats.cacheHitTokens.toLocaleString()} (${stats.cacheHitRate.toFixed(1)}%) |`,
    `| 预估成本 | $${(stats.totalTokens / 1_000_000 * 0.27).toFixed(4)} |`
  ].join('\n');
  
  // 过滤后的新闻表格
  let filteredTable = '';
  if (sortedFilteredNews.length > 0) {
    const source = '微信公众号';
    const header = '| 序号 | 标题 | 评分 | 发布时间 | 摘要 | 评分理由 | 互动数据 |\n' +
                   '|------|------|------|----------|------|----------|----------|';
    
    const rows = sortedFilteredNews.map((item, index) => {
      const { newsItem, score, reason } = item;
      const scoreEmoji = getScoreEmoji(score);
      const publishTime = new Date(newsItem.createdAt).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // 格式化摘要
      const summary = newsItem.summary.length > 150 ? 
        newsItem.summary.substring(0, 150) + '...' : newsItem.summary;
      
      // 互动数据
      const metadata = formatMetadata(newsItem.metadata);
      
      return `| ${index + 1} | [${escapeTableCell(newsItem.title)}](${newsItem.url}) | ${scoreEmoji} ${score.toFixed(1)} | ${escapeTableCell(publishTime)} | ${escapeTableCell(summary)} | ${escapeTableCell(reason)} | ${escapeTableCell(metadata)} |`;
    });
    
    filteredTable = `### 📡 ${source} (${sortedFilteredNews.length} 条)\n\n${header}\n${rows.join('\n')}`;
  }
  
  // 未通过的文章表格
  let rejectedTable = '';
  if (sortedRejectedNews.length > 0) {
    const source = '微信公众号';
    const header = '| 序号 | 标题 | 评分 | 未通过原因 |\n' +
                   '|------|------|------|----------|';
    
    const rows = sortedRejectedNews.map((item, index) => {
      const { newsItem, score, reason } = item;
      const scoreEmoji = getScoreEmoji(score);
      const rejectReason = reason || '评分未达到阈值';
      
      return `| ${index + 1} | [${escapeTableCell(newsItem.title)}](${newsItem.url}) | ${scoreEmoji} ${score.toFixed(1)} | ${escapeTableCell(rejectReason)} |`;
    }).slice(0, 100); // 只显示前100条
    
    rejectedTable = `### ${source} (${sortedRejectedNews.length} 条)\n\n${header}\n${rows.join('\n')}`;
  }
  
  // 组装完整文档
  return `# AI 新闻采集报告

**生成时间**: ${dateStr}
**过滤方式**: 模拟 LLM 评分

## 📊 统计摘要

${statsRows}

## 📰 过滤后的新闻 (按评分排序，按数据源分组)

${filteredTable || '*暂无符合过滤条件的新闻*'}

## 🚫 未通过过滤的文章 (共 ${rejectedNews.length} 条)

<details>
<summary>点击展开查看未通过的文章及原因</summary>

${rejectedTable || '*无未通过的文章*'}

</details>

---

*本报告由 AI 新闻采集器自动生成*  
*使用模拟 LLM 评分进行智能过滤*`;
}

/**
 * 工具函数
 */
function getScoreEmoji(score) {
  if (score >= 9) return '🔥';
  if (score >= 8) return '⭐';
  if (score >= 7) return '👍';
  if (score >= 6) return '👌';
  return '📋';
}

function formatMetadata(metadata = {}) {
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

function escapeTableCell(value) {
  if (value === undefined || value === null || value === '') {
    return '--';
  }
  return String(value)
    .replace(/\r?\n/g, '<br/>')
    .replace(/\|/g, '\\|')
    .trim();
}

// 执行主函数
main().catch(console.error);