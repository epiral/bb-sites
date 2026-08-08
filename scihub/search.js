/* @meta
{
  "name": "scihub/search",
  "description": "Sci-Hub 学术文献搜索 (Search academic papers via Sci-Hub Google Scholar mirror)",
  "domain": "sci-hub.org.cn",
  "args": {
    "query": {"required": true, "description": "Search query (keywords, title, or DOI)"},
    "count": {"required": false, "description": "Number of results (default 10, max 20)"}
  },
  "readOnly": true,
  "example": "bb-browser site scihub/search \"machine learning water treatment\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query', hint: 'Provide a search query string'};

  // Check if running on sci-hub domain
  if (!location.hostname.includes('sci-hub.org.cn')) {
    return {error: 'Not on sci-hub.org.cn domain', hint: 'Open a sci-hub.org.cn tab first: bb-browser open https://sci-hub.org.cn --tab'};
  }

  const num = Math.min(parseInt(args.count) || 10, 20);

  const url = '/scholar?q=' + encodeURIComponent(args.query);
  const resp = await fetch(url, {credentials: 'include', headers: {'Referer': location.href}});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Sci-Hub service may be unavailable'};

  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const results = [];
  const items = doc.querySelectorAll('.gs_ri');

  for (let i = 0; i < Math.min(items.length, num); i++) {
    const item = items[i];

    // Title
    const titleEl = item.querySelector('.gs_rt a');
    const title = titleEl ? titleEl.textContent.trim() : '';
    const href = titleEl ? titleEl.getAttribute('href') : '';

    // Authors / source info
    const authorsEl = item.querySelector('.gs_a');
    const authorsText = authorsEl ? authorsEl.textContent.trim() : '';

    // Parse authors, year, source from authors text
    // Format typically: "Author1, Author2… - Journal, Year - Publisher"
    // Note: uses \s+ to handle &nbsp; before the first dash
    let authors = '', year = '', source = '';
    if (authorsText) {
      const parts = authorsText.split(/\s+-\s+/);
      if (parts.length >= 2) {
        authors = parts[0].trim();
        const sourceYear = parts[1].trim();
        // Try to extract year from sourceYear
        const yearMatch = sourceYear.match(/(\d{4})/);
        if (yearMatch) year = yearMatch[1];
        source = sourceYear;
      }
      if (parts.length >= 3) {
        source = parts[1].trim();
        const pub = parts[2].trim();
        // Year is in parts[1] ("Journal, Year")
        const yearMatch = source.match(/(\d{4})/);
        if (yearMatch) year = yearMatch[1];
      }
    }

    // Abstract / snippet
    const snippetEl = item.querySelector('.gs_rs');
    const snippet = snippetEl ? snippetEl.textContent.trim() : '';

    // Download links (PDF, HTML)
    const downloadLinks = [];
    const parent = item.closest('.gs_r');
    if (parent) {
      const downloadEls = parent.querySelectorAll('.gs_ggsd a, .gs_or_ggsm a');
      downloadEls.forEach(a => {
        const text = a.textContent.trim();
        const link = a.getAttribute('href');
        if (link) {
          downloadLinks.push({
            type: text.includes('PDF') ? 'PDF' : (text.includes('HTML') ? 'HTML' : 'download'),
            text: text,
            url: link.startsWith('http') ? link : 'https://sci-hub.org.cn' + link
          });
        }
      });
    }

    // Citation count
    let citations = '';
    const citeEl = item.querySelector('a[href*="cites"]');
    if (citeEl) {
      const match = citeEl.textContent.match(/(\d+)/);
      if (match) citations = match[1];
    }

    results.push({
      title: title,
      url: href.startsWith('http') ? href : (href.startsWith('/') ? 'https://sci-hub.org.cn' + href : ''),
      authors: authors,
      year: year,
      source: source,
      snippet: snippet,
      citations: citations,
      downloads: downloadLinks
    });
  }

  return {
    query: args.query,
    count: results.length,
    results: results
  };
}
