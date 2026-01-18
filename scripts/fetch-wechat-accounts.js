#!/usr/bin/env node

/**
 * 微信公众号信息批量获取工具
 * 读取关注列表，通过微信接口获取 fakeid 等信息，写入配置文件
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// 配置文件路径
const INPUT_FILE = path.join(ROOT_DIR, 'weixin_follow_name.json');
const OUTPUT_FILE = path.join(ROOT_DIR, 'config/wechat-accounts.json');
const TOKEN_FILE = path.join(ROOT_DIR, '.wechat-token.json');

// 微信搜索接口
const SEARCH_API = 'https://mp.weixin.qq.com/cgi-bin/searchbiz';

// 请求间隔（毫秒），避免触发限流
const REQUEST_DELAY = 1500;

/**
 * 延迟函数
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 读取 token 信息
 */
function loadToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error(`Token 文件不存在: ${TOKEN_FILE}\n请先运行采集器登录微信公众号后台`);
  }

  const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));

  if (!tokenData.token || !tokenData.cookie) {
    throw new Error('Token 文件格式错误，缺少 token 或 cookie');
  }

  // 检查 token 是否过期
  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    throw new Error('Token 已过期，请重新登录微信公众号后台');
  }

  return tokenData;
}

/**
 * 读取关注列表
 */
function loadFollowList() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`关注列表文件不存在: ${INPUT_FILE}\n请创建该文件并填入公众号名称列表`);
  }

  const content = fs.readFileSync(INPUT_FILE, 'utf-8');
  const list = JSON.parse(content);

  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('关注列表为空或格式错误，应为字符串数组');
  }

  return list;
}

/**
 * 读取现有配置
 */
function loadExistingAccounts() {
  if (!fs.existsSync(OUTPUT_FILE)) {
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * 搜索公众号信息
 * @param {string} nickname - 公众号名称
 * @param {Object} tokenData - token 信息
 */
async function searchAccount(nickname, tokenData) {
  const params = {
    action: 'search_biz',
    begin: 0,
    count: 10,
    query: nickname,
    token: tokenData.token,
    lang: 'zh_CN',
    f: 'json',
    ajax: 1
  };

  const headers = {
    Cookie: tokenData.cookie,
    Referer: 'https://mp.weixin.qq.com/',
    Origin: 'https://mp.weixin.qq.com',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  };

  const response = await axios.get(SEARCH_API, {
    params,
    headers,
    timeout: 30000
  });

  return response.data;
}

/**
 * 从搜索结果中精确匹配公众号
 * @param {Object} response - 搜索响应
 * @param {string} targetName - 目标名称
 */
function findExactMatch(response, targetName) {
  if (response?.base_resp?.ret !== 0) {
    const errMsg = response?.base_resp?.err_msg || '未知错误';
    throw new Error(`接口返回错误: ${errMsg} (ret=${response?.base_resp?.ret})`);
  }

  const list = response.list || [];

  // 精确匹配 nickname
  const match = list.find(item => item.nickname === targetName);

  return match || null;
}

/**
 * 主流程
 */
async function main() {
  console.log('🚀 微信公众号信息批量获取工具\n');

  // 1. 加载 token
  console.log('📌 加载 Token...');
  const tokenData = loadToken();
  console.log('✅ Token 加载成功\n');

  // 2. 读取关注列表
  console.log('📌 读取关注列表...');
  const followList = loadFollowList();
  console.log(`✅ 共 ${followList.length} 个公众号待查询\n`);

  // 3. 读取现有配置
  const existingAccounts = loadExistingAccounts();
  const existingMap = new Map(existingAccounts.map(acc => [acc.nickname, acc]));

  // 4. 逐个查询
  const results = [];
  const failed = [];
  const skipped = [];

  for (let i = 0; i < followList.length; i++) {
    const nickname = followList[i];
    const label = `[${i + 1}/${followList.length}]`;

    // 检查是否已存在
    if (existingMap.has(nickname)) {
      console.log(`${label} ⏭️  ${nickname}: 已存在，跳过`);
      results.push(existingMap.get(nickname));
      skipped.push(nickname);
      continue;
    }

    try {
      console.log(`${label} 🔍 搜索: ${nickname}`);

      const response = await searchAccount(nickname, tokenData);
      const match = findExactMatch(response, nickname);

      if (match) {
        const accountInfo = {
          fakeid: match.fakeid,
          nickname: match.nickname
        };
        results.push(accountInfo);
        console.log(`${label} ✅ ${nickname}: fakeid=${match.fakeid}`);
      } else {
        failed.push({ nickname, reason: '未找到精确匹配' });
        console.log(`${label} ⚠️  ${nickname}: 未找到精确匹配的公众号`);
      }
    } catch (error) {
      failed.push({ nickname, reason: error.message });
      console.log(`${label} ❌ ${nickname}: ${error.message}`);

      // 如果是 token 过期，提前终止
      if (error.message.includes('ret=200003') || error.message.includes('Token')) {
        console.error('\n❌ Token 已过期，请重新登录后再试');
        break;
      }
    }

    // 请求间隔
    if (i < followList.length - 1) {
      await delay(REQUEST_DELAY);
    }
  }

  // 5. 写入结果
  console.log('\n📌 写入配置文件...');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`✅ 已写入 ${OUTPUT_FILE}\n`);

  // 6. 输出统计
  console.log('='.repeat(50));
  console.log('📊 统计结果:');
  console.log(`   成功: ${results.length - skipped.length} 个`);
  console.log(`   跳过: ${skipped.length} 个 (已存在)`);
  console.log(`   失败: ${failed.length} 个`);

  if (failed.length > 0) {
    console.log('\n⚠️  失败列表:');
    failed.forEach(item => {
      console.log(`   - ${item.nickname}: ${item.reason}`);
    });
  }

  console.log('\n✅ 完成!');
}

main().catch(error => {
  console.error('❌ 执行出错:', error.message);
  process.exit(1);
});
