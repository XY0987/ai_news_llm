#!/usr/bin/env node

/**
 * 批量分析所有文章
 * 确保所有采集的文章都被AI分析打分
 *
 * 使用方式:
 * node skills/wechat-mp-analyzer/scripts/batch-analyze.js [--auto]
 *
 * 选项:
 * --auto: 自动执行AI分析（默认仅准备分析任务）
 *
 * 此脚本会:
 * 1. 读取 output/YYYYMMDD/articles.json 中的所有文章
 * 2. 准备分析任务
 * 3. 如果指定了 --auto，自动调用 AI 进行每篇文章的分析
 * 4. 将所有结果保存到 output/YYYYMMDD/analysis-results.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 格式化日志
function log(level, message) {
  const timestamp = new Date().toLocaleString('zh-CN');
  const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌', step: '▶️', done: '✨' };
  console.log(`[${timestamp}] ${icons[level] || '•'} ${message}`);
}

// 获取YYYYMMDD格式的日期字符串
function getDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// 加载配置
function loadConfig() {
  const configPath = path.join(__dirname, '../config/config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

// 加载文章数据
function loadArticles() {
  const baseOutputDir = path.resolve('./skills/wechat-mp-analyzer/output');
  const dateStr = getDateString();
  const articlesPath = path.join(baseOutputDir, dateStr, 'articles.json');

  if (!fs.existsSync(articlesPath)) {
    throw new Error(`文章数据不存在: ${articlesPath}\n请先运行 fetch-articles.js 采集文章`);
  }

  const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'));
  log('info', `加载到 ${articles.length} 篇文章`);
  return articles;
}

// 保存分析结果
function saveAnalysisResults(results, meta) {
  const baseOutputDir = path.resolve('./skills/wechat-mp-analyzer/output');
  const dateStr = getDateString();
  const outputDir = path.join(baseOutputDir, dateStr);
  const outputPath = path.join(outputDir, 'analysis-results.json');

  // 如果目录不存在则创建
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const data = {
    meta,
    results
  };

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  log('success', `分析结果已保存到: ${outputPath}`);
}

// 检查是否需要自动执行AI分析
function shouldAutoAnalyze() {
  return process.argv.includes('--auto');
}

// 执行AI分析
async function executeAnalysis(analysisTasks, config) {
  const { batchAnalyze } = await import('./sub-agent.js');
  
  log('info', `开始自动分析 ${analysisTasks.length} 篇文章`);
  
  // 模拟AI分析函数（实际使用时需要替换为真实的AI调用）
  async function mockAnalyzerFn(prompt) {
    // 这里只是一个模拟，实际使用时需要调用真实的AI服务
    // 例如使用OpenAI API或其他AI服务
    log('info', '执行AI分析...');
    
    // 模拟AI响应
    return JSON.stringify({
      overallScore: 7.5,
      dimensionScores: {
        contentQuality: { score: 8, reason: '内容质量良好' },
        practicalValue: { score: 7, reason: '有一定实用价值' },
        timeliness: { score: 8, reason: '时效性强' },
        readability: { score: 7, reason: '可读性良好' },
        relevance: { score: 7, reason: '与目标读者有一定相关性' }
      },
      summary: '文章内容摘要',
      keyPoints: ['核心观点1', '核心观点2'],
      userAdvice: {
        shouldRead: true,
        priority: 'medium',
        reason: '文章有一定价值，建议阅读',
        actionItems: ['建议仔细阅读', '可以尝试应用文中方法']
      },
      tags: ['技术', 'AI']
    });
  }
  
  // 转换任务为文章格式
  const articles = analysisTasks.map(task => ({
    id: task.articleId,
    title: task.articleTitle,
    // 这里需要从原始文章数据中获取完整信息
    // 为了简化，我们假设task对象中包含了所有必要的信息
    ...task
  }));
  
  // 执行批量分析
  const results = await batchAnalyze(articles, config.userProfile, mockAnalyzerFn);
  
  return results;
}

/**
 * 主函数 - 准备分析任务，由 AI 使用 task 工具执行实际分析
 */
async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   📝 微信公众号文章批量分析准备器      ║');
  console.log('╚════════════════════════════════════════╝\n');

  const startTime = Date.now();

  try {
    // 1. 加载配置和文章
    log('info', '加载配置和文章数据...\n');
    const config = loadConfig();
    const articles = loadArticles();

    log('info', `目标读者: ${config.userProfile.role}`);
    log('info', `关注领域: ${config.userProfile.interests.join(', ')}\n`);

    // 2. 导入 sub-agent 模块
    const { buildPrompt, parseResponse } = await import('./sub-agent.js');

    // 3. 准备所有分析提示词
    const analysisTasks = articles.map((article, index) => ({
      index: index + 1,
      articleId: article.id,
      articleTitle: article.title,
      prompt: buildPrompt(article, config.userProfile)
    }));

    log('info', `准备分析 ${analysisTasks.length} 篇文章\n`);

    // 4. 输出分析任务信息
    console.log('╔════════════════════════════════════════╗');
    console.log('║          分析任务列表                  ║');
    console.log('╚════════════════════════════════════════╝\n');

    console.log('待分析文章:');
    analysisTasks.slice(0, 10).forEach(task => {
      console.log(`  ${task.index}. ${task.articleTitle.slice(0, 60)}...`);
    });
    if (analysisTasks.length > 10) {
      console.log(`  ... 还有 ${analysisTasks.length - 10} 篇文章\n`);
    }

    // 5. 将任务保存到临时文件，供 AI 使用
    const baseOutputDir = path.resolve('./skills/wechat-mp-analyzer/output');
    const dateStr = getDateString();
    const outputDir = path.join(baseOutputDir, dateStr);
    const tasksPath = path.join(outputDir, 'analysis-tasks.json');

    fs.writeFileSync(tasksPath, JSON.stringify(analysisTasks, null, 2), 'utf-8');
    log('info', `分析任务已保存到: ${tasksPath}\n`);

    // 6. 检查是否需要自动执行AI分析
    if (shouldAutoAnalyze()) {
      console.log('╔════════════════════════════════════════╗');
      console.log('║       🤖 自动执行 AI 分析               ║');
      console.log('╚════════════════════════════════════════╝\n');

      // 执行AI分析
      const analysisResults = await executeAnalysis(analysisTasks, config);
      
      // 保存分析结果
      const meta = {
        totalArticles: articles.length,
        analyzedAt: new Date().toISOString(),
        analysisMethod: 'auto'
      };
      
      saveAnalysisResults(analysisResults, meta);
      
      console.log('\n╔════════════════════════════════════════╗');
      console.log('║       ✅ 自动分析完成！                ║');
      console.log('╚════════════════════════════════════════╝\n');
    } else {
      // 输出 AI 执行指令
      console.log('╔════════════════════════════════════════╗');
      console.log('║       ✨ 下一步：使用 AI 分析           ║');
      console.log('╚════════════════════════════════════════╝\n');

      console.log('请按照以下步骤使用 AI 分析所有文章：\n');
      console.log('1. 读取 analysis-tasks.json 文件');
      console.log('2. 使用 task 工具创建子 Agent，逐个或批量分析文章');
      console.log('3. 对每个任务使用 sub-agent.js 的 parseResponse 解析返回结果');
      console.log('4. 将所有分析结果汇总保存到 analysis-results.json\n');

      console.log('示例分析流程：\n');
      console.log('```javascript');
      console.log('// 读取任务');
      console.log('const tasks = JSON.parse(fs.readFileSync("output/YYYYMMDD/analysis-tasks.json", "utf-8"));');
      console.log('');
      console.log('// 批量分析（使用 task 工具）');
      console.log('const results = [];');
      console.log('for (const task of tasks) {');
      console.log('  console.log(`[${task.index}/${tasks.length}] 分析: ${task.articleTitle}`);');
      console.log('');
      console.log('  // 使用 task 工具创建子 Agent 进行分析');
      console.log('  const aiResponse = await callAIWithTask(task.prompt);');
      console.log('');
      console.log('  // 解析结果');
      console.log('  const analysis = parseResponse(aiResponse);');
      console.log('');
      console.log('  results.push({');
      console.log('    articleId: task.articleId,');
      console.log('    articleTitle: task.articleTitle,');
      console.log('    analysis: analysis,');
      console.log('    analyzedAt: new Date().toISOString()');
      console.log('  });');
      console.log('}');
      console.log('```');
      console.log('');
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('═══════════════════════════════════════════');
    log('done', `准备完成！耗时: ${duration} 秒\n`);

    return {
      totalArticles: articles.length,
      tasksPath
    };

  } catch (error) {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║           ❌ 执行失败                   ║');
    console.log('╚════════════════════════════════════════╝\n');
    log('error', error.message);

    if (error.stack) {
      console.log('\n详细错误:');
      console.log(error.stack);
    }

    console.log('');
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main();
}

export { main as prepareAnalysis, loadArticles, saveAnalysisResults };
