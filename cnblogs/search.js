/* @meta
{
  "name": "cnblogs/search",
  "description": "博客园技术文章搜索",
  "domain": "zzkx.cnblogs.com",
  "args": {
    "query": {"required": true, "description": "Search query"},
    "page": {"required": false, "description": "Page number (default 1)"}
  },
  "readOnly": true,
  "example": "bb-browser site cnblogs/search \"Python\""
}
*/

async function(args) {
  const query = args.query;
  if (!query) return {error: 'query is required'};
  const page = args.page || 1;

  const url = '/s?w=' + encodeURIComponent(query) + '&p=' + page;
  const resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status};

  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  if (html.includes('请完成人机验证') || html.includes('拖动滑块完成拼图')) {
    return {error: 'Anti-bot verification required', hint: 'Open zzkx.cnblogs.com in bb-browser and complete the slider captcha, then retry', action: 'bb-browser open https://zzkx.cnblogs.com'};
  }

  const items = doc.querySelectorAll('.searchItem');
  const results = [];

  items.forEach(item => {
    const titleEl = item.querySelector('.searchItemTitle a');
    if (!titleEl) return;

    const title = (titleEl.textContent || '').trim();
    if (!title) return;

    const href = titleEl.getAttribute('href') || '';

    const authorEl = item.querySelector('.searchItemInfo-userName a');
    const author = authorEl ? (authorEl.textContent || '').trim() : '';

    const snippetEl = item.querySelector('.searchCon');
    const snippet = snippetEl ? (snippetEl.textContent || '').trim() : '';

    const dateEl = item.querySelector('.searchItemInfo-publishDate');
    const date = dateEl ? (dateEl.textContent || '').trim() : '';

    const viewEl = item.querySelector('.searchItemInfo-views');
    const views = viewEl ? (viewEl.textContent || '').trim() : '';

    results.push({
      title: title,
      url: href,
      author: author,
      snippet: snippet.substring(0, 300),
      date: date,
      views: views
    });
  });

  return {
    query: query,
    page: page,
    count: results.length,
    results: results
  };
}
