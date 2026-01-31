# 配置指南

## 配置文件位置

配置文件位于 `config/config.json`

## 配置项说明

### wechat 配置

微信公众号后台 API 凭证：

```json
{
  "wechat": {
    "token": "你的token",
    "cookie": "你的cookie",
    "apiUrl": "https://mp.weixin.qq.com/cgi-bin/appmsgpublish"
  }
}
```

**获取方式：**
1. 登录 https://mp.weixin.qq.com
2. 打开浏览器开发者工具 (F12)
3. 找到任意请求，从请求头复制 Cookie
4. 从 URL 参数复制 token

### accounts 配置

要采集的公众号列表：

```json
{
  "accounts": [
    { "fakeid": "MzI3NTQ0MDAxOA==", "nickname": "阿枫科技" },
    { "fakeid": "Mzg5MTkxNjQwMw==", "nickname": "AI产品汇" }
  ]
}
```

### userProfile 配置

用户画像，用于生成个性化建议：

```json
{
  "userProfile": {
    "role": "前端工程师",
    "interests": ["AI技术", "前端工程化"],
    "level": "高级",
    "focusAreas": ["新技术趋势", "实践案例"]
  }
}
```

配置项说明：
- `role` - 职业角色
- `interests` - 感兴趣的领域数组
- `level` - 专业水平（初级/中级/高级/专家）
- `focusAreas` - 特别关注的方面

### collection 配置

采集参数：

```json
{
  "collection": {
    "maxArticlesPerAccount": 10,
    "rateLimit": { "minDelay": 3000, "maxDelay": 5000 }
  }
}
```

**注意：** `recentDays` 已从配置中移除，采集天数现在通过命令行参数指定：
- `node index.js 1` - 采集今天（1天）的文章
- `node index.js 7` - 采集近7天的文章

### analysis 配置

分析参数：

```json
{
  "analysis": {
    "minScore": 6,
    "batchSize": 5,
    "maxContentLength": 8000
  }
}
```
