/**
 * Prompt 构建器
 * 集中管理 LLM 提示词的构建逻辑
 */

/**
 * 构建系统提示词
 * @param {Object} filterConfig - 过滤配置
 * @returns {string}
 */
export function buildSystemPrompt(filterConfig) {
  const positiveExamples = formatExamples(
    filterConfig.positiveExamples,
    '正面样例'
  );

  const negativeExamples = formatExamples(
    filterConfig.negativeExamples,
    '反面样例'
  );

  return `你是一个面向程序员的新闻评分助手,根据用户提供的正反面样例,对新闻进行评分 (0-10分)。

## 目标用户画像
程序员,关注 AI 技术发展、编程工具、职业发展和行业动态。

## 评分标准

**高分新闻 (8-10分)**:
- AI 编程工具动态（Cursor、Claude Code、Copilot、Windsurf 等更新）
- AI 大模型重大发布（GPT-5、Claude 4、Gemini 3 等新版本）
- 程序员职业相关热点（大厂招聘/裁员、薪资趋势、技术岗位变化）
- 开发者工具/框架重大更新（React、Vue、Node.js 等主流技术）
- AI 行业重大事件（融资、收购、政策变化、技术突破）
- 对程序员有实际价值的信息（免费额度、新工具推荐、效率提升技巧）

**中等分数 (5-7分)**:
- AI 动态但非一线热点,关注度一般
- 开发工具小版本更新,功能改进有限
- 行业新闻但与程序员关联度一般
- 技术文章/教程类内容

**低分新闻 (0-4分)**:
- 与程序员/技术完全无关的内容
- 纯营销广告、软文推广
- 过于小众或专业领域外的技术（如生物AI、材料AI等）
- 重复/旧闻、无实质内容的水文

## 用户偏好

${positiveExamples}

${negativeExamples}

## 输出格式

严格以 JSON 格式返回评分结果:
{
  "score": 7.5,
  "reason": "简要说明评分理由 (50-100字)"
}`;
}

/**
 * 构建用户提示词
 * @param {NewsItem} newsItem - 新闻条目
 * @returns {string}
 */
export function buildUserPrompt(newsItem) {
  return `请对以下新闻进行评分:

**标题**: ${newsItem.title}

**摘要**: ${newsItem.summary}

请根据系统提示词中的评分标准和用户偏好进行评分。`;
}

/**
 * 格式化样例
 * @param {Array} examples - 样例数组
 * @param {string} label - 标签
 * @returns {string}
 */
function formatExamples(examples, label) {
  if (!examples || examples.length === 0) {
    return `### ${label}\n无`;
  }

  return examples
    .map((ex, i) => formatSingleExample(ex, `${label} ${i + 1}`))
    .join('\n');
}

/**
 * 格式化单个样例
 * @param {Object} example - 样例对象
 * @param {string} label - 标签
 * @returns {string}
 */
function formatSingleExample(example, label) {
  return `### ${label}
标题: ${example.title}
摘要: ${example.summary}
理由: ${example.reason || '符合/不符合用户偏好'}
`;
}

/**
 * 解析 LLM 响应
 * @param {Object} completion - OpenAI API 响应
 * @returns {Object} {score, reason, tokenUsage}
 * @throws {Error} 解析失败时抛出错误
 */
export function parseResponse(completion) {
  try {
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('响应内容为空');
    }

    // 解析 JSON
    const data = JSON.parse(content);

    // 验证必需字段
    if (typeof data.score !== 'number') {
      throw new Error('score 字段缺失或类型错误');
    }

    if (!data.reason || typeof data.reason !== 'string') {
      throw new Error('reason 字段缺失或类型错误');
    }

    // 提取 token 使用信息
    const usage = completion.usage || {};
    const tokenUsage = {
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      cacheHitTokens: usage.prompt_cache_hit_tokens || 0
    };

    // 限制评分范围
    const score = Math.max(0, Math.min(10, data.score));

    return {
      score,
      reason: data.reason.trim(),
      tokenUsage
    };
  } catch (error) {
    throw new Error(`解析 LLM 响应失败: ${error.message}`);
  }
}
