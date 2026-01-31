#!/usr/bin/env node

/**
 * 微信公众号文章采集脚本
 * 根据配置采集指定公众号的最新文章
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载配置
function loadConfig() {
  const configPath = path.join(__dirname, '../config/config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 随机延迟
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

// 格式化日志
function log(level, message) {
  const timestamp = new Date().toLocaleString('zh-CN');
  const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
  console.log(`[${timestamp}] ${icons[level] || '•'} ${message}`);
}

/**
 * 请求文章列表
 */
async function fetchArticleList(account, token, cookie, config, begin = 0) {
  const params = {
    sub: 'list',
    search_field: 'null',
    begin,
    count: config.collection?.maxArticlesPerAccount || 10,
    query: '',
    fakeid: account.fakeid,
    type: '101_1',
    free_publish_type: 1,
    sub_action: 'list_ex',
    token: token,
    lang: 'zh_CN',
    f: 'json',
    ajax: 1
  };

  const headers = {
    Cookie: cookie,
    Referer: 'https://mp.weixin.qq.com/',
    Origin: 'https://mp.weixin.qq.com',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  };

  const response = await axios.get(config.wechat.apiUrl, {
    params,
    headers,
    timeout: 30000
  });

  return response.data;
}

/**
 * 解析响应数据
 */
function parseResponse(response) {
  if (!response.publish_page) {
    return [];
  }

  const publishPage = JSON.parse(response.publish_page);
  const publishList = publishPage.publish_list || [];
  const articles = [];

  publishList.forEach(item => {
    if (!item.publish_info) return;
    try {
      const publishInfo = JSON.parse(item.publish_info);
      const appmsgex = publishInfo.appmsgex || [];
      if (Array.isArray(appmsgex)) {
        articles.push(...appmsgex);
      }
    } catch (e) {
      // 跳过解析失败的项目
    }
  });

  return articles;
}

/**
 * 从公众号文章 HTML 中提取正文文本
 */
function extractArticleText(html) {
  if (!html) return '';
  try {
    const $ = cheerio.load(html);
    const container = $('#js_content').length ? $('#js_content') : $('.rich_media_content');
    if (container.length === 0) {
      return $('body').text().replace(/\s+/g, ' ').trim();
    }
    container.find('script, style').remove();
    return container.text().replace(/\s+/g, ' ').trim();
  } catch (error) {
    return '';
  }
}

/**
 * 抓取文章正文
 */
async function fetchArticleContent(url) {
  if (!url) return { content: '', snippet: '' };
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Referer: 'https://mp.weixin.qq.com/'
      },
      timeout: 30000
    });
    
    const content = extractArticleText(response.data);
    const snippet = content.slice(0, 600);
    return { content, snippet };
  } catch (error) {
    log('error', `获取正文失败: ${error.message}`);
    return { content: '', snippet: '' };
  }
}

/**
 * 过滤最近 N 天的文章
 */
function filterRecentArticles(articles, recentDays) {
  const cutoffTime = Date.now() - (recentDays * 24 * 60 * 60 * 1000);
  return articles.filter(article => {
    const publishTime = article.update_time 
      ? article.update_time * 1000 
      : (article.create_time ? article.create_time * 1000 : Date.now());
    return publishTime >= cutoffTime;
  });
}

/**
 * 采集单个公众号的文章
 * @param {Object} account - 公众号配置
 * @param {Object} config - 完整配置
 * @param {number} recentDays - 采集天数（用户指定，不从配置读取）
 */
async function collectAccount(account, config, recentDays) {
  const { token, cookie } = config.wechat;

  log('info', `开始采集: ${account.nickname}`);

  try {
    const response = await fetchArticleList(account, token, cookie, config);

    // 检查 token 是否过期
    if (response?.base_resp?.ret === 200003) {
      throw new Error('Token 已过期，请重新登录获取');
    }

    if (response?.base_resp?.ret !== 0 && response?.base_resp?.ret !== undefined) {
      throw new Error(`接口返回错误: ${response.base_resp.err_msg || '未知错误'}`);
    }

    const articles = parseResponse(response);
    log('info', `${account.nickname}: 获取到 ${articles.length} 条文章`);

    // 过滤最近的文章（使用传入的天数）
    const filteredArticles = filterRecentArticles(articles, recentDays);
    log('info', `${account.nickname}: 近 ${recentDays} 天文章 ${filteredArticles.length} 条`);
    
    // 丰富文章内容
    const enrichedArticles = [];
    const fetchDelay = config.collection?.articleFetchDelay || { minDelay: 250, maxDelay: 600 };

    for (let i = 0; i < filteredArticles.length; i++) {
      const article = filteredArticles[i];
      const articleUrl = article.link?.startsWith('http') 
        ? article.link 
        : `https://mp.weixin.qq.com${article.link?.startsWith('/') ? article.link : '/' + article.link}`;
      
      log('info', `  [${i + 1}/${filteredArticles.length}] 获取正文: ${article.title || '无标题'}`);
      
      const { content, snippet } = await fetchArticleContent(articleUrl);

      enrichedArticles.push({
        id: `wechat_${account.fakeid}_${article.aid || Date.now()}_${i}`,
        title: article.title || '',
        summary: article.digest || snippet || '',
        content: content,
        url: articleUrl,
        source: 'WeChat-MP',
        accountName: account.nickname,
        publishTime: article.update_time
          ? new Date(article.update_time * 1000).toISOString()
          : (article.create_time ? new Date(article.create_time * 1000).toISOString() : new Date().toISOString()),
        metadata: {
          fakeid: account.fakeid,
          aid: article.aid,
          appmsgid: article.appmsgid,
          cover: article.cover,
          author: article.author_name,
          likes: article.like_count,
          comments: article.comment_count
        }
      });

      // 请求间隔
      if (i < filteredArticles.length - 1) {
        await delay(getRandomDelay(fetchDelay.minDelay, fetchDelay.maxDelay));
      }
    }
    
    log('success', `${account.nickname}: 成功采集 ${enrichedArticles.length} 条文章`);
    return enrichedArticles;
    
  } catch (error) {
    log('error', `${account.nickname} 采集失败: ${error.message}`);
    return [];
  }
}

/**
 * 主函数
 * @param {number} recentDays - 采集天数，默认为1天
 */
async function main(recentDays = 1) {
  console.log('\n======================================');
  console.log('📰 微信公众号文章采集器');
  console.log('======================================\n');

  try {
    // 加载配置
    const config = loadConfig();

    // 验证天数参数
    if (recentDays <= 0) {
      throw new Error('采集天数必须大于0');
    }

    log('info', `⚠️  重要提示：本次采集范围为近 ${recentDays} 天，将过滤旧数据`);

    // 验证配置
    if (!config.wechat?.token || !config.wechat?.cookie) {
      throw new Error('请在 config/config.json 中配置 wechat.token 和 wechat.cookie');
    }

    if (!config.accounts || config.accounts.length === 0) {
      throw new Error('请在 config/config.json 中配置要采集的公众号账号列表');
    }

    log('info', `配置加载成功，共 ${config.accounts.length} 个公众号`);
    log('info', `采集范围: 近 ${recentDays} 天`);

    // 采集所有账号的文章
    const allArticles = [];
    const rateLimit = config.collection?.rateLimit || { minDelay: 3000, maxDelay: 5000 };

    for (let i = 0; i < config.accounts.length; i++) {
      const account = config.accounts[i];
      const articles = await collectAccount(account, config, recentDays);
      allArticles.push(...articles);
      
      // 账号间请求间隔
      if (i < config.accounts.length - 1) {
        const delayMs = getRandomDelay(rateLimit.minDelay, rateLimit.maxDelay);
        log('info', `等待 ${delayMs}ms 后继续...`);
        await delay(delayMs);
      }
    }
    
    // 保存结果（按日期归档）
    const baseOutputDir = path.resolve('./skills/wechat-mp-analyzer/output');
    const outputDir = getOutputDir(baseOutputDir);
    const outputPath = path.join(outputDir, 'articles.json');

    // 删除当天旧的输出文件（如果存在）
    const filesToDelete = [
      path.join(outputDir, 'articles.json'),
      path.join(outputDir, 'analysis-results.json'),
      path.join(outputDir, 'articles.md')
    ];
    filesToDelete.forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        log('info', `删除旧文件: ${path.basename(file)}`);
      }
    });

    // 删除根目录的无用文件
    const baseFilesToDelete = [
      path.join(baseOutputDir, 'latest.json'),
      path.join(baseOutputDir, 'latest.md'),
      path.join(baseOutputDir, 'latest-analysis.json')
    ];
    baseFilesToDelete.forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        log('info', `删除无用文件: ${path.basename(file)}`);
      }
    });

    // 保存新数据
    fs.writeFileSync(outputPath, JSON.stringify(allArticles, null, 2), 'utf-8');
    
    console.log('\n======================================');
    log('success', `采集完成！共 ${allArticles.length} 条文章`);
    log('info', `数据已保存到: ${outputPath}`);
    console.log('======================================\n');
    
    return allArticles;
    
  } catch (error) {
    log('error', `执行失败: ${error.message}`);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  // 从命令行参数获取天数，例如：node fetch-articles.js 7
  const daysArg = process.argv[2];
  const days = daysArg && !isNaN(parseInt(daysArg)) ? parseInt(daysArg) : 1;
  main(days);
}

export { main as fetchArticles };
