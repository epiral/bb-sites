# bb-sites

Community site adapters for [bb-browser](https://github.com/epiral/bb-browser) — turning websites into CLI commands.

Each site adapter is a JS function that runs inside your browser via `bb-browser eval`. The browser is already logged in — no API keys, no cookie extraction, no anti-bot bypass.

[English](README.md) · [中文](README.zh-CN.md)

> **95 adapters** across **35 platforms** — and growing.

## Quick Start

```bash
bb-browser site update                     # install/update site adapters
bb-browser site list                       # list available commands
bb-browser site reddit/me                  # run a command
bb-browser site reddit/thread <url>        # run with args
```

## Available Adapters

### 🔍 Search Engines

| Platform | Command | Description |
|----------|---------|-------------|
| Google | `google/search` | Google search |
| Baidu | `baidu/search` | Baidu search |
| Bing | `bing/search` | Bing search |
| DuckDuckGo | `duckduckgo/search` | DuckDuckGo search (HTML lite) |
| Sogou | `sogou/weixin` | Sogou WeChat article search |

### 📰 News & Media

| Platform | Command | Description |
|----------|---------|-------------|
| BBC | `bbc/news` | BBC News headlines (RSS) or search |
| Reuters | `reuters/search` | Reuters news search |
| Toutiao | `toutiao/search`, `toutiao/hot` | Toutiao (今日头条) search & trending |
| Eastmoney | `eastmoney/news` | Eastmoney (东方财富) financial news |

### 💬 Social Media

| Platform | Commands | Description |
|----------|----------|-------------|
| Twitter/X | `twitter/user`, `twitter/thread`, `twitter/search`, `twitter/tweets`, `twitter/notifications` | User profile, tweet threads, search, timeline, notifications |
| Reddit | `reddit/me`, `reddit/posts`, `reddit/thread`, `reddit/context` | User info, posts, discussion trees, comment chains |
| Weibo | `weibo/me`, `weibo/hot`, `weibo/feed`, `weibo/user`, `weibo/user_posts`, `weibo/post`, `weibo/comments` | Full Weibo (微博) support — profile, trending, timeline, posts, comments |
| Hupu | `hupu/hot` | Hupu (虎扑) hot posts |

### 💻 Tech & Dev

| Platform | Commands | Description |
|----------|----------|-------------|
| GitHub | `github/me`, `github/repo`, `github/issues`, `github/issue-create`, `github/pr-create`, `github/fork` | User info, repos, issues, PRs, forks |
| Hacker News | `hackernews/top`, `hackernews/thread` | Top stories, post + comment tree |
| Stack Overflow | `stackoverflow/search` | Search questions |
| CSDN | `csdn/search` | CSDN tech article search |
| cnblogs | `cnblogs/search` | cnblogs (博客园) tech article search |
| npm | `npm/search` | Search npm packages |
| PyPI | `pypi/search`, `pypi/package` | Search & get Python package details |
| arXiv | `arxiv/search` | Search academic papers |
| Dev.to | `devto/search` | Search Dev.to articles |
| V2EX | `v2ex/hot`, `v2ex/latest`, `v2ex/topic` | Hot/latest topics, topic detail + replies |

### 🎬 Entertainment

| Platform | Commands | Description |
|----------|----------|-------------|
| YouTube | `youtube/search`, `youtube/video`, `youtube/comments`, `youtube/channel`, `youtube/feed`, `youtube/transcript` | Search, video details, comments, channels, feed, transcripts |
| Bilibili | `bilibili/me`, `bilibili/popular`, `bilibili/ranking`, `bilibili/search`, `bilibili/video`, `bilibili/comments`, `bilibili/feed`, `bilibili/history`, `bilibili/trending` | Full B站 support — 9 adapters |
| IMDb | `imdb/search` | IMDb movie search |
| Genius | `genius/search` | Song/lyrics search |
| Douban | `douban/search`, `douban/movie`, `douban/movie-hot`, `douban/movie-top`, `douban/top250`, `douban/comments` | Douban (豆瓣) movies — search, details, rankings, Top 250, reviews |
| Qidian | `qidian/search` | Qidian (起点中文网) novel search |

### 💼 Jobs & Career

| Platform | Commands | Description |
|----------|----------|-------------|
| BOSS Zhipin | `boss/search`, `boss/detail` | BOSS直聘 job search & JD details |
| LinkedIn | `linkedin/profile`, `linkedin/search` | LinkedIn profile & post search |

### 💰 Finance

| Platform | Commands | Description |
|----------|----------|-------------|
| Eastmoney | `eastmoney/stock`, `eastmoney/news` | 东方财富 stock quotes & financial news |
| Yahoo Finance | `yahoo-finance/quote` | Stock quotes (AAPL, TSLA, etc.) |

### 📱 Digital & Products

| Platform | Command | Description |
|----------|---------|-------------|
| GSMArena | `gsmarena/search` | Phone specs search |
| Product Hunt | `producthunt/today` | Today's top products |

### 📚 Knowledge & Reference

| Platform | Commands | Description |
|----------|----------|-------------|
| Wikipedia | `wikipedia/search`, `wikipedia/summary` | Search & page summaries |
| Zhihu | `zhihu/me`, `zhihu/hot`, `zhihu/question`, `zhihu/search` | 知乎 — user info, trending, Q&A, search |
| Open Library | `openlibrary/search` | Book search |

### 🌐 Lifestyle & Travel

| Platform | Command | Description |
|----------|---------|-------------|
| Youdao | `youdao/translate` | 有道翻译 — translation & dictionary |
| Ctrip | `ctrip/search` | 携程 — destination & attraction search |

### 🗨️ Social Apps

| Platform | Commands | Description |
|----------|----------|-------------|
| Jike | `jike/feed`, `jike/search` | 即刻 — recommended feed & search |
| Xiaohongshu | `xiaohongshu/me`, `xiaohongshu/feed`, `xiaohongshu/search`, `xiaohongshu/note`, `xiaohongshu/comments`, `xiaohongshu/user_posts` | 小红书 — full support via Pinia store actions |

> All Xiaohongshu (小红书) adapters use **Pinia Store Actions** — calling the page's own Vue store functions, which go through the complete signing + interceptor chain. Zero reverse engineering needed.

## Usage Examples

```bash
# Search the web
bb-browser site google/search "bb-browser"
bb-browser site duckduckgo/search "Claude Code"

# Social media
bb-browser site twitter/search "claude code"
bb-browser site twitter/tweets plantegg
bb-browser site reddit/thread https://reddit.com/r/programming/comments/...
bb-browser site weibo/hot

# Tech research
bb-browser site github/repo epiral/bb-browser
bb-browser site hackernews/top 10
bb-browser site stackoverflow/search "python async await"
bb-browser site arxiv/search "large language model"
bb-browser site npm/search "react state management"

# Entertainment
bb-browser site youtube/transcript dQw4w9WgXcQ
bb-browser site bilibili/search 编程
bb-browser site douban/top250

# Finance
bb-browser site yahoo-finance/quote AAPL
bb-browser site eastmoney/stock 贵州茅台

# Jobs
bb-browser site boss/search "AI agent"
bb-browser site linkedin/search "AI agent"

# Translate
bb-browser site youdao/translate hello
```

## Writing a Site Adapter

Run `bb-browser guide` for the full development workflow, or read [SKILL.md](SKILL.md).

```javascript
/* @meta
{
  "name": "platform/command",
  "description": "What this adapter does",
  "domain": "www.example.com",
  "args": {
    "query": {"required": true, "description": "Search query"}
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

## Contributing

```bash
# Option A: with gh CLI
gh repo fork epiral/bb-sites --clone
cd bb-sites && git checkout -b feat-mysite
# add adapter files
git push -u origin feat-mysite
gh pr create

# Option B: with bb-browser (no gh needed)
bb-browser site github/fork epiral/bb-sites
git clone https://github.com/YOUR_USER/bb-sites && cd bb-sites
git checkout -b feat-mysite
# add adapter files
git push -u origin feat-mysite
bb-browser site github/pr-create epiral/bb-sites --title "feat(mysite): add adapters" --head "YOUR_USER:feat-mysite"
```

## Private Adapters

Put private adapters in `~/.bb-browser/sites/`. They override community adapters with the same name.

```
~/.bb-browser/
├── sites/          # Your private adapters (priority)
│   └── internal/
│       └── deploy.js
└── bb-sites/       # This repo (bb-browser site update)
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
    ├── ...          # 35 platform directories
    └── qidian/
```
