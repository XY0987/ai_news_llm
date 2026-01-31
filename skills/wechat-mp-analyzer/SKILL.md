---
name: wechat-mp-analyzer
description: 微信公众号资讯分析器。采集公众号文章，使用编辑器 AI 能力分析评分，生成个性化阅读报告。
---

# 微信公众号资讯分析器

## 触发词

- "分析公众号文章"
- "筛选今天的技术文章"
- "采集微信文章并评分"

## 完整工作流程

### 步骤 1：采集文章

```bash
node skills/wechat-mp-analyzer/scripts/fetch-articles.js 1
```

> 参数说明：1 = 今天，7 = 近7天

### 步骤 2：准备分析任务

```bash
node skills/wechat-mp-analyzer/scripts/batch-analyze.js
```

### 步骤 3：分析文章（核心步骤）

**必须使用分批分析方式，每批 3-5 篇，分析后立即保存。**

#### 3.1 获取待分析文章

```bash
node skills/wechat-mp-analyzer/scripts/analyze-helper.js next 3
```

此命令会输出：
1. 当前进度（已分析/总数）
2. 待分析文章的**完整提示词**
3. 每篇文章的 **articleId**

#### 3.2 AI 分析文章

AI 直接阅读提示词中的文章内容，按以下维度评分（1-10分）：

| 维度 | 说明 |
|------|------|
| contentQuality | 内容质量：准确性、深度、原创性 |
| practicalValue | 实用价值：对工作的实际帮助 |
| timeliness | 时效性：内容新鲜度 |
| readability | 可读性：结构、语言、逻辑 |
| relevance | 匹配度：与用户身份契合度 |

#### 3.3 输出分析结果

**每篇文章**必须输出以下 JSON：

```json
{
  "articleId": "从提示词复制文章ID",
  "overallScore": 8.5,
  "dimensionScores": {
    "contentQuality": { "score": 8, "reason": "内容详实，有深度" },
    "practicalValue": { "score": 9, "reason": "可直接应用到工作中" },
    "timeliness": { "score": 8, "reason": "紧跟当前趋势" },
    "readability": { "score": 9, "reason": "结构清晰易懂" },
    "relevance": { "score": 8, "reason": "与目标读者高度相关" }
  },
  "summary": "100字以内的文章摘要",
  "keyPoints": ["核心观点1", "核心观点2", "核心观点3"],
  "userAdvice": {
    "shouldRead": true,
    "priority": "high",
    "reason": "推荐理由",
    "actionItems": ["建议行动1", "建议行动2"]
  },
  "tags": ["标签1", "标签2"]
}
```

#### 3.4 保存分析结果

```bash
node skills/wechat-mp-analyzer/scripts/analyze-helper.js save '{"articleId":"xxx",...}'
```

**对每篇分析完的文章，立即执行保存命令。**

#### 3.5 检查进度并继续

```bash
node skills/wechat-mp-analyzer/scripts/analyze-helper.js status
```

如果还有待分析文章，重复 3.1 - 3.4 步骤，直到所有文章分析完成。

### 步骤 4：生成报告

```bash
node skills/wechat-mp-analyzer/scripts/generate-report.js
```

---

## 关键约束（必须遵守）

| 要求 | 说明 |
|------|------|
| ✅ 分批处理 | 每次只处理 3-5 篇，避免上下文过长 |
| ✅ 立即保存 | 每篇文章分析完立即保存，防止丢失 |
| ✅ 全部分析 | 必须分析所有文章，不能跳过 |
| ✅ 使用编辑器 AI | 直接使用编辑器的 AI 能力分析 |
| ❌ 禁止创建脚本 | 不允许创建任何脚本自动化分析 |
| ❌ 禁止调用 API | 不使用外部 LLM API |
| ❌ 禁止偷懒 | 不能只分析部分文章就声称完成 |

---

## 评分标准

- **9-10分**：必读精品
- **8-9分**：推荐阅读
- **7-8分**：值得一读
- **6-7分**：可以参考
- **<6分**：不推荐

---

## 故障恢复

### 分析中断后继续

```bash
# 查看进度
node skills/wechat-mp-analyzer/scripts/analyze-helper.js status

# 继续分析（已保存的不会重复）
node skills/wechat-mp-analyzer/scripts/analyze-helper.js next 3
```

### 重新分析所有文章

```bash
node skills/wechat-mp-analyzer/scripts/incremental-analyzer.js reset
```

---

## 示例：完整执行流程

用户说："帮我分析今天的公众号文章"

**AI 执行：**

```bash
# 1. 采集
node skills/wechat-mp-analyzer/scripts/fetch-articles.js 1

# 2. 准备任务
node skills/wechat-mp-analyzer/scripts/batch-analyze.js

# 3. 分析循环（重复直到完成）
node skills/wechat-mp-analyzer/scripts/analyze-helper.js next 3
# → AI 阅读文章内容，输出 JSON 分析结果
# → 执行 save 命令保存每篇文章的结果
# → 检查 status，如有剩余继续分析

# 4. 生成报告
node skills/wechat-mp-analyzer/scripts/generate-report.js
```

---

## 文件结构

```
output/YYYYMMDD/
├── articles.json         # 采集的文章
├── analysis-tasks.json   # 分析任务（含提示词）
├── analysis-results.json # 分析结果（增量保存）
└── articles.md           # 最终报告
```
