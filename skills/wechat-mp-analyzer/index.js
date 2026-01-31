#!/usr/bin/env node

/**
 * 微信公众号资讯分析器 - 主入口
 *
 * 完整流程:
 * 1. 采集文章 (fetch-articles.js) - 使用此脚本执行
 * 2. 分析文章 - 由 AI 使用 task 工具创建子 Agent
 * 3. 生成报告 (generate-report.js) - 使用此脚本执行
 *
 * 注意：此脚本仅用于采集文章，分析步骤需要 AI 使用 task 工具完成
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 格式化日志
function log(level, message) {
  const timestamp = new Date().toLocaleString('zh-CN');
  const icons = {
    info: 'ℹ️',
    success: '✅',
    warn: '⚠️',
    error: '❌',
    step: '▶️',
    done: '✨'
  };
  console.log(`[${timestamp}] ${icons[level] || '•'} ${message}`);
}

// 加载配置
function loadConfig() {
  const configPath = path.join(__dirname, 'config/config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

// 验证配置
function validateConfig(config) {
  const errors = [];

  if (!config.wechat?.token) {
    errors.push('缺少 wechat.token 配置');
  }
  if (!config.wechat?.cookie) {
    errors.push('缺少 wechat.cookie 配置');
  }
  if (!config.accounts || config.accounts.length === 0) {
    errors.push('缺少 accounts 配置（公众号列表）');
  }
  if (!config.userProfile?.role) {
    errors.push('缺少 userProfile.role 配置');
  }

  return errors;
}

// 显示配置摘要
function showConfigSummary(config, recentDays) {
  console.log('\n📋 配置摘要');
  console.log('----------------------------------------');
  console.log(`目标角色: ${config.userProfile?.role || '未设置'}`);
  console.log(`关注领域: ${config.userProfile?.interests?.join(', ') || '未设置'}`);
  console.log(`采集天数: 近 ${recentDays} 天`);
  console.log(`最低分数: ${config.analysis?.minScore || 6} 分`);
  console.log(`公众号数: ${config.accounts?.length || 0} 个`);
  console.log('----------------------------------------\n');
}

// 显示最终结果
function showFetchResult(articlesCount, config, recentDays) {
  console.log('\n');
  console.log('╔════════════════════════════════════════╗');
  console.log('║        📰 文章采集完成！                ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`📰 采集文章数: ${articlesCount} 篇`);
  console.log(`📅 采集范围: 近 ${recentDays} 天`);
  console.log('');
  console.log('📂 输出文件:');
  console.log(`   • 文章数据: ./skills/wechat-mp-analyzer/output/${getDateString()}/articles.json`);
  console.log('');
  console.log('💡 下一步:');
  console.log('   1. AI 使用 task 工具创建子 Agent 分析每篇文章');
  console.log('   2. 汇总分析结果保存到 output/YYYYMMDD/analysis-results.json');
  console.log('   3. 运行 generate-report.js 生成报告');
  console.log('');
}

// 获取YYYYMMDD格式的日期字符串
function getDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 主函数 - 仅采集文章
 * @param {number} recentDays - 采集天数，默认为1天
 */
async function main(recentDays = 1) {
  console.log('\n');
  console.log('╔════════════════════════════════════════╗');
  console.log('║      📰 微信公众号文章采集器            ║');
  console.log('║         (仅采集，分析需 AI 完成)          ║');
  console.log('╚════════════════════════════════════════╝');

  const startTime = Date.now();

  try {
    // 1. 加载和验证配置
    log('info', '加载配置...');
    const config = loadConfig();

    const errors = validateConfig(config);
    if (errors.length > 0) {
      console.log('\n❌ 配置验证失败:');
      errors.forEach(err => console.log(`   • ${err}`));
      console.log('\n请编辑 config/config.json 文件完善配置\n');
      process.exit(1);
    }

    log('success', '配置加载成功');
    showConfigSummary(config, recentDays);

    // 2. 采集文章
    log('info', '开始采集文章...\n');
    const { fetchArticles } = await import('./scripts/fetch-articles.js');
    const articles = await fetchArticles(recentDays);

    // 3. 显示结果
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    showFetchResult(articles.length, config, recentDays);
    log('done', `总耗时: ${totalDuration} 秒\n`);

  } catch (error) {
    console.log('\n');
    console.log('╔════════════════════════════════════════╗');
    console.log('║           ❌ 执行失败                   ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
    log('error', error.message);

    if (error.stack) {
      console.log('\n详细错误:');
      console.log(error.stack);
    }

    console.log('');
    process.exit(1);
  }
}

// 运行主函数
// 从命令行参数获取天数，例如：node index.js 7
const daysArg = process.argv[2];
const days = daysArg && !isNaN(parseInt(daysArg)) ? parseInt(daysArg) : 1;
main(days);
