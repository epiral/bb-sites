/* @meta
{
  "name": "scihub/doi",
  "description": "通过 DOI 在 Sci-Hub 搜索论文（返回论文元信息和可用下载链接）",
  "domain": "sci-hub.org.cn",
  "args": {
    "doi": {"required": true, "description": "Paper DOI (e.g., 10.1016/j.watres.2023.120123)"}
  },
  "readOnly": true,
  "example": "bb-browser site scihub/doi 10.1016/j.watres.2023.120123"
}
*/

async function(args) {
  if (!args.doi) return {error: 'Missing argument: doi', hint: 'Provide a DOI string'};

  // Check if running on sci-hub domain
  if (!location.hostname.includes('sci-hub.org.cn')) {
    return {error: 'Not on sci-hub.org.cn domain', hint: 'Open a sci-hub.org.cn tab first: bb-browser open https://sci-hub.org.cn --tab'};
  }

  const doi = args.doi.trim();
  // Replace slashes with spaces to avoid URL routing issues on this mirror
  const searchQuery = doi.replace(/\//g, ' ');

  const searchUrl = '/scholar?q=' + encodeURIComponent(searchQuery);
  let html = '';
  try {
    const resp = await fetch(searchUrl, {
      credentials: 'include',
      headers: {
        'Referer': location.href
      }
    });
    if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Sci-Hub service may be unavailable'};
    html = await resp.text();
  } catch (e) {
    return {error: 'Failed to fetch: ' + e.message, hint: 'Make sure a sci-hub.org.cn tab is open'};
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Check if redirected to login page
  const titleEl = doc.querySelector('title');
  if (titleEl && titleEl.textContent.includes('登录')) {
    return {
      error: 'Login required for DOI lookup on this Sci-Hub mirror',
      hint: 'This mirror (sci-hub.org.cn) requires login for some searches. Try: bb-browser site scihub/search "paper title"',
      doi: doi
    };
  }

  const items = doc.querySelectorAll('.gs_ri');
  if (items.length === 0) {
    return {
      error: 'No results found for DOI: ' + doi,
      hint: 'Try searching by paper title instead: bb-browser site scihub/search "your paper title"',
      doi: doi
    };
  }

  // Skip the first item if it's an ad
  let startIndex = 0;
  const firstTitle = items[0].querySelector('.gs_rt a');
  if (firstTitle && firstTitle.textContent.includes('AcadGo')) startIndex = 1;

  if (startIndex >= items.length) {
    return {error: 'No valid results found for DOI: ' + doi, doi: doi};
  }

  const item = items[startIndex];

  // Title
  const titleLink = item.querySelector('.gs_rt a');
  const title = titleLink ? titleLink.textContent.trim() : '';
  const href = titleLink ? titleLink.getAttribute('href') : '';

  // Authors / source info
  const authorsEl = item.querySelector('.gs_a');
  const authorsText = authorsEl ? authorsEl.textContent.trim() : '';

  let authors = '', year = '', source = '';
  if (authorsText) {
    const parts = authorsText.split(/\s+-\s+/);
    if (parts.length >= 2) {
      authors = parts[0].trim();
      const sourceYear = parts[1].trim();
      const yearMatch = sourceYear.match(/(\d{4})/);
      if (yearMatch) year = yearMatch[1];
      source = sourceYear;
    }
    if (parts.length >= 3) {
      source = parts[1].trim();
      const yearMatch = source.match(/(\d{4})/);
      if (yearMatch) year = yearMatch[1];
    }
  }

  // Abstract / snippet
  const snippetEl = item.querySelector('.gs_rs');
  const snippet = snippetEl ? snippetEl.textContent.trim() : '';

  // Download links - only external open-access links
  const downloadLinks = [];
  const parent = item.closest('.gs_r');
  if (parent) {
    const downloadEls = parent.querySelectorAll('.gs_ggsd a, .gs_or_ggsm a');
    downloadEls.forEach(a => {
      const text = a.textContent.trim();
      const link = a.getAttribute('href');
      if (link && !text.includes('全文下载') && !text.includes('发起求助') && !text.includes('加入待读')) {
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

  return {
    doi: doi,
    title: title,
    url: href.startsWith('http') ? href : (href.startsWith('/') ? 'https://sci-hub.org.cn' + href : ''),
    authors: authors,
    year: year,
    source: source,
    snippet: snippet,
    citations: citations,
    downloads: downloadLinks,
    note: 'This Sci-Hub mirror requires login for full-text download. Open-access links are provided when available.'
  };
}
