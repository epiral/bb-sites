# Jike：Following Feed Adapter 抓包与适配经验（2026-04-20）

## 背景

目标：为 `bb-browser` 的 Jike 站点增加 Following（关注流）adapter，用于抓取 `https://web.okjike.com/following` 的 feed。

实现中出现过一次失败：adapter 返回 `Failed to fetch following feed`（并提示 “api endpoint may have changed”）。

本文件沉淀这次排查与修复过程，以及可复用的方法论，并给出“抓取指定用户动态（如 @卫诗婕）”的后续打法。

## 第一次失败：根因是什么

根因：**请求了错误的接口**。

第一次实现时，为了尽快跑通逻辑，使用了“经验猜测”的候选接口列表（例如 `.../followingFeed/list`、`.../followingUpdates/list`、`.../timeline/list`）。这些接口并不是 Web 端 Following 页面实际发起的接口，因此全部尝试失败后触发兜底错误。

为什么会踩坑：

- 即刻的 feed / timeline 类接口在不同端（Web / App）与不同版本之间可能不一致；
- “关注流”并不一定存在一个直观的 `followingFeed/*` endpoint；
- 不抓包就写 adapter，本质是在赌 API 结构与参数命名。

## 第二次修复成功：为什么能修好

修复成功的关键：**回到事实来源——抓包确认 Web 端真实请求**。

在 `https://web.okjike.com/following` 页面，通过 Network 抓包确认 Web 端实际请求为：

- `POST https://api.ruguoapp.com/1.0/personalUpdate/followingUpdates`
- body 示例：`{"limit":20}`
- response：`data: [...]` 且包含 `loadMoreKey`（用于分页）

随后在 adapter 中：

- 将 `.../personalUpdate/followingUpdates` 作为首选 endpoint
- 保留先前猜测 endpoint 作为 fallback（应对未来变更）
- 输出结构统一映射为 `posts`，并将 `loadMoreKey` 透传给下一页

验证：`bb-browser site jike/following` 可以正常返回关注流数据。

## 可复用经验：写私有 Web API adapter 的通用打法

### 1）不要猜 endpoint：先抓包

只要是“私有 API + feed/时间线/分页”这种高变更面场景，优先顺序应为：

1. 打开目标页面（例如 `/following`）
2. Network 过滤 `api.ruguoapp.com`（或目标 API 域）
3. 找到关键 XHR（通常是 POST list/getUpdates 类接口）
4. 记录“可复刻的最小请求”：URL、method、headers、body、分页字段、响应结构

### 2）先做“最小闭环”再扩展

推荐先验证一个最小请求能拿到数据：

- `limit=1` 或 `limit=2`
- 只做必要字段映射
- 确认响应结构稳定后再完善图片、topic、repost 等字段

### 3）明确分页协议并透传

常见分页字段：

- `loadMoreKey`（可能是 object）
- `cursor` / `sinceId` / `lastReadTime` / `lastPageEarliestTime`

adapter 需要：

- 把服务端返回的分页 token 原样返回给调用方
- 支持将该 token 作为下一次请求参数输入

### 4）认证先行：先确认 token 来源与 header 形式

这类接口通常依赖登录态：

- Web 端 token 可能在 `localStorage`（例如 `JK_ACCESS_TOKEN`）
- 请求常用 header：`x-jike-access-token`

先验证 token 获取与 header 拼装正确，再继续排查 endpoint/参数。

### 5）失败要可定位：保留 debug 信息

不要只给一句“可能 endpoint 变了”：

- 在 `debug=true` 时返回：最终命中的 endpoint、HTTP status、必要的 raw 响应片段（注意不要泄露敏感 token）
- 失败时返回：尝试过的 endpoint 列表与 lastErr（status/url）

这样下一次维护可以快速判断是权限问题、参数问题还是 endpoint 变更。

## 如果下次需求变成：抓取用户 @卫诗婕 的个人 feed，我会怎么做

以 Web 端为准，流程如下：

1. 打开用户主页（例如 `https://web.okjike.com/u/BD729810-9DDB-401E-B36E-A3467CF87610`）。
2. Network 过滤 `api.ruguoapp.com`，找到“个人动态列表”的 XHR：
   - 记录 endpoint、body 中的 user 标识（可能是 `username` / `userId`）
   - 记录分页字段与返回结构
3. 在 adapter 中复刻请求（带 `x-jike-access-token`），将返回映射成统一 `posts` 输出，并透传分页 token。
4. 设计入参：
   - 直接用 `username`（更稳定，避免二次查询）
   - 或提供 `screenName`（更友好，但通常需要额外查询把名字解析为 username/userId）
5. CLI 验证：
   - `bb-browser site jike/user-feed --username BD729810-... --limit 20`
   - 确认首屏、分页均可用

## 附：为什么第一次没有先抓包

第一次采取了“先写候选 endpoint 再验证”的快速尝试策略，目的是尽快跑通；但在私有 Web API 场景下，这种策略不稳，会导致：

- endpoint 命名与实际不一致 → 全部失败
- 参数/分页协议不一致 → 结构不匹配

这次之后的默认策略应该改为：**先抓包确定事实，再写 adapter**。

