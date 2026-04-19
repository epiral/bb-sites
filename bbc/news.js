/* @meta
{
  "name": "bbc/news",
  "description": "BBC News headlines (RSS) or search",
  "domain": "www.bbc.com",
  "args": {
    "query": {"required": false, "description": "Search query. If omitted, returns top headlines from RSS feed"},
    "count": {"required": false, "description": "Max results to return (default 20)"}
  },
  "readOnly": true,
  "example": "bb-browser site bbc/news \"climate change\""
}
*/

async function(args) {
  const count = Math.min(parseInt(args.count) || 20, 50);

  if (!args.query) {
    const resp = await fetch('/news', {credentials: 'include'});
    if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Make sure a bbc.com tab is open'};
    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const headlines = [];
    const seen = new Set();
    doc.querySelectorAll('a[href*="/news/articles/"], a[href*="/news/live/"]').forEach(a => {
      if (headlines.length >= count) return;
      const href = a.getAttribute('href') || '';
      if (seen.has(href)) return;
      const heading = a.querySelector('h2, h3, span[role="text"]');
      const title = heading ? heading.textContent.trim() : a.textContent.trim();
      if (!title || title.length < 5) return;
      seen.add(href);
      const fullUrl = href.startsWith('http') ? href : 'https://www.bbc.com' + href;
      headlines.push({title, url: fullUrl});
    });
    return {source: 'BBC News', count: headlines.length, headlines};
  }

  const resp = await fetch('/search?q=' + encodeURIComponent(args.query), {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Make sure a bbc.com tab is open'};
  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const results = [];

  // BBC search results use various selectors; try common patterns
  // Pattern 1: search result links with data attributes or structured containers
  const links = doc.querySelectorAll('a[href]');
  const seen = new Set();
  links.forEach(a => {
    if (results.length >= count) return;
    const href = a.getAttribute('href') || '';
    // Only keep bbc.co.uk/news or bbc.com/news article links
    if (!(href.includes('/news/') || href.includes('/sport/') || href.includes('/reel/'))) return;
    if (!href.startsWith('http')) return;
    if (seen.has(href)) return;

    // Look for a heading or substantial text inside the anchor
    const heading = a.querySelector('h1, h2, h3, h4, span, p');
    const title = heading ? heading.textContent.trim() : a.textContent.trim();
    if (!title || title.length < 5) return;

    seen.add(href);

    // Try to find a sibling or parent description
    let description = '';
    const parent = a.closest('li, div, article');
    if (parent) {
      const pTags = parent.querySelectorAll('p');
      for (const p of pTags) {
        const txt = p.textContent.trim();
        if (txt.length > 20 && txt !== title) {
          description = txt.substring(0, 300);
          break;
        }
      }
    }

    results.push({title, description, url: href});
  });

  return {query: args.query, count: results.length, results};
}
