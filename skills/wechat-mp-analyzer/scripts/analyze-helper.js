#!/usr/bin/env node

/**
 * 文章分析助手 - 提供简洁的接口供 AI 分析文章
 * 
 * 用法:
 * node analyze-helper.js next [n]     - 获取下 n 篇待分析文章的提示词（默认3篇）
 * node analyze-helper.js save         - 从 stdin 读取分析结果并保存
 * node analyze-helper.js status       - 显示分析进度
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 日期格式化
function getDateString() {
  const date = new Date();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

// 输出目录
function getOutputDir() {
  return path.resolve(`./skills/wechat-mp-analyzer/output/${getDateString()}`);
}

// 加载已有分析结果
function loadResults() {
  const resultsPath = path.join(getOutputDir(), 'analysis-results.json');
  if (!fs.existsSync(resultsPath)) {
    return { meta: {}, results: [] };
  }
  return JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
}

// 保存分析结果
function saveResults(data) {
  const outputDir = getOutputDir();
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const resultsPath = path.join(outputDir, 'analysis-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(data, null, 2), 'utf-8');
}

// 获取下一批待分析文章
function getNextBatch(count = 3) {
  const outputDir = getOutputDir();
  const tasksPath = path.join(outputDir, 'analysis-tasks.json');
  const articlesPath = path.join(outputDir, 'articles.json');
  
  if (!fs.existsSync(tasksPath)) {
    console.log('❌ 未找到分析任务，请先运行 batch-analyze.js');
    process.exit(1);
  }
  
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
  const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'));
  const existingResults = loadResults();
  const analyzedIds = new Set(existingResults.results.map(r => r.articleId));
  
  // 过滤出未分析的任务
  const pendingTasks = tasks.filter(t => !analyzedIds.has(t.articleId));
  
  if (pendingTasks.length === 0) {
    console.log('✅ 所有文章已分析完成！');
    console.log(`总计: ${articles.length} 篇`);
    return [];
  }
  
  const batch = pendingTasks.slice(0, count);
  
  console.log(`\n📊 分析进度: ${analyzedIds.size}/${articles.length} (剩余 ${pendingTasks.length} 篇)\n`);
  console.log('═'.repeat(60));
  
  batch.forEach((task, idx) => {
    console.log(`\n【文章 ${idx + 1}/${batch.length}】ID: ${task.articleId}`);
    console.log(`标题: ${task.articleTitle}`);
    console.log('─'.repeat(60));
    console.log('\n📝 分析提示词:\n');
    console.log(task.prompt);
    console.log('\n' + '═'.repeat(60));
  });
  
  console.log('\n💡 请对上述文章进行分析，并按以下格式输出每篇文章的分析结果：\n');
  console.log('```json');
  console.log(`{
  "articleId": "文章ID（必填，从上面复制）",
  "overallScore": 8.5,
  "dimensionScores": {
    "contentQuality": { "score": 8, "reason": "评价理由" },
    "practicalValue": { "score": 9, "reason": "评价理由" },
    "timeliness": { "score": 8, "reason": "评价理由" },
    "readability": { "score": 9, "reason": "评价理由" },
    "relevance": { "score": 8, "reason": "评价理由" }
  },
  "summary": "文章摘要（100字内）",
  "keyPoints": ["核心观点1", "核心观点2"],
  "userAdvice": {
    "shouldRead": true,
    "priority": "high/medium/low",
    "reason": "推荐理由",
    "actionItems": ["建议行动1"]
  },
  "tags": ["标签1", "标签2"]
}`);
  console.log('```\n');
  
  return batch;
}

// 保存单篇分析结果
function saveOneResult(analysisResult) {
  const outputDir = getOutputDir();
  const tasksPath = path.join(outputDir, 'analysis-tasks.json');
  const articlesPath = path.join(outputDir, 'articles.json');
  
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
  const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'));
  
  const task = tasks.find(t => t.articleId === analysisResult.articleId);
  const article = articles.find(a => a.id === analysisResult.articleId);
  
  if (!task) {
    console.log(`❌ 未找到文章 ID: ${analysisResult.articleId}`);
    return false;
  }
  
  const existingData = loadResults();
  
  // 构建完整的分析结果（包含文章的元信息）
  const fullResult = {
    articleId: task.articleId,
    articleTitle: task.articleTitle,
    accountName: article?.accountName || '未知来源',
    url: article?.url || '',
    publishTime: article?.publishTime || new Date().toISOString(),
    analysis: {
      overallScore: analysisResult.overallScore,
      dimensionScores: analysisResult.dimensionScores,
      summary: analysisResult.summary,
      keyPoints: analysisResult.keyPoints,
      userAdvice: analysisResult.userAdvice,
      tags: analysisResult.tags
    },
    analyzedAt: new Date().toISOString()
  };
  
  // 检查是否已存在
  const existingIdx = existingData.results.findIndex(r => r.articleId === task.articleId);
  if (existingIdx >= 0) {
    existingData.results[existingIdx] = fullResult;
  } else {
    existingData.results.push(fullResult);
  }
  
  // 更新元信息
  existingData.meta = {
    totalArticles: tasks.length,
    analyzedCount: existingData.results.length,
    lastUpdated: new Date().toISOString()
  };
  
  saveResults(existingData);
  console.log(`✅ 已保存: ${task.articleTitle.slice(0, 40)}...`);
  return true;
}

// 显示状态
function showStatus() {
  const outputDir = getOutputDir();
  const articlesPath = path.join(outputDir, 'articles.json');
  
  if (!fs.existsSync(articlesPath)) {
    console.log('❌ 未找到文章数据');
    return;
  }
  
  const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'));
  const existingResults = loadResults();
  
  const total = articles.length;
  const analyzed = existingResults.results.length;
  const pending = total - analyzed;
  const pct = ((analyzed / total) * 100).toFixed(1);
  
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║          📊 分析进度统计                ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log(`总文章数:   ${total} 篇`);
  console.log(`已分析:     ${analyzed} 篇`);
  console.log(`待分析:     ${pending} 篇`);
  console.log(`完成度:     ${pct}%`);
  console.log('');
  
  if (pending === 0) {
    console.log('✅ 所有文章分析完成！可以运行 generate-report.js 生成报告。');
  } else {
    console.log(`💡 运行 "node analyze-helper.js next ${Math.min(pending, 5)}" 继续分析`);
  }
  console.log('');
}

// 主函数
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];
  
  switch (command) {
    case 'next':
      const count = parseInt(arg) || 3;
      getNextBatch(count);
      break;
      
    case 'save':
      // 从命令行参数读取 JSON
      if (arg) {
        try {
          const result = JSON.parse(arg);
          saveOneResult(result);
        } catch (e) {
          console.log('❌ JSON 解析失败:', e.message);
        }
      } else {
        console.log('用法: node analyze-helper.js save \'{"articleId": "...", ...}\'');
      }
      break;
      
    case 'status':
      showStatus();
      break;
      
    default:
      console.log('\n📖 文章分析助手\n');
      console.log('用法:');
      console.log('  node analyze-helper.js next [n]   - 获取下 n 篇待分析文章');
      console.log('  node analyze-helper.js save JSON  - 保存分析结果');
      console.log('  node analyze-helper.js status     - 显示分析进度');
  }
}

main();

export { getNextBatch, saveOneResult, showStatus };
