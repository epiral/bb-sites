# bb-sites 开发指南

本文档教你（或 Agent）如何为一个新网站编写 site adapter。

## 核心流程

```
1. 逆向 API  →  用 bb-browser network --with-body 抓包
2. 选择方案  →  根据 API 复杂度选 fetch / eval+headers / pinia store
3. 写 adapter →  一个 JS 文件，放到对应平台目录
4. 测试      →  bb-browser site <name> [args]
5. 提交      →  PR 到 bb-sites 仓库
```

## Step 1: 逆向 API

### 1.1 启用网络监控

```bash
bb-browser network requests          # 启用监控（首次调用自动 enable）
bb-browser network clear             # 清空历史记录
```

### 1.2 触发目标操作

在浏览器里操作网站：导航到目标页面、滚动加载、点击按钮等。

```bash
bb-browser open "https://www.example.com/some-page" --tab current
bb-browser wait 3000
bb-browser scroll down 1000          # 触发懒加载
```

### 1.3 抓取 API 请求

```bash
# 查看所有 API 请求（过滤域名）
bb-browser network requests --filter "api.example.com" --with-body --json
```

关注这些字段：
- **url**: API endpoint 路径
- **method**: GET/POST
- **requestHeaders**: 需要什么认证头（Cookie? Bearer? X-s?）
- **requestBody**: POST 参数格式
- **responseBody**: 返回数据结构
- **mimeType**: 通常是 `application/json`

### 1.4 分析认证方式

对比 requestHeaders，确定认证复杂度：

| 看到的 headers | 认证方式 | 对应方案 |
|---------------|---------|---------|
| 无特殊 header，只有 Cookie | Cookie 自动带 | `fetch()` 直调 |
| Bearer Token + CSRF | 需手动构造 header | `eval` + 手动 header |
| X-s / X-t / 签名类 header | 请求签名 | pinia/vuex store 或 webpack 逆向 |
| 无认证 | 公开 API | `fetch()` 直调 |

### 1.5 发现页面框架

```bash
bb-browser eval "(()=>{
  const vue3 = !!document.querySelector('#app')?.__vue_app__;
  const vue2 = !!document.querySelector('#app')?.__vue__;
  const react = !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || !!document.querySelector('[data-reactroot]');
  const pinia = vue3 && !!document.querySelector('#app').__vue_app__.config.globalProperties.\$pinia;
  const vuex = vue3 && !!document.querySelector('#app').__vue_app__.config.globalProperties.\$store;
  const nextjs = !!window.__NEXT_DATA__;
  const nuxt = !!window.__NUXT__;
  return JSON.stringify({vue3, vue2, react, pinia, vuex, nextjs, nuxt});
})()"
```

如果有 pinia/vuex，可以进一步探索 store：

```bash
bb-browser eval "(()=>{
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.\$pinia;
  const stores = [];
  pinia._s.forEach((store, id) => {
    const actions = [];
    for (const k in store) {
      try { if (typeof store[k] === 'function' && !k.startsWith('\$') && !k.startsWith('_')) actions.push(k); } catch {}
    }
    stores.push({id, actions: actions.slice(0, 10)});
  });
  return JSON.stringify(stores, null, 2);
})()"
```

## Step 2: 选择方案

### Tier 1: `fetch()` 直调

**适用**: 有公开 API 或 Cookie 认证即可的网站（Reddit, GitHub, HN）

```javascript
async function(args) {
  const resp = await fetch('/api/endpoint', {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  return await resp.json();
}
```

`domain` 必须是实际执行和 `fetch()` 的 HTTPS host；不要跨域请求。若根路径
会跳到其他 origin，增加同域 `startPath` 作为稳定执行入口。

**判断标准**: 用 `bb-browser eval "fetch('/api/xxx', {credentials:'include'}).then(r=>r.json())"` 能直接拿到数据。

### Tier 2: `eval` + 手动 header

**适用**: 需要额外 header 但签名不复杂的网站（Twitter）

```javascript
async function(args) {
  const ct0 = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ct0='))?.split('=')[1];
  const resp = await fetch('/api/endpoint', {
    headers: {'Authorization': 'Bearer xxx', 'X-Csrf-Token': ct0},
    credentials: 'include'
  });
  return await resp.json();
}
```

**判断标准**: 从 `network --with-body` 抓到的 requestHeaders 里只需复制几个固定的 header。

### Tier 3: Pinia/Vuex Store

**适用**: 有复杂请求签名的 Vue 网站（小红书）

```javascript
async function(args) {
  const app = document.querySelector('#app')?.__vue_app__;
  const pinia = app?.config?.globalProperties?.$pinia;
  const store = pinia._s.get('storeName');

  // 临时拦截 XHR 抓 response
  let captured = null;
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u) { this.__url = u; return origOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(b) {
    if (this.__url?.includes('target-endpoint')) {
      const x = this;
      const orig = x.onreadystatechange;
      x.onreadystatechange = function() {
        if (x.readyState === 4 && !captured) { try { captured = JSON.parse(x.responseText); } catch {} }
        if (orig) orig.apply(this, arguments);
      };
    }
    return origSend.apply(this, arguments);
  };

  try {
    await store.someAction(args.param);
    await new Promise(r => setTimeout(r, 500));
  } finally {
    XMLHttpRequest.prototype.open = origOpen;
    XMLHttpRequest.prototype.send = origSend;
  }

  if (!captured?.success) return {error: captured?.msg || 'Failed'};
  return captured.data;
}
```

**判断标准**: `fetch()` 和手动 header 都不行（406/风控），但页面自己的请求能成功。且网站用 Vue+Pinia/Vuex。

### 方案选择决策树

```
fetch() 直接调能拿到数据？
  → 是 → Tier 1
  → 否 → 从 network --with-body 复制 headers 后 fetch 能拿到？
           → 是 → Tier 2
           → 否 → 网站是 Vue + Pinia/Vuex？
                    → 是 → Tier 3 (store action)
                    → 否 → 用 bb-browser 的 UI 操作(click/scroll) 触发
                            + network --with-body 读结果（手动流程，不做 adapter）
```

## Step 3: 写 Adapter

### 文件格式

```javascript
/* @meta
{
  "name": "platform/command",
  "description": "一句话描述",
  "domain": "www.example.com",
  "args": {
    "required_arg": {"required": true, "description": "说明"},
    "optional_arg": {"required": false, "description": "说明"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site platform/command value1"
}
*/

async function(args) {
  if (!args.required_arg) return {error: 'Missing argument: required_arg'};
  // ... 实现 ...
  return { /* 结构化数据 */ };
}
```

### 规范

- 一个文件一个操作
- 放在 `<platform>/` 目录下
- 错误返回 `{error: '描述', hint: '修复建议'}`
- 成功返回结构化 JSON（不要返回原始 HTML）
- 不要硬编码会变的值（webpack module ID 等）

## Step 4: 测试

```bash
# 更新本地 adapter
cp -r . ~/.bb-browser/bb-sites/

# 测试
bb-browser site platform/command arg1 arg2

# 或者直接 eval 测试 JS 函数
bb-browser eval "(async()=>{ /* 粘贴 adapter 代码 */ })()"
```

## Step 5: 提交

```bash
git add platform/command.js
git commit -m "feat(platform): add command adapter"
git push
# 然后在 GitHub 提 PR
```

## 实战案例

### 案例 1: Reddit（Tier 1, 最简单）

逆向过程：
```bash
bb-browser fetch "https://www.reddit.com/api/me.json" --json
# 直接返回数据 → Tier 1 fetch() 直调
```

### 案例 2: Twitter（Tier 2, 需要 header）

逆向过程：
```bash
bb-browser network requests --filter "graphql" --with-body --json
# 发现需要 Bearer + ct0 header → Tier 2
# ct0 从 document.cookie 读取
# Bearer token 是公开固定值
```

### 案例 3: 小红书（Tier 3, 签名）

逆向过程：
```bash
# 1. 抓包发现 X-s 签名 header
bb-browser network requests --filter "edith" --with-body --json

# 2. 直接 fetch → 406（签名缺失）
# 3. 复制 headers 手动签名 → 部分接口被风控
# 4. 发现 Vue+Pinia → 用 store action → 全通
```
