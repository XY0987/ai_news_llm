#!/usr/bin/env node

/**
 * 分析报告生成脚本
 * 根据分析结果生成 Markdown 格式的阅读推荐报告
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 格式化日志
function log(level, message) {
  const timestamp = new Date().toLocaleString('zh-CN');
  const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
  console.log(`[${timestamp}] ${icons[level] || '•'} ${message}`);
}

// 加载配置
function loadConfig() {
  const configPath = path.join(__dirname, '../config/config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

// 加载分析结果
function loadAnalysisResults(config) {
  // 首先尝试加载日期目录下的文件
  const baseOutputDir = path.resolve('./skills/wechat-mp-analyzer/output');
  const dateStr = getDateString();
  const datedPath = path.join(baseOutputDir, dateStr, 'analysis-results.json');
  
  // 最后尝试配置的默认路径
  const defaultPath = path.resolve(config.output?.analysisPath || './skills/wechat-mp-analyzer/output/analysis-results.json');
  
  let analysisPath;
  if (fs.existsSync(datedPath)) {
    analysisPath = datedPath;
  } else if (fs.existsSync(defaultPath)) {
    analysisPath = defaultPath;
  } else {
    throw new Error(`分析结果不存在。请先使用子Agent分析文章并保存结果到:\n  - ${datedPath}\n  - 或 ${defaultPath}`);
  }
  
  return JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
}

// 格式化日期
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// 获取YYYYMMDD格式的日期字符串
function getDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// 获取输出目录（按日期归档）
function getOutputDir(baseDir) {
  const dateStr = getDateString();
  const outputDir = path.join(baseDir, dateStr);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

// 获取分数等级
function getScoreLevel(score) {
  if (score >= 9) return { label: '必读', emoji: '🔥', color: 'red' };
  if (score >= 8) return { label: '推荐', emoji: '⭐', color: 'orange' };
  if (score >= 7) return { label: '值得一读', emoji: '👍', color: 'yellow' };
  return { label: '参考', emoji: '📄', color: 'gray' };
}

// 获取优先级样式
function getPriorityBadge(priority) {
  const map = {
    high: '🔴 高优先级',
    medium: '🟡 中优先级',
    low: '🟢 低优先级'
  };
  return map[priority] || priority;
}

// 生成维度评分表格
function generateDimensionTable(dimensions) {
  if (!dimensions) return '';
  
  const dimensionNames = {
    contentQuality: '内容质量',
    practicalValue: '实用价值',
    timeliness: '时效性',
    readability: '可读性',
    relevance: '匹配度'
  };
  
  let table = '| 维度 | 评分 | 说明 |\n';
  table += '|------|------|------|\n';
  
  for (const [key, value] of Object.entries(dimensions)) {
    const name = dimensionNames[key] || key;
    const score = value?.score || 0;
    const reason = value?.reason || '';
    const stars = '★'.repeat(Math.floor(score / 2)) + '☆'.repeat(5 - Math.floor(score / 2));
    table += `| ${name} | ${stars} ${score}分 | ${reason} |\n`;
  }
  
  return table;
}

// 生成单篇文章的报告内容
function generateArticleReport(item, index) {
  const analysis = item.analysis;
  const scoreLevel = getScoreLevel(analysis.overallScore);
  const dimensions = analysis.dimensionScores;
  const userAdvice = analysis.userAdvice || {};
  
  let report = `## ${scoreLevel.emoji} ${index + 1}. ${item.articleTitle}\n\n`;
  
  // 基本信息
  report += `**来源**: ${item.accountName}  
`;
  report += `**发布时间**: ${formatDate(item.publishTime)}  \n`;
  report += `**链接**: [阅读原文](${item.url})  \n`;
  report += `**综合评分**: **${analysis.overallScore}** / 10（${scoreLevel.label}）\n\n`;
  
  // 维度评分
  report += '### 评分详情\n\n';
  report += generateDimensionTable(dimensions);
  report += '\n';
  
  // 内容摘要
  if (analysis.summary) {
    report += '### 内容摘要\n\n';
    report += `${analysis.summary}\n\n`;
  }
  
  // 核心观点
  if (analysis.keyPoints && analysis.keyPoints.length > 0) {
    report += '### 核心观点\n\n';
    analysis.keyPoints.forEach((point, i) => {
      report += `${i + 1}. ${point}\n`;
    });
    report += '\n';
  }
  
  // 个性化建议
  report += '### 阅读建议\n\n';
  report += `**优先级**: ${getPriorityBadge(userAdvice.priority || 'medium')}\n\n`;
  report += `**推荐理由**: ${userAdvice.reason || '无'}\n\n`;
  
  if (userAdvice.actionItems && userAdvice.actionItems.length > 0) {
    report += '**建议行动**:\n';
    userAdvice.actionItems.forEach(item => {
      report += `- ${item}\n`;
    });
    report += '\n';
  }
  
  // 标签
  if (analysis.tags && analysis.tags.length > 0) {
    report += '**标签**: ';
    report += analysis.tags.map(tag => `\`${tag}\``).join(' ');
    report += '\n\n';
  }
  
  report += '---\n\n';
  
  return report;
}



// 生成统计摘要
function generateStatsSection(meta, results, lowScoreResults = []) {
  const totalArticles = meta.totalArticles || (results.length + lowScoreResults.length);
  const passedCount = results.length;
  const lowCount = lowScoreResults.length;
  
  let section = '## 📊 统计摘要\n\n';
  
  section += `| 指标 | 数值 |\n`;
  section += `|------|------|\n`;
  section += `| 分析时间 | ${formatDate(meta.analyzedAt || new Date().toISOString())} |\n`;
  section += `| 总文章数 | ${totalArticles} 篇 |\n`;
  section += `| 推荐文章 | ${passedCount} 篇 |\n`;
  section += `| 评分较低 | ${lowCount} 篇 |\n`;
  section += `| 分数线 | ${meta.minScore || 6} 分 |\n`;
  section += `| 推荐率 | ${((passedCount / totalArticles) * 100).toFixed(1)}% |\n`;
  section += '\n';
  
  // 分数分布
  const allResults = [...results, ...lowScoreResults];
  if (allResults.length > 0) {
    const distribution = {
      excellent: allResults.filter(r => r.analysis?.overallScore >= 9).length,
      good: allResults.filter(r => r.analysis?.overallScore >= 8 && r.analysis?.overallScore < 9).length,
      average: allResults.filter(r => r.analysis?.overallScore >= 7 && r.analysis?.overallScore < 8).length,
      below: allResults.filter(r => r.analysis?.overallScore >= 6 && r.analysis?.overallScore < 7).length,
      low: allResults.filter(r => r.analysis?.overallScore < 6).length
    };
    
    section += '### 分数分布\n\n';
    section += '| 等级 | 数量 | 说明 |\n';
    section += '|------|------|------|\n';
    section += `| 🔥 必读 (9-10分) | ${distribution.excellent} 篇 | 强烈推荐，必读内容 |\n`;
    section += `| ⭐ 推荐 (8-9分) | ${distribution.good} 篇 | 质量优秀，建议阅读 |\n`;
    section += `| 👍 值得一读 (7-8分) | ${distribution.average} 篇 | 内容不错，可以选择阅读 |\n`;
    section += `| 📄 参考 (6-7分) | ${distribution.below} 篇 | 作为参考即可 |\n`;
    section += `| ⏸️ 不推荐 (<6分) | ${distribution.low} 篇 | 评分较低，不推荐优先阅读 |\n`;
    section += '\n';
  }
  
  return section;
}

// 按公众号分组统计
function generateSourceSection(results) {
  const bySource = results.reduce((acc, item) => {
    const source = item.accountName || '未知来源';
    if (!acc[source]) {
      acc[source] = [];
    }
    acc[source].push(item);
    return acc;
  }, {});
  
  let section = '### 来源分布\n\n';
  section += '| 公众号 | 推荐文章数 | 平均分 |\n';
  section += '|--------|-----------|--------|\n';
  
  for (const [source, items] of Object.entries(bySource)) {
    const avgScore = (items.reduce((sum, i) => sum + (i.analysis?.overallScore || 0), 0) / items.length).toFixed(1);
    section += `| ${source} | ${items.length} 篇 | ${avgScore} 分 |\n`;
  }
  
  section += '\n';
  return section;
}

// 生成 Markdown 报告
function generateMarkdownReport(data, userProfile) {
  const { meta, results, lowScoreResults = [] } = data;
  
  let md = `# 📰 微信公众号阅读推荐报告\n\n`;
  md += `> 生成时间: ${formatDate(new Date().toISOString())}  \n`;
  md += `> 目标读者: ${userProfile.role}（${userProfile.level}）\n\n`;
  
  // 目录
  md += '## 📑 目录\n\n';
  md += '1. [统计摘要](#统计摘要)\n';
  md += '2. [推荐文章](#推荐文章)\n';
  md += '3. [评分较低文章](#评分较低文章)\n';
  md += '4. [阅读计划](#阅读计划)\n\n';
  md += '---\n\n';
  
  // 统计摘要
  md += generateStatsSection(meta, results, lowScoreResults);
  md += generateSourceSection([...results, ...lowScoreResults]);
  md += '---\n\n';
  
  // 推荐文章列表
  md += `## 📖 推荐文章（共 ${results.length} 篇）\n\n`;
  
  if (results.length === 0) {
    md += '> ⚠️ 暂无符合条件的推荐文章\n\n';
  } else {
    results.forEach((item, index) => {
      md += generateArticleReport(item, index);
    });
  }
  
  // 低分文章部分 - 使用 HTML details 实现折叠
  if (lowScoreResults.length > 0) {
    md += `## 📋 评分较低文章（共 ${lowScoreResults.length} 篇）\n\n`;
    md += '<details>\n';
    md += `<summary>🔽 点击展开查看评分低于 ${meta.minScore} 分的文章（不推荐优先阅读）</summary>\n\n`;
    
    md += '| 序号 | 文章标题 | 公众号 | 评分 | 不推荐理由 |\n';
    md += '|------|----------|--------|------|------------|\n';
    
    lowScoreResults.forEach((item, index) => {
      const analysis = item.analysis;
      const dimensions = analysis.dimensionScores;
      
      // 找出得分低的维度
      const lowDimensions = Object.entries(dimensions)
        .filter(([_, val]) => val.score < 6)
        .map(([key, val]) => {
          const names = {
            contentQuality: '内容质量',
            practicalValue: '实用价值', 
            timeliness: '时效性',
            readability: '可读性',
            relevance: '匹配度'
          };
          return `${names[key]}(${val.score}分)`;
        });
      
      md += `| ${index + 1} | [${item.articleTitle}](${item.url}) | ${item.accountName} | **${analysis.overallScore}** | ${lowDimensions.join('、') || '综合评分较低'} |\n`;
    });
    
    md += '\n';
    md += '### 低分文章详细说明\n\n';
    
    lowScoreResults.forEach((item, index) => {
      const analysis = item.analysis;
      md += `**${index + 1}. ${item.articleTitle}**（${item.accountName}）- 评分：${analysis.overallScore}\n\n`;
      
      // 详细列出各维度评分
      const dimensionNames = {
        contentQuality: '内容质量',
        practicalValue: '实用价值', 
        timeliness: '时效性',
        readability: '可读性',
        relevance: '匹配度'
      };
      
      Object.entries(analysis.dimensionScores).forEach(([key, val]) => {
        md += `- ${dimensionNames[key]}: ${val.score}分 - ${val.reason}\n`;
      });
      
      md += `\n> 💡 **跳过的原因**: ${analysis.userAdvice?.reason || '综合评分较低，建议优先阅读高分文章'}\n\n`;
      md += '---\n\n';
    });
    
    md += '</details>\n\n';
    md += '---\n\n';
  }
  
  // 阅读计划建议
  md += '## 📅 阅读计划建议\n\n';
  
  const highPriority = results.filter(r => r.analysis?.userAdvice?.priority === 'high');
  const mediumPriority = results.filter(r => r.analysis?.userAdvice?.priority === 'medium');
  
  if (highPriority.length > 0) {
    md += '### 🔴 优先阅读\n\n';
    md += '建议在 **24小时内** 阅读以下文章：\n\n';
    highPriority.forEach((item, i) => {
      md += `${i + 1}. [${item.articleTitle}](${item.url}) - ${item.accountName}\n`;
    });
    md += '\n';
  }
  
  if (mediumPriority.length > 0) {
    md += '### 🟡 本周阅读\n\n';
    md += '建议在 **本周内** 抽时间阅读：\n\n';
    mediumPriority.slice(0, 5).forEach((item, i) => {
      md += `${i + 1}. [${item.articleTitle}](${item.url}) - ${item.accountName}\n`;
    });
    md += '\n';
  }
  
  // 说明
  md += '---\n\n';
  md += '## ℹ️ 说明\n\n';
  md += '### 评分维度\n\n';
  md += '1. **内容质量** - 文章的信息准确性、深度和原创性\n';
  md += '2. **实用价值** - 对实际工作或学习的帮助程度\n';
  md += '3. **时效性** - 内容的时效程度和紧急程度\n';
  md += '4. **可读性** - 文章结构、语言表达和逻辑清晰度\n';
  md += '5. **匹配度** - 与您的职业角色和关注领域的匹配程度\n\n';
  
  md += '### 优先级说明\n\n';
  md += '- 🔴 **高优先级** - 强烈建议尽快阅读，对当前工作有直接帮助\n';
  md += '- 🟡 **中优先级** - 建议本周内阅读，有助于技能提升\n';
  md += '- 🟢 **低优先级** - 可作为扩展阅读，有时间再读\n\n';
  
  md += '> 💡 **提示**: 本报告由 AI Agent 根据您的个人资料自动生成，评分和建议仅供参考。\n';
  
  return md;
}

/**
 * 主函数
 */
async function main() {
  console.log('\n======================================');
  console.log('📄 报告生成器');
  console.log('======================================\n');
  
  try {
    // 加载配置和分析结果
    const config = loadConfig();
    const data = loadAnalysisResults(config);
    
    // 分离高分和低分文章
    const minScore = config.analysis?.minScore || 6;
    const allResults = data.results || [];
    const highScoreResults = allResults.filter(r => r.analysis?.overallScore >= minScore);
    const lowScoreResults = allResults.filter(r => r.analysis?.overallScore < minScore);
    
    log('success', `加载分析结果: 共 ${allResults.length} 篇文章`);
    log('info', `推荐文章: ${highScoreResults.length} 篇 (≥${minScore}分)`);
    log('info', `评分较低: ${lowScoreResults.length} 篇 (<${minScore}分)`);
    
    // 准备数据
    const reportData = {
      meta: {
        ...data.meta,
        minScore,
        totalArticles: allResults.length,
        passedCount: highScoreResults.length,
        analyzedAt: data.meta?.analyzedAt || new Date().toISOString()
      },
      results: highScoreResults,
      lowScoreResults: lowScoreResults
    };
    
    // 生成报告
    const markdown = generateMarkdownReport(reportData, config.userProfile);
    
    // 获取按日期归档的输出目录
    const baseOutputDir = path.resolve('./skills/wechat-mp-analyzer/output');
    const outputDir = getOutputDir(baseOutputDir);
    const reportPath = path.join(outputDir, 'articles.md');

    fs.writeFileSync(reportPath, markdown, 'utf-8');
    
    console.log('\n======================================');
    log('success', '报告生成成功！');
    log('info', `报告路径: ${reportPath}`);
    log('info', `推荐文章: ${highScoreResults.length} 篇`);
    log('info', `低分文章: ${lowScoreResults.length} 篇（已折叠）`);
    console.log('======================================\n');
    
    return reportPath;
    
  } catch (error) {
    log('error', `执行失败: ${error.message}`);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main();
}

export { main as generateReport };
