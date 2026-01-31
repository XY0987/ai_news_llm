---
name: wechat-mp-analyzer
description: |
  微信公众号资讯分析器 Skill。当用户需要采集微信公众号文章，并使用子Agent进行AI分析、
  生成个性化阅读推荐报告时使用此Skill。
---

# 微信公众号资讯分析器

## 使用场景

- "分析我关注的公众号文章"
- "帮我筛选今天的技术文章"
- "使用子Agent分析文章并生成报告"
- "采集微信文章并评分"

## 工作流程

### 步骤 1: 采集文章

```bash
# 采集今天（1天）的文章
node skills/wechat-mp-analyzer/scripts/fetch-articles.js 1

# 采集近7天的文章
node skills/wechat-mp-analyzer/scripts/fetch-articles.js 7
```

采集指定天数内的文章，保存到 `output/YYYYMMDD/articles.json`（按日期归档）。

**注意**：
- 天数必须通过命令行参数指定，不从配置文件读取
- 输出文件按日期归档到 `output/YYYYMMDD/` 目录
- 当天重复运行时，会自动删除当天旧数据后重新采集

### 步骤 2: 批量分析所有文章

**重要：确保所有文章都被分析打分**

分析流程：

1. **运行批量分析准备脚本**：
   ```bash
   node skills/wechat-mp-analyzer/scripts/batch-analyze.js
   ```

2. 此脚本会：
   - 读取 `output/YYYYMMDD/articles.json` 中的所有文章
   - 为每篇文章生成分析提示词
   - 将任务保存到 `output/YYYYMMDD/analysis-tasks.json`

3. **使用 AI 分析所有文章**：
   - AI 读取 `analysis-tasks.json` 文件
   - **必须遍历所有任务**，使用工具创建子Agent逐个分析，不得创建额外脚本分析，严格按照此流程执行
   - 对每个任务返回的 JSON 使用 `parseResponse` 解析
   - 将所有分析结果汇总，保存到 `output/YYYYMMDD/analysis-results.json`

**关键要求**：
- ✅ **必须分析所有文章**，不能只分析部分文章
- ✅ 使用 工具创建子Agent进行分析
- ✅ 使用 `sub-agent.js` 的 `parseResponse` 函数解析返回结果
- ✅ 确保结果文件包含所有文章的分析数据
- ✅ 不允许创建任何脚本分析文章，严格使用工具创建子Agent分析

**子Agent分析提示词：**

```
你是一位专业的内容分析师，请对以下文章进行全面分析和评分。

## 目标读者画像
- 职业角色: {role}
- 专业水平: {level}
- 关注领域: {interests}
- 特别关注点: {focusAreas}

## 待分析文章
标题: {articleTitle}
来源: {accountName}
发布时间: {publishTime}

正文内容:
{content}

## 评分维度（1-10分）

1. contentQuality - 内容质量：准确性、深度、原创性
2. practicalValue - 实用价值：对工作的实际帮助
3. timeliness - 时效性：内容新鲜度
4. readability - 可读性：结构、语言、逻辑
5. relevance - 匹配度：与用户身份契合度

## 输出格式（严格JSON）
{
  "overallScore": 8.5,
  "dimensionScores": {
    "contentQuality": { "score": 8, "reason": "评价理由" },
    "practicalValue": { "score": 9, "reason": "评价理由" },
    "timeliness": { "score": 8, "reason": "评价理由" },
    "readability": { "score": 9, "reason": "评价理由" },
    "relevance": { "score": 8, "reason": "评价理由" }
  },
  "summary": "文章摘要（100字内）",
  "keyPoints": ["核心观点1", "核心观点2", "核心观点3"],
  "userAdvice": {
    "shouldRead": true,
    "priority": "high/medium/low",
    "reason": "为什么推荐/不推荐",
    "actionItems": ["建议行动1", "建议行动2"]
  },
  "tags": ["标签1", "标签2"]
}

评分标准：
- 9-10分: 必读精品
- 8-9分: 推荐阅读
- 7-8分: 值得一读
- 6-7分: 可以参考
- <6分: 不推荐
```

### 步骤 3: 生成报告

```bash
node skills/wechat-mp-analyzer/scripts/generate-report.js
```

报告特点：
- 包含所有文章（高分和低分）
- 低分文章（< 6分）默认折叠，可展开查看
- 低分文章显示不推荐理由（得分低的维度）
- 输出文件按日期归档：`YYYYMMDD/articles.md`

## 报告格式

### 高分文章（≥6分）
完整展示，包含：
- 基本信息（标题、来源、链接）
- 五维度评分表
- 内容摘要
- 核心观点
- 个性化阅读建议
- 行动建议

### 低分文章（<6分）
默认折叠，包含：
- 表格汇总（序号、标题、公众号、评分、不推荐理由）
- 详细说明各维度评分及原因
- 解释为什么不推荐阅读

## 配置文件

`config/config.json`：

```json
{
  "wechat": {
    "token": "微信token",
    "cookie": "微信cookie"
  },
  "accounts": [
    { "fakeid": "xxx", "nickname": "公众号名" }
  ],
  "userProfile": {
    "role": "前端工程师",
    "interests": ["AI技术", "前端工程化"],
    "level": "高级",
    "focusAreas": ["新技术趋势", "实践案例"]
  },
  "analysis": {
    "minScore": 6
  }
}
```

## 文件说明

### 脚本

| 文件 | 作用 |
|------|------|
| `scripts/fetch-articles.js` | 采集文章（Node脚本） |
| `scripts/sub-agent.js` | 分析提示词生成器 |
| `scripts/generate-report.js` | 报告生成（含低分文章折叠） |

### 输出文件（按日期归档）

输出文件按 `YYYYMMDD` 格式归档，例如 `20260131/`：

| 文件 | 说明 |
|------|------|
| `output/YYYYMMDD/articles.json` | 采集的文章数据 |
| `output/YYYYMMDD/analysis-results.json` | 子Agent分析结果（所有文章） |
| `output/YYYYMMDD/articles.md` | Markdown阅读报告 |

## 使用示例

### 方式1：完整流程

用户说："帮我分析今天的公众号文章"

AI执行：
```bash
# 第1步：采集文章
node skills/wechat-mp-analyzer/scripts/fetch-articles.js 1

# 第2步：准备分析任务
node skills/wechat-mp-analyzer/scripts/batch-analyze.js

# 第3步：AI 使用工具分析所有文章
# AI 读取 output/YYYYMMDD/analysis-tasks.json
# AI 遍历所有任务，使用工具创建子 Agent 分析
# AI 使用 parseResponse 解析每个任务的结果
# AI 将所有分析结果保存到 output/YYYYMMDD/analysis-results.json
# ⚠️ 重要：必须分析所有文章，不能遗漏

# 第4步：生成报告
node skills/wechat-mp-analyzer/scripts/generate-report.js
```

**输出文件结构**：
```
skills/wechat-mp-analyzer/output/
├── 20260131/              # 按日期归档（YYYYMMDD）
│   ├── articles.json        # 采集的文章
│   ├── analysis-tasks.json  # AI分析任务列表（由 batch-analyze.js 生成）
│   ├── analysis-results.json # AI分析结果（所有文章）
│   └── articles.md        # 生成的报告
```

**注意**：
- 当天重复运行时，会自动删除当天旧数据重新采集
- **必须使用 batch-analyze.js 准备任务**，然后由 AI 使用 task 工具分析
- **必须分析所有文章**，确保 `analysis-results.json` 中的 `analyzedCount` 等于 `totalArticles`
- AI 需要导入 `sub-agent.js` 使用 `parseResponse` 函数解析返回结果
- 报告必须包含低分文章并默认折叠
- 低分文章需要说明具体的不推荐理由
- 关注公众号完全按照配置来
- **采集天数必须根据用户说明指定**：用户说"今天"就传1，"近7天"就传7
- **已删除**：`latest.json`、`latest.md`、`latest-analysis.json` 这些无用文件
- 不允许创建任何脚本分析文章，严格使用工具创建子Agent分析
- 不允许创建任何脚本分析文章，严格使用工具创建子Agent分析
- 不允许创建任何脚本分析文章，严格使用工具创建子Agent分析
