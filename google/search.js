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

  // Navigate to search URL and parse rendered DOM instead of fetching HTML
  // (Google returns different HTML for programmatic fetch vs browser navigation)
  const url = '/search?q=' + encodeURIComponent(args.query) + '&num=' + num;
  const resp = await fetch(url, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Make sure a google.com tab is open'};
  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Try multiple selectors — Google changes DOM structure frequently
  const results = [];

  // Strategy 1: h3 elements with parent anchor (most reliable)
  const headings = doc.querySelectorAll('h3');
  headings.forEach(h3 => {
    const anchor = h3.closest('a') || h3.parentElement?.querySelector('a[href]');
    if (!anchor) return;
    const link = anchor.getAttribute('href');
    if (!link || link.startsWith('/search') || link.startsWith('#')) return;

    // Find snippet: walk up to the result container and grab text
    let snippet = '';
    // Go up to find the result container (typically 3-5 levels up from h3)
    let container = h3;
    for (let i = 0; i < 5; i++) {
      container = container.parentElement;
      if (!container) break;
      // Check if this container has enough text content beyond the heading
      const allText = container.textContent || '';
      if (allText.length > h3.textContent.length + 50) {
        // Extract text excluding the heading
        const clone = container.cloneNode(true);
        const cloneH3 = clone.querySelector('h3');
        if (cloneH3) cloneH3.remove();
        // Remove cite/url elements
        clone.querySelectorAll('cite').forEach(c => c.remove());
        const remaining = clone.textContent.trim();
        if (remaining.length > 30) {
          snippet = remaining.substring(0, 300);
          break;
        }
      }
    }

    // Fallback: look for spans with substantial text in nearby elements
    if (!snippet) {
      const parent = h3.closest('[data-ved]') || h3.parentElement?.parentElement?.parentElement;
      if (parent) {
        const spans = parent.querySelectorAll('span');
        for (const sp of spans) {
          const txt = sp.textContent.trim();
          if (txt.length > 40 && txt !== h3.textContent.trim()) {
            snippet = txt;
            break;
          }
        }
      }
    }

    results.push({
      title: h3.textContent.trim(),
      url: link.startsWith('/url?q=') ? decodeURIComponent(link.split('/url?q=')[1].split('&')[0]) : link,
      snippet: snippet
    });
  });

  // Deduplicate by URL
  const seen = new Set();
  const unique = results.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  return {query: args.query, count: unique.length, results: unique};
}
