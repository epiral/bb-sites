# bb-sites

[bb-browser](https://github.com/epiral/bb-browser) 的社区网站适配器 — 把网站变成 CLI 命令。

每个适配器是一个 JS 函数，通过 `bb-browser eval` 在你的浏览器里运行。浏览器已经登录了 — 不需要 API key，不需要偷 Cookie，不需要反爬。

[English](README.md) · [中文](README.zh-CN.md)

> **102 个适配器**，覆盖 **36 个平台** — 持续增长中。

## 快速开始

```bash
bb-browser site update                     # 安装/更新适配器
bb-browser site list                       # 列出所有命令
bb-browser site reddit/me                  # 运行命令
bb-browser site reddit/thread <url>        # 带参数运行
```

## 适配器列表

### 🔍 搜索引擎

| 平台 | 命令 | 说明 |
|------|------|------|
| Google | `google/search` | Google 搜索 |
| 百度 | `baidu/search` | 百度搜索 |
| Bing | `bing/search` | Bing 搜索 |
| DuckDuckGo | `duckduckgo/search` | DuckDuckGo 搜索（HTML 轻量版） |
| 搜狗 | `sogou/weixin` | 搜狗微信文章搜索 |

### 📰 新闻资讯

| 平台 | 命令 | 说明 |
|------|------|------|
| BBC | `bbc/news` | BBC 新闻头条（RSS）或搜索 |
| 路透社 | `reuters/search` | 路透社新闻搜索 |
| 今日头条 | `toutiao/search`, `toutiao/hot` | 头条搜索、热榜 |
| 东方财富 | `eastmoney/news` | 财经热点新闻 |

### 💬 社交媒体

| 平台 | 命令 | 说明 |
|------|------|------|
| Twitter/X | `twitter/user`, `twitter/thread`, `twitter/search`, `twitter/tweets`, `twitter/notifications` | 用户资料、推文线程、搜索、时间线、通知 |
| Reddit | `reddit/me`, `reddit/posts`, `reddit/thread`, `reddit/context` | 用户信息、发帖、讨论树、评论链 |
| 微博 | `weibo/me`, `weibo/hot`, `weibo/feed`, `weibo/user`, `weibo/user_posts`, `weibo/post`, `weibo/comments` | 完整微博支持 — 资料、热搜、时间线、发帖、评论 |
| 微博 (手机版) | `m_weibo/me`, `m_weibo/hot`, `m_weibo/feed`, `m_weibo/search`, `m_weibo/user`, `m_weibo/user_posts`, `m_weibo/comments` | 移动端优化版 — 基于稳定的 JSON 接口 |
| 虎扑 | `hupu/hot` | 虎扑步行街热帖 |

### 💻 技术开发

| 平台 | 命令 | 说明 |
|------|------|------|
| GitHub | `github/me`, `github/repo`, `github/issues`, `github/issue-create`, `github/pr-create`, `github/fork` | 用户信息、仓库、Issue、PR、Fork |
| Hacker News | `hackernews/top`, `hackernews/thread` | 热门文章、帖子 + 评论树 |
| Stack Overflow | `stackoverflow/search` | 搜索问答 |
| CSDN | `csdn/search` | CSDN 技术文章搜索 |
| 博客园 | `cnblogs/search` | 博客园技术文章搜索 |
| npm | `npm/search` | 搜索 npm 包 |
| PyPI | `pypi/search`, `pypi/package` | 搜索 & 查看 Python 包详情 |
| arXiv | `arxiv/search` | 搜索学术论文 |
| Dev.to | `devto/search` | 搜索 Dev.to 文章 |
| V2EX | `v2ex/hot`, `v2ex/latest`, `v2ex/topic` | 最热/最新主题、主题详情 + 回复 |

### 🎬 影音娱乐

| 平台 | 命令 | 说明 |
|------|------|------|
| YouTube | `youtube/search`, `youtube/video`, `youtube/comments`, `youtube/channel`, `youtube/feed`, `youtube/transcript` | 搜索、视频详情、评论、频道、Feed、字幕文稿 |
| B站 | `bilibili/me`, `bilibili/popular`, `bilibili/ranking`, `bilibili/search`, `bilibili/video`, `bilibili/comments`, `bilibili/feed`, `bilibili/history`, `bilibili/trending` | 完整 B站 支持 — 9 个适配器 |
| IMDb | `imdb/search` | IMDb 电影搜索 |
| Genius | `genius/search` | 歌曲/歌词搜索 |
| 豆瓣 | `douban/search`, `douban/movie`, `douban/movie-hot`, `douban/movie-top`, `douban/top250`, `douban/comments` | 豆瓣电影 — 搜索、详情、排行、Top 250、短评 |
| 起点中文网 | `qidian/search` | 小说搜索 |

### 💼 求职招聘

| 平台 | 命令 | 说明 |
|------|------|------|
| BOSS直聘 | `boss/search`, `boss/detail` | 搜索职位、查看 JD 详情 |
| LinkedIn | `linkedin/profile`, `linkedin/search` | 用户 Profile、帖子搜索 |

### 💰 财经股票

| 平台 | 命令 | 说明 |
|------|------|------|
| 东方财富 | `eastmoney/stock`, `eastmoney/news` | 股票实时行情、财经新闻 |
| Yahoo Finance | `yahoo-finance/quote` | 美股行情（AAPL, TSLA 等） |

### 📱 数码科技

| 平台 | 命令 | 说明 |
|------|------|------|
| GSMArena | `gsmarena/search` | 手机参数搜索 |
| Product Hunt | `producthunt/today` | 今日热门产品 |

### 📚 知识百科

| 平台 | 命令 | 说明 |
|------|------|------|
| 维基百科 | `wikipedia/search`, `wikipedia/summary` | 搜索、页面摘要 |
| 知乎 | `zhihu/me`, `zhihu/hot`, `zhihu/question`, `zhihu/search` | 用户信息、热榜、问答、搜索 |
| Open Library | `openlibrary/search` | 图书搜索 |

### 🌐 生活服务

| 平台 | 命令 | 说明 |
|------|------|------|
| 有道翻译 | `youdao/translate` | 翻译/词典查询 |
| 携程 | `ctrip/search` | 目的地景点搜索 |

### 🗨️ 即时通讯

| 平台 | 命令 | 说明 |
|------|------|------|
| 即刻 | `jike/feed`, `jike/search` | 推荐 Feed、搜索动态 |
| 小红书 | `xiaohongshu/me`, `xiaohongshu/feed`, `xiaohongshu/search`, `xiaohongshu/note`, `xiaohongshu/comments`, `xiaohongshu/user_posts` | 完整小红书支持，基于 Pinia Store Actions |

> 所有小红书适配器使用 **Pinia Store Actions** — 调用页面自己的 Vue store 函数，走完整的签名 + 拦截器链路。零逆向。

## 使用示例

```bash
# 搜索
bb-browser site google/search "bb-browser"
bb-browser site duckduckgo/search "Claude Code"

# 社交媒体
bb-browser site twitter/search "claude code"
bb-browser site twitter/tweets plantegg
bb-browser site reddit/thread https://reddit.com/r/programming/comments/...
bb-browser site weibo/hot

# 技术调研
bb-browser site github/repo epiral/bb-browser
bb-browser site hackernews/top 10
bb-browser site stackoverflow/search "python async await"
bb-browser site arxiv/search "large language model"
bb-browser site npm/search "react state management"

# 影音娱乐
bb-browser site youtube/transcript dQw4w9WgXcQ
bb-browser site bilibili/search 编程
bb-browser site douban/top250

# 财经股票
bb-browser site yahoo-finance/quote AAPL
bb-browser site eastmoney/stock 贵州茅台

# 求职
bb-browser site boss/search "AI agent"
bb-browser site linkedin/search "AI agent"

# 翻译
bb-browser site youdao/translate hello
```

## 开发适配器

运行 `bb-browser guide` 查看完整开发流程，或阅读 [SKILL.md](SKILL.md)。

```javascript
/* @meta
{
  "name": "platform/command",
  "description": "这个适配器做什么",
  "domain": "www.example.com",
  "args": {
    "query": {"required": true, "description": "搜索关键词"}
  },
  "readOnly": true,
  "example": "bb-browser site platform/command value1"
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query'};
  const resp = await fetch('/api/search?q=' + encodeURIComponent(args.query), {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Not logged in?'};
  return await resp.json();
}
```

## 贡献

```bash
# 方式 A：使用 gh CLI
gh repo fork epiral/bb-sites --clone
cd bb-sites && git checkout -b feat-mysite
# 添加适配器文件
git push -u origin feat-mysite
gh pr create

# 方式 B：使用 bb-browser（不需要 gh）
bb-browser site github/fork epiral/bb-sites
git clone https://github.com/你的用户名/bb-sites && cd bb-sites
git checkout -b feat-mysite
# 添加适配器文件
git push -u origin feat-mysite
bb-browser site github/pr-create epiral/bb-sites --title "feat(mysite): 添加适配器" --head "你的用户名:feat-mysite"
```

## 私有适配器

私有适配器放在 `~/.bb-browser/sites/`，同名时优先于社区适配器。

```
~/.bb-browser/
├── sites/          # 私有适配器（优先）
│   └── internal/
│       └── deploy.js
└── bb-sites/       # 本仓库（bb-browser site update）
    ├── reddit/
    ├── twitter/
    ├── github/
    ├── youtube/
    ├── bilibili/
    ├── zhihu/
    ├── weibo/
    ├── douban/
    ├── xiaohongshu/
    ├── google/
    ├── ...          # 35 个平台目录
    └── qidian/
```
