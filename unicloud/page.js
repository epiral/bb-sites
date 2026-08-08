/* @meta
{
  "name": "unicloud/page",
  "description": "抓取 uniCloud 文档单页并提取正文（支持 text/html 输出）",
  "domain": "doc.dcloud.net.cn",
  "args": {
    "url": "页面绝对 URL（可选）",
    "path": "文档 path（如 cf-functions、/uni-id/summary，可选）",
    "format": "输出格式：text|html（默认 text）",
    "withToc": "是否返回本页导读（默认 true）",
    "maxChars": "format=text 时最大字符数（默认 20000）"
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site unicloud/page cf-functions"
}
*/

/**
 * bb-sites 入口：抓取页面。
 * @param {Record<string, any>} args CLI 参数
 * @returns {Promise<any>} 页面内容
 */
async function(args) {
  // 重要：将 helper 内聚到函数体，避免顶层 const/let 导致 bb-browser 解析器报错。
  const BASE = 'https://doc.dcloud.net.cn/uniCloud/';

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
    if (p.endsWith('/')) url = BASE + p;
    else if (p.endsWith('.html')) url = BASE + p;
    else url = BASE + p + '.html';

    if (hashPart) url += '#' + hashPart;
    return url;
  }

  function decodeEntities(s) {
    const str = String(s || '');
    const named = {
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'"
    };
    let out = str.replace(/&(nbsp|amp|lt|gt|quot);|&#39;/g, m => named[m] || m);
    out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    out = out.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
    return out;
  }

  function extractTitle(html) {
    const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return '';
    return decodeEntities(m[1].trim()).replace(/\s+/g, ' ');
  }

  function extractContentHtml(html) {
    const text = String(html || '');
    const re = /<div[^>]*class="[^"]*\btheme-default-content\b[^"]*\bcontent__default\b[^"]*"[^>]*>/i;
    const m = re.exec(text);
    if (!m) throw new Error('Failed to locate page content container');

    const startIndex = m.index;
    let endIndex = text.indexOf('<footer class="page-edit"', startIndex);
    if (endIndex < 0) endIndex = text.indexOf('</main>', startIndex);
    if (endIndex < 0) endIndex = Math.min(text.length, startIndex + 200000);

    const contentHtml = text.slice(startIndex, endIndex);
    return {contentHtml, startIndex, endIndex};
  }

  function extractPageToc(html, pageUrl) {
    const text = String(html || '');
    const idx = text.indexOf('vuepress-toc');
    if (idx < 0) return [];

    const start = Math.max(0, text.lastIndexOf('<div', idx) - 50);
    const slice = text.slice(start, Math.min(text.length, start + 60000));

    const out = [];
    const re = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(slice))) {
      const href = m[1];
      const label = decodeEntities(String(m[2] || '').replace(/<[^>]*>/g, '').trim());
      if (!href || !label) continue;
      const u = new URL(href, pageUrl).toString();
      out.push({text: label, url: u});
      if (out.length >= 50) break;
    }
    return out;
  }

  function htmlToText(contentHtml, pageUrl) {
    let s = String(contentHtml || '');

    s = s.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, inner) => {
      const code = decodeEntities(String(inner || '').replace(/<[^>]*>/g, ''));
      return '\n```\n' + code.replace(/\n{3,}/g, '\n\n') + '\n```\n';
    });

    s = s.replace(/<h([2-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl, inner) => {
      const level = Number(lvl);
      const hashes = '#'.repeat(Math.max(2, Math.min(6, level)));
      const t = decodeEntities(String(inner || '').replace(/<[^>]*>/g, '').trim());
      return '\n' + hashes + ' ' + t + '\n';
    });

    s = s.replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
      const t = decodeEntities(String(inner || '').replace(/<[^>]*>/g, '').trim());
      if (!t) return '';
      const abs = new URL(href, pageUrl).toString();
      return t + ' (' + abs + ')';
    });

    s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) => {
      const t = decodeEntities(String(inner || '').replace(/<[^>]*>/g, '').trim());
      return t ? '`' + t + '`' : '';
    });

    s = s.replace(/<\/p>\s*/gi, '\n\n');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/li>\s*/gi, '\n');
    s = s.replace(/<li[^>]*>/gi, '- ');

    s = s.replace(/<[^>]*>/g, '');
    s = decodeEntities(s);

    s = s.replace(/\r/g, '');
    s = s.replace(/[ \t]+\n/g, '\n');
    s = s.replace(/\n{3,}/g, '\n\n');
    s = s.replace(/[ \t]{2,}/g, ' ');

    return s.trim();
  }

  const input = (args.url || args.path || args._input || '').toString().trim();
  if (!input) return {error: 'Missing url/path parameter', hint: '用法：bb-browser site unicloud/page cf-functions'};

  const format = (args.format || 'text').toString();
  const withToc = String(args.withToc === undefined ? 'true' : args.withToc) === 'true';
  const maxChars = args.maxChars === undefined ? 20000 : Number(args.maxChars);

  const pageUrl = normalizeDocUrl(input);

  const resp = await fetch(pageUrl);
  if (!resp.ok) return {error: 'HTTP ' + resp.status, url: pageUrl};
  const html = await resp.text();

  const title = extractTitle(html);

  let contentHtml = '';
  try {
    contentHtml = extractContentHtml(html).contentHtml;
  } catch (e) {
    return {error: String(e?.message || e), url: pageUrl, hint: '页面结构可能变更，无法定位正文容器'};
  }

  const pageToc = withToc ? extractPageToc(html, pageUrl) : [];

  if (format === 'html') {
    return {title, url: pageUrl, contentHtml, pageToc};
  }

  const text = htmlToText(contentHtml, pageUrl);
  const truncated = Number.isFinite(maxChars) && maxChars > 0 && text.length > maxChars;
  const contentText = truncated ? text.slice(0, maxChars) : text;

  return {title, url: pageUrl, truncated, contentText, pageToc};
}
