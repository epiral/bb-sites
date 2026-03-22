/* @meta
{
  "name": "google/search",
  "description": "Google 搜索",
  "domain": "www.google.com",
  "args": {
    "query": {"required": true, "description": "Search query"},
    "count": {"required": false, "description": "Number of results (default 10)"}
  },
  "readOnly": true,
  "example": "bb-browser site google/search \"bb-browser\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query', hint: 'Provide a search query string'};
  const num = args.count || 10;
  const url = 'https://www.google.com/search?q=' + encodeURIComponent(args.query) + '&num=' + num;
  const resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Make sure a google.com tab is open'};
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Extract results structurally — no dependency on CSS class names.
  // Each organic result has an h3 (title) inside an <a> (link).
  // For each h3, walk up to find its result container (stops when parent has sibling results).
  const h3s = doc.querySelectorAll('h3');
  const results = [];
  for (const h3 of h3s) {
    const a = h3.closest('a');
    if (!a) continue;
    const link = a.getAttribute('href');
    if (!link || !link.startsWith('http')) continue;
    const title = h3.textContent.trim();
    // Walk up from the link to find the result container
    let container = a;
    while (container.parentElement && container.parentElement.tagName !== 'BODY') {
      const sibs = [...container.parentElement.children];
      if (sibs.filter(s => s.querySelector('h3')).length > 1) break;
      container = container.parentElement;
    }
    // Snippet: first substantial span outside the link block
    let snippet = '';
    const linkBlock = a.closest('div') || a;
    const spans = container.querySelectorAll('span');
    for (const sp of spans) {
      if (linkBlock.contains(sp)) continue;
      const t = sp.textContent.trim();
      if (t.length > 30 && t !== title) { snippet = t; break; }
    }
    results.push({title, url: link, snippet});
  }
  return {query: args.query, count: results.length, results};
}
