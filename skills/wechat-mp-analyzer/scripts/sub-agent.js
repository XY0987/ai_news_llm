#!/usr/bin/env node

/**
 * 子 Agent 分析模块
 * 提供多种分析策略，支持直接调用编辑器 AI 能力
 * 
 * 使用方式:
 * 1. 作为模块导入使用
 * 2. 命令行方式: node sub-agent.js --article="文章文件路径"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 分析结果模板
 */
const AnalysisSchema = {
  overallScore: 0,           // 综合评分 1-10
  dimensionScores: {         // 各维度评分
    contentQuality: { score: 0, reason: '' },
    practicalValue: { score: 0, reason: '' },
    timeliness: { score: 0, reason: '' },
    readability: { score: 0, reason: '' },
    relevance: { score: 0, reason: '' }
  },
  summary: '',               // 内容摘要
  keyPoints: [],             // 核心观点
  userAdvice: {              // 用户建议
    shouldRead: true,
    priority: 'medium',      // high/medium/low
    reason: '',
    actionItems: []
  },
  tags: []                   // 标签
};

/**
 * 构建分析提示词
 * @param {Object} article - 文章数据
 * @param {Object} userProfile - 用户画像
 * @returns {string} 提示词
 */
export function buildPrompt(article, userProfile) {
  const content = article.content || article.summary || '';
  const maxLength = 8000;
  const truncatedContent = content.length > maxLength 
    ? content.slice(0, maxLength) + '\n...（内容已截断）'
    : content;

  return `你是一位专业的内容分析师，请对以下文章进行全面分析和评分。

## 目标读者画像
- 职业角色: ${userProfile.role || '技术人员'}
- 专业水平: ${userProfile.level || '中级'}
- 关注领域: ${(userProfile.interests || []).join(', ')}
- 特别关注点: ${(userProfile.focusAreas || []).join(', ')}

## 待分析文章
**标题**: ${article.title}
**来源**: ${article.accountName || '微信公众号'}
**发布时间**: ${article.publishTime}
**原文链接**: ${article.url}

### 正文内容
\`\`\`
${truncatedContent}
\`\`\`

## 分析任务

请从以下5个维度对文章进行评分（1-10分），每个维度都需要给出评分理由：

### 评分维度说明

1. **内容质量 (contentQuality)**
   - 评分标准: 信息准确性、内容深度、观点原创性、论据充分性
   - 高分特征: 独家观点、深度调研、数据支撑、逻辑严密

2. **实用价值 (practicalValue)**
   - 评分标准: 可落地的建议、方法论、工具资源、案例参考
   - 高分特征: 可直接应用、步骤清晰、有实际案例

3. **时效性 (timeliness)**
   - 评分标准: 内容新鲜度、与当前趋势的相关性、紧急程度
   - 高分特征: 最新动态、热点话题、紧迫性强

4. **可读性 (readability)**
   - 评分标准: 文章结构、语言表达、逻辑清晰度、排版美观
   - 高分特征: 层次分明、语言流畅、易于理解

5. **匹配度 (relevance)**
   - 评分标准: 与目标读者职业、关注领域的契合程度
   - 高分特征: 高度相关、对职业发展有直接帮助

## 输出格式要求

必须以**纯 JSON 格式**输出，不要包含 markdown 代码块标记或其他说明文字：

{
  "overallScore": 8.5,
  "dimensionScores": {
    "contentQuality": { 
      "score": 8, 
      "reason": "内容详实，观点有一定深度，但部分论据可以更充分" 
    },
    "practicalValue": { 
      "score": 9, 
      "reason": "提供了可直接应用的方法论和具体步骤" 
    },
    "timeliness": { 
      "score": 8, 
      "reason": "紧跟当前技术趋势，内容较新" 
    },
    "readability": { 
      "score": 9, 
      "reason": "结构清晰，语言流畅，易于理解" 
    },
    "relevance": { 
      "score": 8, 
      "reason": "与目标读者角色高度相关，对工作有直接帮助" 
    }
  },
  "summary": "文章总体评价：这是一篇质量较高的技术文章，内容详实且实用...",
  "keyPoints": [
    "核心观点1：简要描述",
    "核心观点2：简要描述",
    "核心观点3：简要描述"
  ],
  "userAdvice": {
    "shouldRead": true,
    "priority": "high",
    "reason": "文章内容与你的职业发展方向高度契合，其中提到的方法可以直接应用到当前项目中",
    "actionItems": [
      "建议细读文章中关于XXX的部分",
      "可以尝试将文中的方法应用到实际工作中",
      "关注文中提到的相关工具/技术"
    ]
  },
  "tags": ["技术", "前端", "AI", "最佳实践"]
}

## 评分参考标准

- 9-10分: 必读精品，内容优质且极具价值
- 8-9分: 推荐阅读，质量优秀
- 7-8分: 值得一读，有一定价值
- 6-7分: 可以参考，价值一般
- 6分以下: 不推荐，质量较差

请严格按照以上要求进行分析和评分。`;
}

/**
 * 解析分析结果
 * @param {string} response - AI 返回的响应
 * @returns {Object} 解析后的分析结果
 */
export function parseResponse(response) {
  try {
    // 如果已经是对象，直接返回
    if (typeof response === 'object' && response !== null) {
      return validateAndFill(response);
    }

    // 尝试提取 JSON 部分
    let jsonStr = response;
    
    // 去除 markdown 代码块标记
    const codeBlockMatch = response.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }
    
    // 尝试找到 JSON 对象
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const parsed = JSON.parse(jsonStr);
    return validateAndFill(parsed);
  } catch (error) {
    console.error('解析分析结果失败:', error.message);
    return generateFallbackAnalysis();
  }
}

/**
 * 验证并填充默认值
 * @param {Object} data - 解析的数据
 * @returns {Object} 验证后的数据
 */
function validateAndFill(data) {
  const result = { ...AnalysisSchema };
  
  if (data.overallScore !== undefined) {
    result.overallScore = Math.max(1, Math.min(10, parseFloat(data.overallScore) || 5));
  }
  
  if (data.dimensionScores) {
    const dimensions = ['contentQuality', 'practicalValue', 'timeliness', 'readability', 'relevance'];
    dimensions.forEach(dim => {
      if (data.dimensionScores[dim]) {
        result.dimensionScores[dim] = {
          score: Math.max(1, Math.min(10, parseInt(data.dimensionScores[dim].score) || 5)),
          reason: data.dimensionScores[dim].reason || '无评分说明'
        };
      }
    });
  }
  
  result.summary = data.summary || '暂无摘要';
  result.keyPoints = Array.isArray(data.keyPoints) ? data.keyPoints : [];
  
  if (data.userAdvice) {
    result.userAdvice = {
      shouldRead: data.userAdvice.shouldRead !== false,
      priority: ['high', 'medium', 'low'].includes(data.userAdvice.priority) 
        ? data.userAdvice.priority 
        : 'medium',
      reason: data.userAdvice.reason || '',
      actionItems: Array.isArray(data.userAdvice.actionItems) 
        ? data.userAdvice.actionItems 
        : []
    };
  }
  
  result.tags = Array.isArray(data.tags) ? data.tags : [];
  
  return result;
}

/**
 * 生成降级分析结果
 * @returns {Object} 默认分析结果
 */
function generateFallbackAnalysis() {
  return {
    overallScore: 5,
    dimensionScores: {
      contentQuality: { score: 5, reason: '解析失败，默认评分' },
      practicalValue: { score: 5, reason: '解析失败，默认评分' },
      timeliness: { score: 5, reason: '解析失败，默认评分' },
      readability: { score: 5, reason: '解析失败，默认评分' },
      relevance: { score: 5, reason: '解析失败，默认评分' }
    },
    summary: '分析结果解析失败',
    keyPoints: [],
    userAdvice: {
      shouldRead: false,
      priority: 'low',
      reason: '分析过程出现错误，建议人工判断',
      actionItems: []
    },
    tags: []
  };
}

/**
 * 分析单篇文章（通过子进程调用 AI）
 * @param {Object} article - 文章数据
 * @param {Object} userProfile - 用户画像
 * @returns {Promise<Object>} 分析结果
 */
export async function analyzeArticle(article, userProfile) {
  const prompt = buildPrompt(article, userProfile);
  
  // 这里可以实现多种分析策略：
  // 1. 调用本地 AI 服务
  // 2. 使用系统命令调用其他 AI 工具
  // 3. 写入文件等待外部处理
  // 4. 直接返回提示词供上层处理
  
  return {
    prompt,
    articleId: article.id,
    articleTitle: article.title
  };
}

/**
 * 批量分析文章
 * @param {Array} articles - 文章列表
 * @param {Object} userProfile - 用户画像
 * @param {Function} analyzerFn - 自定义分析函数
 * @returns {Promise<Array>} 分析结果列表
 */
export async function batchAnalyze(articles, userProfile, analyzerFn) {
  const results = [];
  
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`[${i + 1}/${articles.length}] 分析: ${article.title.slice(0, 40)}...`);
    
    try {
      const analysisData = await analyzeArticle(article, userProfile);
      
      // 如果提供了自定义分析函数，使用它
      if (analyzerFn) {
        const aiResponse = await analyzerFn(analysisData.prompt);
        const parsedAnalysis = parseResponse(aiResponse);
        
        results.push({
          articleId: article.id,
          articleTitle: article.title,
          accountName: article.accountName,
          url: article.url,
          publishTime: article.publishTime,
          analysis: parsedAnalysis,
          analyzedAt: new Date().toISOString()
        });
      } else {
        // 只返回提示词，由上层处理
        results.push(analysisData);
      }
    } catch (error) {
      console.error(`分析失败: ${article.title}`, error.message);
      results.push({
        articleId: article.id,
        articleTitle: article.title,
        error: error.message,
        analysis: generateFallbackAnalysis()
      });
    }
  }
  
  return results;
}

/**
 * 命令行模式
 */
async function main() {
  const args = process.argv.slice(2);
  const articlePath = args.find(arg => arg.startsWith('--article='))?.split('=')[1];
  const profilePath = args.find(arg => arg.startsWith('--profile='))?.split('=')[1];
  
  if (!articlePath) {
    console.log('用法: node sub-agent.js --article=文章文件路径 [--profile=用户画像路径]');
    process.exit(1);
  }
  
  try {
    const article = JSON.parse(fs.readFileSync(articlePath, 'utf-8'));
    
    let userProfile = {
      role: '技术人员',
      level: '中级',
      interests: ['技术'],
      focusAreas: ['新技术']
    };
    
    if (profilePath && fs.existsSync(profilePath)) {
      userProfile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    }
    
    const result = await analyzeArticle(article, userProfile);
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('执行失败:', error.message);
    process.exit(1);
  }
}

// 如果是直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default {
  buildPrompt,
  parseResponse,
  analyzeArticle,
  batchAnalyze,
  AnalysisSchema
};
