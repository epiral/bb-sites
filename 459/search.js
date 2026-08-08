/* @meta
{
  "name": "459/search",
  "description": "459.org 学术文献搜索/DOI解析 (Search or resolve paper by DOI/title on 459.org)",
  "domain": "459.org",
  "args": {
    "query": {"required": true, "description": "DOI, PMID, article title, or publisher URL"},
    "count": {"required": false, "description": "Number of results (default 5, max 10)"}
  },
  "readOnly": true,
  "example": "bb-browser site 459/search \"10.1126/science.aaa8415\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query', hint: 'Provide a DOI, PMID, article title, or publisher URL'};

  // Domain check
  if (!location.hostname.includes('459.org')) {
    return {error: 'Not on 459.org domain', hint: 'Open a 459.org tab first: bb-browser open http://www.459.org --tab'};
  }

  const query = args.query.trim();
  const count = Math.min(parseInt(args.count) || 5, 10);

  // Check if input is a DOI
  const doiPattern = /^10\.\d{4,}\/.+/;
  const isDoi = doiPattern.test(query);

  // If DOI, use direct resolution
  if (isDoi) {
    const url = '/' + encodeURIComponent(query);
    let html = '';
    try {
      const resp = await fetch(url, {
        credentials: 'include',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': location.href
        }
      });
      if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Paper not found or Sci-Hub service unavailable'};
      html = await resp.text();
    } catch (e) {
      return {error: 'Failed to fetch: ' + e.message, hint: 'Make sure a 459.org tab is open'};
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Check for verification page
    if (html.includes('Checking your browser') || html.includes('DDoS-Guard')) {
      return {error: 'Security verification required', hint: 'Please complete the browser verification on the 459.org tab first'};
    }

    // Extract PDF link using multiple strategies
    let pdfUrl = '';

    const embed = doc.querySelector('embed[src]');
    const iframe = doc.querySelector('iframe[src]');
    if (embed) pdfUrl = embed.getAttribute('src');
    else if (iframe) pdfUrl = iframe.getAttribute('src');

    if (!pdfUrl) {
      const links = doc.querySelectorAll('a[href]');
      for (const a of links) {
        const href = a.getAttribute('href');
        if (href && (href.endsWith('.pdf') || href.includes('.pdf?'))) {
          pdfUrl = href;
          break;
        }
      }
    }

    if (!pdfUrl) {
      const scripts = doc.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        const match = text.match(/location\.\w+\s*[=]\s*['"]([^'"]*\.pdf[^'"]*)['"]/);
        if (match) { pdfUrl = match[1]; break; }
      }
    }

    // Resolve relative URLs
    if (pdfUrl && !pdfUrl.startsWith('http')) {
      if (pdfUrl.startsWith('//')) pdfUrl = 'https:' + pdfUrl;
      else if (pdfUrl.startsWith('/')) pdfUrl = 'http://www.459.org' + pdfUrl;
      else pdfUrl = 'http://www.459.org/' + pdfUrl;
    }

    const titleEl = doc.querySelector('h1, h2, #title, .title');
    const title = titleEl ? titleEl.textContent.trim() : '';

    if (!pdfUrl) {
      return {
        error: 'Could not extract PDF for DOI: ' + query,
        hint: 'The paper may not be available in Sci-Hub database',
        doi: query,
        title: title || undefined
      };
    }

    return {
      doi: query,
      title: title || undefined,
      pdfUrl: pdfUrl,
      note: 'PDF link resolved. Open the URL to download the paper.',
      warning: 'This mirror may not be an official Sci-Hub domain. Use at your own risk.'
    };
  }

  // Not a DOI - try to search via Sci-Hub's search form if available
  // Most Sci-Hub mirrors accept non-DOI queries via POST or GET to root
  const searchUrl = '/?q=' + encodeURIComponent(query);
  let html = '';
  try {
    const resp = await fetch(searchUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': location.href
      }
    });
    if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Search failed'};
    html = await resp.text();
  } catch (e) {
    return {error: 'Failed to search: ' + e.message};
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Check for verification page
  if (html.includes('Checking your browser') || html.includes('DDoS-Guard')) {
    return {error: 'Security verification required', hint: 'Please complete the browser verification first'};
  }

  // Try to find multiple results (if Sci-Hub returns a list)
  const results = [];
  const items = doc.querySelectorAll('.result, .item, .paper, [class*="result"], [class*="item"]');

  for (let i = 0; i < Math.min(items.length, count); i++) {
    const item = items[i];
    const titleLink = item.querySelector('a');
    if (!titleLink) continue;

    const title = titleLink.textContent.trim();
    const href = titleLink.getAttribute('href') || '';

    let pdfUrl = '';
    const pdfLink = item.querySelector('a[href*=".pdf"]');
    if (pdfLink) pdfUrl = pdfLink.getAttribute('href');

    results.push({
      title: title,
      url: href.startsWith('http') ? href : (href.startsWith('/') ? 'http://www.459.org' + href : 'http://www.459.org/' + href),
      pdfUrl: pdfUrl || undefined
    });
  }

  if (results.length > 0) {
    return {
      query: query,
      count: results.length,
      results: results,
      note: 'Search results from Sci-Hub.su'
    };
  }

  // If no structured results, check if we got a single paper page
  const embed = doc.querySelector('embed[src]');
  const iframe = doc.querySelector('iframe[src]');
  if (embed || iframe) {
    const pdfSrc = embed ? embed.getAttribute('src') : iframe.getAttribute('src');
    const titleEl = doc.querySelector('h1, h2, #title, .title');
    return {
      query: query,
      note: 'Sci-Hub resolved the query to a single paper',
      title: titleEl ? titleEl.textContent.trim() : undefined,
      pdfUrl: pdfSrc && !pdfSrc.startsWith('http') ? (pdfSrc.startsWith('//') ? 'https:' + pdfSrc : 'http://www.459.org' + pdfSrc) : pdfSrc,
      warning: 'This mirror may not be an official Sci-Hub domain. Use at your own risk.'
    };
  }

  // No results found
  return {
    error: 'No results found for query: ' + query,
    hint: 'Sci-Hub primarily supports DOI lookups. Try searching for the DOI on Google Scholar or PubMed first, then use: bb-browser site scihub-su/doi <DOI>',
    query: query
  };
}
