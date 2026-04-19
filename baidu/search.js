/* @meta
{
  "name": "baidu/search",
  "description": "百度搜索 (Baidu search: title, url, snippet)",
  "domain": "www.baidu.com",
  "args": {
    "query": {"required": true, "description": "Search query"},
    "count": {"required": false, "description": "Number of results (default 10)"}
  },
  "readOnly": true,
  "example": "bb-browser site baidu/search \"Claude Code\""
}
*/

async function(args) {
  const query = args.query;
  if (!query) return {error: 'query is required'};
  const count = args.count || 10;

  const url = 'https://www.baidu.com/s?wd=' + encodeURIComponent(query) + '&rn=' + count;
  const resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status};

  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const containers = doc.querySelectorAll('div.result, div.c-container');
  const results = [];

  containers.forEach(el => {
    const titleEl = el.querySelector('h3 a') || el.querySelector('a[href]');
    if (!titleEl) return;

    const title = (titleEl.textContent || '').trim();
    if (!title) return;

    const href = titleEl.getAttribute('href') || '';

    let snippet = '';
    const snippetCandidates = [
      'span.content-right_8Zs40',
      '.c-abstract',
      '.c-span-last',
      'span[class*="content-right"]',
      'div[class*="abstract"]',
      'span[class*="content"]',
      '.c-row .c-span9',
      'p'
    ];
    for (const sel of snippetCandidates) {
      const snippetEl = el.querySelector(sel);
      if (snippetEl) {
        const text = (snippetEl.textContent || '').trim();
        if (text && text.length > 10) { snippet = text; break; }
      }
    }
    if (!snippet) {
      const textContent = el.textContent || '';
      const titleText = title;
      const remaining = textContent.replace(titleText, '').trim();
      if (remaining.length > 20) snippet = remaining.substring(0, 300);
    }

    results.push({
      title: title,
      url: href,
      snippet: snippet.substring(0, 300)
    });
  });

  return {
    query: query,
    count: results.length,
    results: results
  };
}
