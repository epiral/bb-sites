/* @meta
{
  "name": "unicloud/search",
  "description": "搜索 uniCloud 文档（使用站点内置 Algolia DocSearch 配置）",
  "domain": "doc.dcloud.net.cn",
  "args": {
    "query": "搜索关键词（必填；也可用 _input）",
    "count": "返回数量（默认 10）",
    "page": "Algolia 分页页码（默认 0）",
    "raw": "是否返回 Algolia 原始命中（默认 false）"
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site unicloud/search \"云函数\" --count 5"
}
*/

/**
 * bb-sites 入口：搜索文档。
 * @param {Record<string, any>} args CLI 参数
 * @returns {Promise<any>} 搜索结果
 */
async function(args) {
  // 重要：将 helper 内聚到函数体，避免顶层 const/let 导致 bb-browser 解析器报错。
  const BASE = 'https://doc.dcloud.net.cn/uniCloud/';

  async function fetchHomeHtml() {
    const resp = await fetch(BASE);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.text();
  }

  function extractAppJsUrl(homeHtml) {
    const re = /<script[^>]+src="([^"]+\/assets\/js\/app\.[^"]+?\.js)"[^>]*><\/script>/i;
    const m = homeHtml.match(re);
    if (!m) throw new Error('Failed to locate app.js in home HTML');
    return new URL(m[1], 'https://doc.dcloud.net.cn').toString();
  }

  async function fetchAppJs(appJsUrl) {
    const resp = await fetch(appJsUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.text();
  }

  function extractBalancedLiteral(text, anchorRe, openChar, closeChar) {
    const m = anchorRe.exec(text);
    if (!m) throw new Error('Anchor not found');
    const start = m.index + m[0].lastIndexOf(openChar);

    let i = start;
    let depth = 0;
    let quote = null;
    let escape = false;

    for (; i < text.length; i++) {
      const ch = text[i];

      if (quote) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\\\') {
          escape = true;
          continue;
        }
        if (ch === quote) quote = null;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        continue;
      }

      if (ch === openChar) depth++;
      if (ch === closeChar) {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }

    throw new Error('Unbalanced literal');
  }

  function evalLiteral(literal) {
    // eslint-disable-next-line no-new-func
    return Function('"use strict";return (' + literal + ')')();
  }

  async function getAlgoliaConfig() {
    const cache = globalThis.__UNICLOUD_DOC_CACHE || (globalThis.__UNICLOUD_DOC_CACHE = {});
    if (cache.algolia) return cache.algolia;

    const homeHtml = await fetchHomeHtml();
    const appJsUrl = extractAppJsUrl(homeHtml);
    cache.appJsUrl = appJsUrl;

    const appJsText = await fetchAppJs(appJsUrl);
    const literal = extractBalancedLiteral(appJsText, /algolia\s*:\s*\{/g, '{', '}');
    const cfg = evalLiteral(literal);

    const appId = cfg?.appId || cfg?.appID;
    const apiKey = cfg?.apiKey;
    const indexName = cfg?.indexName;
    if (!appId || !apiKey || !indexName) throw new Error('Algolia config missing required fields');

    cache.algolia = {appId, apiKey, indexName};
    return cache.algolia;
  }

  function stripTags(html) {
    return String(html || '').replace(/<[^>]*>/g, '');
  }

  function buildTitle(hit) {
    const h = hit?.hierarchy;
    if (!h || typeof h !== 'object') return hit?.title || hit?.name || '';
    const levels = ['lvl0', 'lvl1', 'lvl2', 'lvl3', 'lvl4', 'lvl5', 'lvl6'];
    const parts = [];
    for (const k of levels) {
      const v = h[k];
      if (v) parts.push(v);
    }
    return parts.join(' / ');
  }

  const query = (args.query || args._input || '').toString().trim();
  if (!query) return {error: 'Missing query parameter', hint: '用法：bb-browser site unicloud/search \"关键词\"'};

  const count = args.count === undefined ? 10 : Number(args.count);
  const page = args.page === undefined ? 0 : Number(args.page);
  const raw = String(args.raw || 'false') === 'true';

  try {
    const {appId, apiKey, indexName} = await getAlgoliaConfig();
    const url = `https://${appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexName)}/query`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Algolia-API-Key': apiKey,
        'X-Algolia-Application-Id': appId
      },
      body: JSON.stringify({query, hitsPerPage: count, page})
    });

    if (!resp.ok) {
      return {error: 'HTTP ' + resp.status, hint: 'Algolia 请求失败，可能站点配置已变更或被限流'};
    }

    const data = await resp.json();
    const hits = Array.isArray(data?.hits) ? data.hits : [];

    const filtered = hits.filter(h => {
      const u = h?.url_without_anchor || h?.url || '';
      return typeof u === 'string' && u.startsWith(BASE);
    });

    if (raw) {
      return {query, count: filtered.length, hits: filtered};
    }

    const results = filtered.map(h => {
      const u = h?.url || h?.url_without_anchor || '';
      const snippet =
        stripTags(h?._highlightResult?.content?.value) ||
        stripTags(h?._highlightResult?.hierarchy?.lvl2?.value) ||
        '';
      return {
        title: buildTitle(h),
        url: u,
        type: h?.type || '',
        snippet
      };
    });

    return {query, count: results.length, results};
  } catch (e) {
    return {
      error: String(e?.message || e),
      hint: '请确认站点可访问；若站点构建产物结构变更，需要更新 algolia 配置提取逻辑'
    };
  }
}
