# bbb — 搜狐号数据采集

基于 [bb-browser](https://github.com/epiral/bb-browser) 的搜狐号数据采集工具。

---

## bb-browser open

导航到指定页面。

```bash
bb-browser open <url>
```

**示例**

```bash
bb-browser open "https://mp.sohu.com/profile?xpt=MzEwNzhiYTEtYTZjNy00ZjMxLTk4YTUtMmQzYzNlODc0NjA4"
```

---

## bb-browser site sohu/user

获取搜狐号用户资料（从页面 SSR 数据提取，无需额外请求）。

```bash
bb-browser site sohu/user <xpt_or_url>
```

**参数**

| 参数 | 必填 | 说明 |
|------|------|------|
| `xpt_or_url` | ✅ | 纯 xpt 字符串，或包含 `?xpt=` 的完整 URL |

**示例**

```bash
# 纯 xpt
bb-browser site sohu/user ZTA4NmZiMWYtMTY1Mi00YzdlLWI0N2EtYzUzYmFmYzIwY2I5

# 完整 URL（PowerShell 用单引号避免 & 被解释）
bb-browser site sohu/user 'https://mp.sohu.com/profile?xpt=ZTA4...&spm=...'
```

**返回字段**

| 字段 | 说明 |
|------|------|
| `name` | 账号名称 |
| `avatar` | 头像 URL |
| `description` | 简介 |
| `reads` | 阅读数（搜狐无粉丝概念）|
| `article_count` | 内容数 |
| `subscribes` | 订阅数 |
| `likes` | 获赞数 |
| `verified_tag` | 认证标签，如"生活领域优质创作者" |
| `media_id` | 媒体 ID |
| `profile_url` | 主页 URL |

---

## bb-browser site sohu/user_posts

获取搜狐号近期文章列表，自动滚动加载直到满足停止条件。

**前置条件**：需先用 `bb-browser open` 打开目标页面。

```bash
bb-browser open "https://mp.sohu.com/profile?xpt=<xpt>"
bb-browser site sohu/user_posts <xpt_or_url> [days]
```

**参数**

| 参数 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `xpt_or_url` | ✅ | — | 纯 xpt 或完整 URL |
| `days` | ❌ | `90` | 采集近 N 天的文章 |

**停止条件（满足其一即停）**

- 页面出现"暂无更多内容"（已到底）
- 遇到发布日期早于 `days` 天前的文章

**示例**

```bash
# 先打开页面，再采集近 90 天文章
bb-browser open "https://mp.sohu.com/profile?xpt=MzEwNzhiYTEtYTZjNy00ZjMxLTk4YTUtMmQzYzNlODc0NjA4"
bb-browser site sohu/user_posts MzEwNzhiYTEtYTZjNy00ZjMxLTk4YTUtMmQzYzNlODc0NjA4

# 只取近 30 天
bb-browser site sohu/user_posts MzEwNzhiYTEtYTZjNy00ZjMxLTk4YTUtMmQzYzNlODc0NjA4 30
```

**返回字段**

| 字段 | 说明 |
|------|------|
| `count` | 文章总数 |
| `reached_end` | 是否已到底（`true`=到底，`false`=日期截止） |
| `articles[].id` | 文章 ID |
| `articles[].title` | 标题 |
| `articles[].url` | 文章链接 |
| `articles[].cover` | 封面图 URL |
| `articles[].published_at` | 发布日期（`YYYY-MM-DD`） |
| `articles[].reads` | 阅读数 |
| `articles[].comments` | 评论数 |
