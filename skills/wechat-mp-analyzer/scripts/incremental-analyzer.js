#!/usr/bin/env node

/**
 * 增量分析管理器
 * 支持分批处理文章，每处理一篇就保存结果，避免数据丢失
 * 
 * 功能:
 * 1. 获取待分析文章列表（排除已分析的）
 * 2. 保存单篇分析结果（增量追加）
 * 3. 检查分析进度
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取 YYYYMMDD 格式的日期字符串
function getDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// 获取输出目录
function getOutputDir() {
  const baseOutputDir = path.resolve('./skills/wechat-mp-analyzer/output');
  const dateStr = getDateString();
  return path.join(baseOutputDir, dateStr);
}

/**
 * 加载已有的分析结果
 */
function loadExistingResults() {
  const outputDir = getOutputDir();
  const resultsPath = path.join(outputDir, 'analysis-results.json');
  
  if (!fs.existsSync(resultsPath)) {
    return { meta: {}, results: [] };
  }
  
  try {
    return JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  } catch (error) {
    console.error('加载已有结果失败:', error.message);
    return { meta: {}, results: [] };
  }
}

/**
 * 获取待分析的文章列表
 * @param {number} batchSize - 批次大小，默认5篇
 * @returns {Object} 包含待分析文章和进度信息
 */
export function getPendingArticles(batchSize = 5) {
  const outputDir = getOutputDir();
  const articlesPath = path.join(outputDir, 'articles.json');
  const tasksPath = path.join(outputDir, 'analysis-tasks.json');
  
  if (!fs.existsSync(articlesPath)) {
    throw new Error(`文章数据不存在: ${articlesPath}\n请先运行 fetch-articles.js 采集文章`);
  }
  
  if (!fs.existsSync(tasksPath)) {
    throw new Error(`分析任务不存在: ${tasksPath}\n请先运行 batch-analyze.js 准备任务`);
  }
  
  const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'));
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
  const existingResults = loadExistingResults();
  
  // 获取已分析的文章 ID
  const analyzedIds = new Set(existingResults.results.map(r => r.articleId));
  
  // 过滤出未分析的任务
  const pendingTasks = tasks.filter(task => !analyzedIds.has(task.articleId));
  
  // 获取当前批次
  const currentBatch = pendingTasks.slice(0, batchSize);
  
  return {
    total: articles.length,
    analyzed: analyzedIds.size,
    pending: pendingTasks.length,
    currentBatch,
    batchSize,
    isComplete: pendingTasks.length === 0,
    progress: `${analyzedIds.size}/${articles.length}`
  };
}

/**
 * 保存单篇文章的分析结果（增量保存）
 * @param {Object} result - 分析结果
 */
export function saveAnalysisResult(result) {
  const outputDir = getOutputDir();
  const resultsPath = path.join(outputDir, 'analysis-results.json');
  
  // 确保目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 加载已有结果
  const existingData = loadExistingResults();
  
  // 检查是否已存在该文章的分析结果
  const existingIndex = existingData.results.findIndex(
    r => r.articleId === result.articleId
  );
  
  if (existingIndex >= 0) {
    // 更新已有结果
    existingData.results[existingIndex] = result;
  } else {
    // 添加新结果
    existingData.results.push(result);
  }
  
  // 更新元信息
  existingData.meta = {
    totalArticles: existingData.results.length,
    analyzedCount: existingData.results.length,
    lastUpdated: new Date().toISOString(),
    analysisMethod: 'incremental'
  };
  
  // 保存文件
  fs.writeFileSync(resultsPath, JSON.stringify(existingData, null, 2), 'utf-8');
  
  return {
    saved: true,
    articleId: result.articleId,
    totalAnalyzed: existingData.results.length
  };
}

/**
 * 批量保存分析结果
 * @param {Array} results - 分析结果数组
 */
export function saveBatchResults(results) {
  const savedResults = [];
  for (const result of results) {
    const saved = saveAnalysisResult(result);
    savedResults.push(saved);
  }
  return savedResults;
}

/**
 * 获取分析进度状态
 */
export function getProgress() {
  const outputDir = getOutputDir();
  const articlesPath = path.join(outputDir, 'articles.json');
  
  if (!fs.existsSync(articlesPath)) {
    return { error: '未找到文章数据，请先采集文章' };
  }
  
  const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'));
  const existingResults = loadExistingResults();
  
  const total = articles.length;
  const analyzed = existingResults.results.length;
  const pending = total - analyzed;
  const percentage = ((analyzed / total) * 100).toFixed(1);
  
  return {
    total,
    analyzed,
    pending,
    percentage: `${percentage}%`,
    isComplete: pending === 0,
    message: pending === 0 
      ? '✅ 所有文章分析完成！'
      : `📊 进度: ${analyzed}/${total} (${percentage}%)，剩余 ${pending} 篇待分析`
  };
}

/**
 * 重置分析结果（谨慎使用）
 */
export function resetResults() {
  const outputDir = getOutputDir();
  const resultsPath = path.join(outputDir, 'analysis-results.json');
  
  if (fs.existsSync(resultsPath)) {
    fs.unlinkSync(resultsPath);
    return { reset: true, message: '分析结果已重置' };
  }
  return { reset: false, message: '没有需要重置的结果' };
}

// 命令行支持
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   📊 增量分析管理器                    ║');
  console.log('╚════════════════════════════════════════╝\n');
  
  switch (command) {
    case 'progress':
      console.log('当前分析进度：');
      console.log(JSON.stringify(getProgress(), null, 2));
      break;
      
    case 'pending':
      const batchSize = parseInt(args[1]) || 5;
      console.log(`获取待分析文章（批次大小: ${batchSize}）：`);
      try {
        const pending = getPendingArticles(batchSize);
        console.log(JSON.stringify(pending, null, 2));
      } catch (error) {
        console.error('错误:', error.message);
      }
      break;
      
    case 'reset':
      console.log('重置分析结果：');
      console.log(JSON.stringify(resetResults(), null, 2));
      break;
      
    default:
      console.log('用法:');
      console.log('  node incremental-analyzer.js progress     - 查看分析进度');
      console.log('  node incremental-analyzer.js pending [n]  - 获取n篇待分析文章');
      console.log('  node incremental-analyzer.js reset        - 重置分析结果');
  }
}

if (import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main();
}

export default {
  getPendingArticles,
  saveAnalysisResult,
  saveBatchResults,
  getProgress,
  resetResults
};
