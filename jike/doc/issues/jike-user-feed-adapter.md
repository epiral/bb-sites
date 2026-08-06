---
title: "Jike: 无法稳定逆向 @user 的动态(feed)接口（bb-browser network 输出截断）"
date: "2026-04-20"
status: "blocked"
---

# 背景 / 目标

目标：为 `bb-sites/jike` 增加一个 adapter，用“用户名/昵称（@user-name）”拉取该用户主页的动态（feed）内容。

测试用例：`user-name = 卫诗婕`

# 已有基础（本仓库现状）

当前目录已有 adapter：

- `jike/feed`：推荐流（`POST https://api.ruguoapp.com/1.0/recommendFeed/list`）
- `jike/following`：关注流（尝试多个 endpoint）
- `jike/search`：搜索动态（`POST https://api.ruguoapp.com/1.0/search/integrate`，现有实现用 `type: ORIGINAL_POST`）

共同点：都从 `localStorage.getItem('JK_ACCESS_TOKEN')` 取 token，并以请求头 `x-jike-access-token` 调用 `api.ruguoapp.com`。

# 过程记录（按 /bb-sites 指南执行）

## 1) 确认登录态与 token 可用

尝试用 `bb-browser` 打开 `https://web.okjike.com` 并读取：

- `localStorage.getItem('JK_ACCESS_TOKEN')`

结果：能拿到 token（此处不记录明文，避免泄露）。

注意：最开始在当前 sandbox（`workspace-write`）下直接运行 `bb-browser` 会报错：

- `EROFS: read-only file system, open '/home/zhang/.bb-browser/browser/cdp-port'`

原因：`bb-browser` 默认会在 `~/.bb-browser` 写入浏览器状态文件，但该路径不在可写 roots，需要 escalated 权限后才能正常使用。

## 2) 将“昵称/用户名”解析为 user 对象（用于后续打开用户页/抓包）

用页面上下文直接调用：

- `POST https://api.ruguoapp.com/1.0/search/integrate`
- body：`{ keywords: "卫诗婕", type: "USER", limit: 5 }`

得到匹配项（节选）：

- `screenName`: 卫诗婕
- `id`: `5b731d7cfca5170017f50a23`
- `username`: `BD729810-9DDB-401E-B36E-A3467CF87610`

并用 `https://web.okjike.com/u/BD729810-9DDB-401E-B36E-A3467CF87610` 确认页面标题为“卫诗婕的主页 - 即刻”。

## 3) 试图通过 Network 抓包定位“用户动态(feed)”的 API endpoint

按指南流程做了多次组合尝试：

- `bb-browser network clear`
- `bb-browser open "https://web.okjike.com/u/<username>"`
- `bb-browser wait 2500~4000`
- `bb-browser network requests --with-body --filter ...`

尝试的 filter（示例）：

- `api.ruguoapp.com`
- `api.ruguoapp.com/1.0`
- `update`
- `personal`
- `/personalUpdate`

观察：

- profile 页会产生大量无关请求（socket.io、sentry、plausible、cdn 资源等），导致 `network requests` 输出很大。
- `bb-browser network requests --json` 输出会在 **65536 bytes** 被截断（本地用 `wc -c` 测到正好 `65536`），从而导致 JSON 不完整、无法 `JSON.parse`。

复现证据：

- `bb-browser network requests --json | wc -c` → `65536`
- `bb-browser network requests --json | node ... JSON.parse(...)` → 报错：
  - `Unterminated string in JSON at position 65536 (line 1 column 65537)`

结论：在 profile 页面这种请求量较大的场景下，靠 `bb-browser network requests` 的输出做结构化解析不稳定，因此无法可靠得到“用户动态”的 endpoint 与 request body。

## 4) 替代尝试：在页面上下文注入 fetch/XHR 记录器

为了绕过 network 输出截断，尝试在页面内覆盖：

- `window.fetch`
- `XMLHttpRequest.prototype.open/send`

将每次请求的 `{url, method, bodyPreview}` 记录到 `window.__bbCaptured`，然后通过 `bb-browser eval "window.__bbCaptured"` 取回。

并尝试通过点击/切换 tab 触发动态加载（例如“相册/动态”切换）。

结果：捕获到的仍然主要是 socket.io polling（`jike-io.ruguoapp.com/socket.io`），未捕获到明确的 `api.ruguoapp.com/1.0/...` “用户动态列表”请求。

推测原因之一：动态接口可能在首次加载时已被某种方式请求/缓存，或通过非标准通道/内部封装触发，单纯 tab click 未触发目标请求；也可能需要滚动触底触发“加载更多”。

## 5) 替代尝试：盲探常见 personalUpdate 端点（失败）

尝试猜测并探测可能的 endpoint（示例）：

- `https://api.ruguoapp.com/1.0/personalUpdate/single`（400）
- `https://api.ruguoapp.com/1.0/personalUpdate/list`（404）
- `https://api.ruguoapp.com/1.0/personalUpdate/userUpdates`（404）
- `https://api.ruguoapp.com/1.0/personalUpdate/userPosts`（404）
- `https://api.ruguoapp.com/1.0/personalUpdate/get`（404）

结论：靠猜 endpoint 不可行，需要从真实请求中提取。

# 当前卡点（Blocked）

1. `bb-browser network requests` 的输出存在固定长度截断（65,536 bytes），使得 profile 页抓包无法结构化解析，难以定位关键 endpoint。
2. filter 未能把输出压到足够小（或未命中目标请求），导致：
   - 要么无结果
   - 要么仍然过大并被截断
3. 通过页面内注入 fetch/XHR 记录器，目前只抓到 socket.io polling，没抓到用户动态接口。

# 下一步建议（可选方案）

## A) 改工具：让 network 输出可用

给 `bb-browser network requests` 增加至少一种能力（任一即可显著改善）：

- `--limit N`（限制返回条数）
- `--fields url,method,requestBody`（限制返回字段）
- `--since <seq>`（增量拉取）
- 输出到文件（避免 stdout 截断/限制），例如 `--out /tmp/req.json`

这样就能在不截断的情况下精确定位“用户动态”请求。

## B) 改逆向策略：手动 DevTools 定位一次 endpoint

在真实浏览器 DevTools（Network）中手动定位：

- profile 页“动态”列表请求的 URL + request body（尤其是 userId/username/loadMoreKey/limit）

拿到 endpoint 后，再回到 adapter 实现（很可能是 Tier 2：固定 header + body）。

## C) 继续页面内抓取：增加滚动/加载更多触发

在注入记录器后，自动执行：

- 多次 `scroll` 到页面底部
- 触发“加载更多”

并在 `__bbCaptured` 中筛选 `api.ruguoapp.com/1.0` 请求。

如果仍无请求，说明动态加载不通过 fetch/XHR（或被封装到别处），需要更深层 instrumentation（例如 hook `Request`/`Response` 或框架内部 client）。

# 安全注意事项

- 逆向/记录过程中会接触 `JK_ACCESS_TOKEN`，文档与日志中应避免写入明文 token。
- 如需在 issue 中提供证据，建议只记录响应状态码、endpoint、以及 body 的字段结构（不含敏感值）。

