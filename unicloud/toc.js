/* @meta
{
  "name": "unicloud/toc",
  "description": "获取 uniCloud 文档目录（从 VuePress 构建产物解析侧边栏）",
  "domain": "doc.dcloud.net.cn",
  "args": {
    "format": "输出格式：tree|flat（默认 tree）",
    "depth": "最大递归深度（默认 3；0 表示不限）",
    "includeExternal": "是否包含外链（默认 false）",
    "onlyPathsPrefix": "仅输出指定 path 前缀的分支（如 /uni-id/）"
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site unicloud/toc --format flat --depth 2"
}
*/

/**
 * bb-sites 入口：获取目录。
 * @param {Record<string, any>} args CLI 参数
 * @returns {Promise<any>} 结构化目录信息
 */
async function(args) {
  // 重要：bb-browser 的 site adapter 解析器通常要求文件仅包含一个 `async function(args) {}` 声明；
  // 因此将所有 helper 都内聚到该函数体内，避免出现顶层 const/let 导致语法错误。

  /**
   * uniCloud 文档根地址
   * @type {string}
   */
  const BASE = 'https://doc.dcloud.net.cn/uniCloud/';

  /**
   * 将输入规范化为可访问的文档 URL（支持 path/url/anchor）。
   * @param {string} input 输入的 path（如 cf-functions、/uni-id/summary）或绝对 URL
   * @returns {string} 规范化后的绝对 URL
   */
  function normalizeDocUrl(input) {
    const raw = (input || '').trim();
    if (!raw || raw === '/') return BASE;
    if (/^https?:\/\//i.test(raw)) return raw;

    const parts = raw.split('#');
    const pathPart = parts[0];
    const hashPart = parts[1];
    let p = (pathPart || '').trim();
    if (p.startsWith('/')) p = p.slice(1);

    let url = '';
    if (p.endsWith('/')) {
      url = BASE + p;
    } else if (p.endsWith('.html')) {
      url = BASE + p;
    } else {
      url = BASE + p + '.html';
    }

    if (hashPart) url += '#' + hashPart;
    return url;
  }

  /**
   * 获取 uniCloud 首页 HTML。
   * @returns {Promise<string>} 首页 HTML 文本
   */
  async function fetchHomeHtml() {
    const resp = await fetch(BASE);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.text();
  }

  /**
   * 从首页 HTML 中提取 VuePress app.*.js 的绝对 URL。
   * @param {string} homeHtml 首页 HTML
   * @returns {string} app.js 绝对 URL
   */
  function extractAppJsUrl(homeHtml) {
    const re = /<script[^>]+src="([^"]+\/assets\/js\/app\.[^"]+?\.js)"[^>]*><\/script>/i;
    const m = homeHtml.match(re);
    if (!m) throw new Error('Failed to locate app.js in home HTML');
    const src = m[1];
    return new URL(src, 'https://doc.dcloud.net.cn').toString();
  }

  /**
   * 拉取 app.js 文本内容。
   * @param {string} appJsUrl app.js 绝对 URL
   * @returns {Promise<string>} app.js 文本
   */
  async function fetchAppJs(appJsUrl) {
    const resp = await fetch(appJsUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.text();
  }

  /**
   * 从文本中找到 `anchor` 所在的对象字面量起点，并提取配对的完整片段。
   * - 内部实现会跳过字符串（单引号/双引号/反引号）中的括号，尽量降低误匹配。
   * @param {string} text 全文
   * @param {RegExp} anchorRe 用于定位起点的正则（应包含目标字面量的起始符号）
   * @param {'['|'{'} openChar 起始括号
   * @param {']'|'}'} closeChar 结束括号
   * @returns {string} 提取到的字面量（包含 openChar/closeChar）
   */
  function extractBalancedLiteral(text, anchorRe, openChar, closeChar) {
    const m = anchorRe.exec(text);
    if (!m) throw new Error('Anchor not found');
    const start = m.index + m[0].lastIndexOf(openChar);

    let i = start;
    let depth = 0;
    let quote = null; // "'" | '"' | "`"
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

  /**
   * 将字面量字符串安全执行为 JS 值（仅对从 bundle 中截取的小片段使用）。
   * @param {string} literal JS 字面量字符串（数组或对象）
   * @returns {any} 执行结果
   */
  function evalLiteral(literal) {
    // eslint-disable-next-line no-new-func
    return Function('"use strict";return (' + literal + ')')();
  }

  /**
   * 获取并缓存 sidebar 配置。
   * @returns {Promise<any>} sidebar 原始结构（预期为对象：{"/":[...], ...}）
   */
  async function getSidebar() {
    const cache = globalThis.__UNICLOUD_DOC_CACHE || (globalThis.__UNICLOUD_DOC_CACHE = {});
    if (cache.sidebar) return cache.sidebar;

    const homeHtml = await fetchHomeHtml();
    const appJsUrl = extractAppJsUrl(homeHtml);
    cache.appJsUrl = appJsUrl;

    const appJsText = await fetchAppJs(appJsUrl);
    const themeCfgIdx = appJsText.indexOf('themeConfig:{');
    const scopeText = themeCfgIdx >= 0 ? appJsText.slice(themeCfgIdx) : appJsText;
    const literal = extractBalancedLiteral(scopeText, /sidebar\s*:\s*\{/g, '{', '}');
    cache.sidebar = evalLiteral(literal);
    return cache.sidebar;
  }

  /**
   * 将 VuePress sidebar 的节点标准化为统一结构。
   * @param {any} node sidebar 节点
   * @returns {{title: string, path: string, url: string, children: any[]}} 标准化节点
   */
  function normalizeNode(node) {
    const title = (node && (node.title || node.text || node.name)) || '';
    const path = (node && (node.path || node.link || node.to)) || '';
    const children = Array.isArray(node?.children) ? node.children : [];
    return {
      title: title || (typeof path === 'string' ? path : ''),
      path: typeof path === 'string' ? path : '',
      url: typeof path === 'string' ? normalizeDocUrl(path) : '',
      children
    };
  }

  /**
   * 过滤与裁剪节点树。
   * @param {Array<any>} nodes 节点列表
   * @param {{depth:number, includeExternal:boolean, onlyPathsPrefix?:string}} options 选项
   * @param {number} level 当前层级（内部使用）
   * @returns {Array<any>} 处理后的节点树
   */
  function buildTree(nodes, options, level) {
    const maxDepth = Number.isFinite(options.depth) ? options.depth : 3;
    const nextLevel = level + 1;
    const onlyPrefix = (options.onlyPathsPrefix || '').trim();

    const out = [];

    for (const raw of nodes || []) {
      const n = normalizeNode(raw);
      const isExternal = /^https?:\/\//i.test(n.path);

      if (!options.includeExternal && isExternal) continue;

      if (onlyPrefix && !isExternal) {
        const p = n.path.startsWith('/') ? n.path : '/' + n.path;
        if (!p.startsWith(onlyPrefix)) {
          const keptChildren = buildTree(n.children, options, nextLevel);
          if (keptChildren.length > 0) out.push({...n, children: keptChildren});
          continue;
        }
      }

      let children = [];
      if (maxDepth === 0 || nextLevel <= maxDepth) {
        children = buildTree(n.children, options, nextLevel);
      }

      out.push({...n, children});
    }

    return out;
  }

  /**
   * 将树结构展开为扁平列表，附带 level 与 breadcrumb。
   * @param {Array<any>} nodes 树节点
   * @param {Array<string>} breadcrumb 面包屑（内部使用）
   * @param {number} level 当前层级（内部使用）
   * @returns {Array<any>} 扁平列表
   */
  function flattenTree(nodes, breadcrumb, level) {
    const out = [];
    for (const n of nodes || []) {
      const bc = breadcrumb.concat([n.title]).filter(Boolean);
      out.push({
        title: n.title,
        path: n.path,
        url: n.url,
        level,
        breadcrumb: bc.join(' / ')
      });
      if (n.children?.length) {
        out.push(...flattenTree(n.children, bc, level + 1));
      }
    }
    return out;
  }

  try {
    const format = (args.format || 'tree').toString();
    const depth = args.depth === undefined ? 3 : Number(args.depth);
    const includeExternal = String(args.includeExternal || 'false') === 'true';
    const onlyPathsPrefix = (args.onlyPathsPrefix || '').toString();

    const sidebar = await getSidebar();

    // VuePress sidebar 既可能是数组，也可能是对象（按路径前缀分组）
    /** @type {Array<any>} */
    let rootNodes = [];
    if (Array.isArray(sidebar)) {
      rootNodes = sidebar;
    } else if (sidebar && typeof sidebar === 'object') {
      for (const k of Object.keys(sidebar)) {
        const v = sidebar[k];
        if (Array.isArray(v)) rootNodes.push(...v);
      }
    } else {
      return {error: 'Unexpected sidebar format', hint: 'VuePress 构建产物结构可能已变更'};
    }

    const tree = buildTree(rootNodes, {depth, includeExternal, onlyPathsPrefix}, 1);

    if (format === 'flat') {
      const items = flattenTree(tree, [], 1);
      return {format: 'flat', count: items.length, items};
    }

    return {format: 'tree', count: tree.length, tree};
  } catch (e) {
    return {
      error: String(e?.message || e),
      hint: '请确认站点可访问；若站点构建结构变更，需要更新 app.js 提取逻辑'
    };
  }
}
