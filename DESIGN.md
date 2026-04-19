# Site Adapter 设计哲学

> 你不是在写爬虫，你是在为 Agent 打开一扇窗。

## 第零原理：你是客人

Site adapter 在浏览器 tab 里通过 `eval` 执行。你的代码运行在别人建造的房子里 —— 用着他们的 Cookie、他们的 JS 运行时、他们的网络身份。

这不是限制，这是优势。

因为这意味着：**站点已经解决了所有难题**。认证、签名、反爬、速率限制 —— 站点为了让自己的前端正常工作，已经把这些全部处理好了。你的工作不是重新解决这些问题，而是复用它们的解决方案。

## 身份即域名

浏览器安全模型的核心：**你是谁 = 你在哪个域名**。

`@meta.domain` 是 adapter 最重要的一行配置。它决定了：

| 你的 domain | 决定了 |
|---|---|
| Cookie | 你能带什么凭证 |
| 同源策略 | 你能 fetch 什么 |
| JS 上下文 | 你能调用什么函数 |
| CSP | 你被允许做什么 |

```
✓  domain: "www.google.com"  →  fetch("/search?q=...")     ← 同源，带 Cookie
✗  domain: "www.google.com"  →  fetch("https://bing.com")  ← 跨域，被拦截
```

**绝对 URL 是最常见的 adapter 故障根因。** 不是代码逻辑错了，是身份搞错了。fetch 一个完整 URL 意味着你在告诉浏览器："我要以 google.com 的身份去访问 bing.com" —— 浏览器不会允许。

推论：**永远用相对路径**，除非目标 API 明确开放了 CORS（`Access-Control-Allow-Origin: *`）。

推论：**域名重定向是隐形杀手**。`zzk.cnblogs.com` 静默重定向到 `zzkx.cnblogs.com`，你的 domain 配置瞬间失效。在浏览器里实际打开 URL，看最终落在哪个域名。

推论：**子域名是独立身份**。`www.smzdm.com` 和 `search.smzdm.com` 是两个不同的身份。如果站点的搜索 API 在子域名上（`search.smzdm.com/ajax/`），你的 domain 就应该是 `search.smzdm.com`，不是 `www.smzdm.com`。同域 fetch 需要身份完全匹配。

## 网站的三层结构

每个网站都有三层。你的 adapter 要决定接入哪一层。

```
┌────────────────────────────────┐
│  Presentation  （DOM / HTML）   │  ← 最不稳定，HTML 改版就挂
├────────────────────────────────┤
│  Transport  （Headers / Auth）  │  ← 需要理解认证机制
├────────────────────────────────┤
│  Data  （API / JSON）           │  ← 最稳定，API 是契约
└────────────────────────────────┘
```

**接入越深，越稳定。** 优先级：

### 1. 调用站点自己的代码（最优）

站点的前端已经知道怎么调自己的 API —— 它封装了签名、处理了分页、容错了异常。你直接调用它的函数，等于复用了它全部的工程努力。

```javascript
// 小红书：调用 Pinia store 的 action
const searchStore = pinia._s.get('search');
searchStore.searchNotes();  // 签名、加密、分页全在里面
```

**适用场景**：Vue + Pinia/Vuex 的 SPA。用 eval 探测 `__vue_app__` 是否存在。

**陷阱：`globalThis` 缓存。** 如果你把 helper 函数缓存在 `globalThis` 上（小红书 adapter 的做法），更新 adapter 代码后浏览器 tab 不刷新就会继续用旧版本。解决方式：在 tab 里执行 `delete globalThis.__yourHelper` 或刷新页面。这是"代码改了但行为没变"的第一排查方向。

### 2. 直接调用 API（次优）

如果你能找到站点的 API endpoint，直接调用比解析 DOM 稳定得多。API 是前后端之间的契约，不会因为 UI 改版而变。

```javascript
// Dev.to：公开的 Algolia API，CORS 开放
fetch('https://xxx-dsn.algolia.net/1/indexes/Article_production/query', {
  method: 'POST',
  body: JSON.stringify({ query, hitsPerPage: '20' })
});
```

**判断方法**：`bb-browser network requests --filter "api" --with-body` 抓包。

### 3. 解析服务端渲染的 HTML（保底）

只有当站点是 SSR（服务端渲染）、数据已经在 HTML 里时，才用 DOM 解析。

```javascript
// Google：SSR，结果在初始 HTML 中
const doc = new DOMParser().parseFromString(html, 'text/html');
doc.querySelectorAll('[data-snc]').forEach(container => { ... });
```

**判断方法**：fetch 页面后看 HTML 里有没有数据。如果只有空壳和 `<div id="app">`，那是 CSR，不要解析 DOM。

### 决策流

```
fetch HTML → 里面有数据？
  → 有：SSR → 解析 DOM（相对路径 fetch）
  → 没有：CSR → 找 API
      → API 有 CORS？
          → 有：直接 fetch API
          → 没有：从 tab 内 fetch（相对路径）
              → 有签名/加密？
                  → 没有：直接 fetch + 带 Cookie
                  → 有：调用站点 JS 函数（Pinia store / Webpack module）
```

## 反爬不是 Bug

Cloudflare Turnstile、滑块验证、probe.js —— 这些不是你能"修"的技术问题。它们是**信任关系**。

浏览器通过 Cookie 维持一个"被信任的会话"。反爬系统验证这个会话是由人类建立的。你的 adapter 借用的就是这份信任。

当信任过期或被撤销时，你无法用代码重新获取它。你需要人类来重新建立。

所以正确做法是三件事：

```javascript
// 1. 检测
if (html.includes('请完成人机验证') || doc.querySelector('.cf-turnstile')) {

// 2. 报告（给 Agent 可执行的修复路径）
  return {
    error: 'Anti-bot verification required',
    hint: 'Open the site in browser and complete verification',
    action: 'bb-browser open https://example.com'
  };
}

// 3. 不要对抗（没有 bypass 尝试）
```

## 响应设计：为 Agent 而非人类

你的数据消费者是 AI Agent。Agent 和人类读数据的方式根本不同：

| | 人类 | Agent |
|---|---|---|
| 消费方式 | 肉眼扫描，跳着看 | 整段注入 context window |
| 成本瓶颈 | 时间（人在等） | Token（context 容量有限） |
| 决策模式 | 一次看完再决定 | 先看索引，再看详情 |

由此推导：

**搜索结果是调度决策，不是阅读材料。** 返回刚好够 Agent 判断"要不要深入看"的信息：标题、摘要、ID、URL。不要返回全文、大图 URL、冗余字段。

```javascript
// 好 — Agent 能快速判断 + 拿 ID 去调详情
return { id: '2604.15282', title: '...', abstract: '...前100字', url: '...' };

// 差 — 浪费 token 在 Agent 不需要的信息上
return { id: '2604.15282', title: '...', abstract: '...全文2000字',
         cover_url: 'https://...300字的CDN链接', author_avatar: '...' };
```

**搜索结果的每个字段都要能直接用于下一步操作。** 如果某个字段不能当参数传给后续命令、也不能帮 Agent 做决策，不要返回它。

**真实案例：toutiao hot 的 URL 字段。** 优化前每条 URL 800+ 字符（充满 tracking 参数），20 条就 16KB。优化后清洗成 `https://www.toutiao.com/trending/{id}/`，50 字符。一个 `cleanUrl()` 函数省了 82% 的响应体积。类似的 token 黑洞：CDN 图片 URL、base64 缩略图、冗余 ID 字段。

**两阶段模式：搜索 → 详情。** 小红书是标准范例：`search` 返回 note_id + xsec_token + 标题 + 点赞数（Agent 做决策），`note` 用这些字段获取全文内容。搜索不返回正文，正文在详情里。这样 Agent 搜 20 条只花 9KB，而不是 200KB。

## 逆向的技艺

逆向不是黑客行为。你只是在理解一个系统的公开接口。

### 从表象到本质

```
你看到页面上的搜索结果
  → 它是怎么出现在那里的？
    → 是 HTML 里就有？（SSR）
    → 还是 JS 后来填的？（CSR）
      → JS 从哪拿的数据？
        → 是 fetch 了一个 API？
          → 这个 API 需要什么认证？
            → Cookie 够了？
            → 需要额外 Header？
            → 需要请求签名？
```

### 观察的工具

```bash
# 看它做了什么
bb-browser network requests --filter "api" --with-body

# 看它是什么框架
bb-browser eval "(()=>{
  const vue3 = !!document.querySelector('#app')?.__vue_app__;
  const react = !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const nextjs = !!window.__NEXT_DATA__;
  return JSON.stringify({vue3, react, nextjs});
})()"

# 看它有什么 store
bb-browser eval "(()=>{
  const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
  if (!pinia) return 'no pinia';
  const stores = [];
  pinia._s.forEach((store, id) => stores.push(id));
  return stores;
})()"
```

### 验证的顺序

先证明数据能拿到，再写 adapter：

```bash
# 1. 在 tab 里试 fetch（相对路径）
bb-browser eval "(async()=>{
  const r = await fetch('/api/search?q=test', {credentials:'include'});
  return {ok: r.ok, status: r.status};
})()"

# 2. 能拿到 → 看返回格式
bb-browser eval "(async()=>{
  const r = await fetch('/api/search?q=test', {credentials:'include'});
  const d = await r.json();
  return {keys: Object.keys(d), sample: JSON.stringify(d).substring(0, 500)};
})()"

# 3. 写 adapter → 测试
bb-browser site platform/command args
```

## 错误的三层结构

每个错误都要有三个层次的信息：

```json
{
  "error": "HTTP 401",
  "hint": "需要先登录，请在浏览器中打开 example.com",
  "action": "bb-browser open https://example.com"
}
```

- **error** — 给 Agent 判断是否可自动修复（技术描述）
- **hint** — 给人类理解发生了什么（自然语言）
- **action** — 给 Agent 尝试自动修复的命令（可执行）

Agent 先看 `error` 判断能否自动处理，再看 `action` 尝试修复，最后把 `hint` 转达给人类。

## Meta 描述格式

`@meta.description` 是 Agent 匹配 adapter 的搜索词。用双语格式让中英文搜索都能命中：

```
{中文动作} ({English keywords}: {核心返回字段})
```

```javascript
// 好 — Agent 搜 "stock" 或 "股票" 都能找到
"description": "东方财富股票行情 (stock quote: price, change%, volume)"

// 差 — Agent 搜 "stock quote" 找不到
"description": "获取东方财富网股票实时行情"
```

## 检查清单

写完一个 adapter 后，过一遍：

- [ ] `@meta.domain` 是浏览器实际落地的域名（打开 URL 确认，注意重定向和子域名）
- [ ] 所有 fetch 用相对路径（除非目标有 CORS 头）
- [ ] SSR 站点 → DOM 解析，CSR 站点 → API/JS 函数
- [ ] 有反爬检测逻辑，返回 error + hint + action
- [ ] 搜索结果精简（无大图 URL、无全文、无冗余字段、无 tracking 参数）
- [ ] 每个返回字段要么能当参数、要么帮 Agent 做决策
- [ ] 搜索和详情分两阶段（搜索只返回索引，详情才返回全文）
- [ ] 错误有三层（error / hint / action）
- [ ] description 用双语格式（中文 + English keywords + 字段名）
- [ ] 如果用了 `globalThis` 缓存 helper，更新后需要清缓存或刷新 tab
