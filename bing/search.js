/* @meta
{
  "name": "bing/search",
  "description": "Bing 搜索 (Bing search: title, url, snippet)",
  "domain": "www.bing.com",
  "args": {
    "query": {"required": true, "description": "Search query"},
    "count": {"required": false, "description": "Number of results (default 10)"}
  },
  "readOnly": true,
  "example": "bb-browser site bing/search \"Claude Code\""
}
*/

async function(args) {
  const query = args.query;
  if (!query) return {error: 'query is required'};
  const count = args.count || 10;

  const url = '/search?q=' + encodeURIComponent(query) + '&count=' + count;
  const resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Make sure a bing.com tab is open'};

  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const items = doc.querySelectorAll('li.b_algo');
  const results = [];
  items.forEach(li => {
    const anchor = li.querySelector('h2 > a');
    if (!anchor) return;
    const title = anchor.textContent.trim();
    const href = anchor.getAttribute('href') || '';
    const snippet = (li.querySelector('p') || {}).textContent || '';
    results.push({title, url: href, snippet: snippet.trim()});
  });

  return {query, count: results.length, results};
}
