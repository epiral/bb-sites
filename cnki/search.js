/* @meta
{
  "name": "cnki/search",
  "description": "中国知网(CNKI)学术文献搜索 (Search academic papers on CNKI)",
  "domain": "kns.cnki.net",
  "args": {
    "query": {"required": true, "description": "搜索关键词 (Search keywords)"},
    "count": {"required": false, "description": "返回结果数量 (default 10, max 20)"},
    "type": {"required": false, "description": "文献类型: ALL|期刊|博硕士|会议|报纸 (default ALL)"}
  },
  "capabilities": ["search"],
  "readOnly": true,
  "example": "bb-browser site cnki/search \"水处理工艺\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query', hint: 'Provide search keywords'};

  // Domain check
  if (!location.hostname.includes('cnki.net')) {
    return {error: 'Not on cnki.net domain', hint: 'Open a CNKI tab first: bb-browser open https://kns.cnki.net --tab'};
  }

  const count = Math.min(parseInt(args.count) || 10, 20);
  const query = args.query.trim();

  // CNKI search URL for kns8s interface
  const searchUrl = '/kns8s/defaultresult/index?crossids=YSTT4HG0,LSTPFY1C,JUP3MUPD,MPMFIG1A,WQ0UVIAA,BLZOG7CK,EMRPGLPA,PWFIRAGL,NLBO1Z6R,NN3FJMUV&korder=SU&kw=' + encodeURIComponent(query);

  let html = '';
  try {
    const resp = await fetch(searchUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': location.href
      }
    });
    if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'CNKI service may be unavailable'};
    html = await resp.text();
  } catch (e) {
    return {error: 'Failed to fetch: ' + e.message, hint: 'Make sure a CNKI tab is open and logged in'};
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Check if we got a verification/captcha page
  const title = doc.querySelector('title');
  if (title && (title.textContent.includes('验证') || title.textContent.includes('Verification'))) {
    return {error: 'Security verification required', hint: 'Please complete the verification on the CNKI tab first'};
  }

  // Try multiple selector strategies for CNKI result items
  const results = [];

  // Strategy 1: kns8s new interface - result items
  // Typical structure: table rows or div containers with class containing "result"
  const itemSelectors = [
    '.result-table-list tbody tr',
    '.result-list .item',
    '.search-result-list .result-item',
    '.c_table tbody tr',
    '.result-list li',
    '.article-list .item',
    '[class*="result"] tbody tr',
    '[class*="result-list"] > div',
    '[class*="result-list"] > li'
  ];

  let items = [];
  for (const sel of itemSelectors) {
    items = doc.querySelectorAll(sel);
    if (items.length > 0) break;
  }

  // Strategy 2: Look for links that look like paper titles
  if (items.length === 0) {
    // Fallback: find all links that might be paper titles
    const allLinks = doc.querySelectorAll('a');
    const paperLinks = [];
    for (const a of allLinks) {
      const href = a.getAttribute('href') || '';
      const text = a.textContent.trim();
      // CNKI paper links typically contain these patterns
      if ((href.includes('dbcode=') || href.includes('filename=') || href.includes('/kcms/')) && text.length > 8) {
        paperLinks.push(a);
      }
    }
    items = paperLinks;
  }

  for (let i = 0; i < Math.min(items.length, count); i++) {
    const item = items[i];

    // Extract title - try multiple selectors
    let title = '';
    let titleHref = '';
    const titleSelectors = [
      'a.title',
      '.title a',
      'a[class*="title"]',
      'h3 a',
      'h2 a',
      'a[target="_blank"]',
      'td a',
      'a'
    ];
    for (const sel of titleSelectors) {
      const el = item.querySelector ? item.querySelector(sel) : null;
      if (el) {
        const text = el.textContent.trim();
        if (text.length > 3) {
          title = text;
          titleHref = el.getAttribute('href') || '';
          break;
        }
      }
    }

    // If item itself is a link (fallback strategy)
    if (!title && item.tagName === 'A') {
      title = item.textContent.trim();
      titleHref = item.getAttribute('href') || '';
    }

    if (!title) continue;

    // Extract authors
    let authors = '';
    const authorSelectors = [
      '.author',
      '.author-info',
      '[class*="author"]',
      '.source_info',
      '.source'
    ];
    for (const sel of authorSelectors) {
      const el = item.querySelector ? item.querySelector(sel) : null;
      if (el) {
        const text = el.textContent.trim();
        if (text.length > 0) { authors = text; break; }
      }
    }

    // Extract source (journal/conference)
    let source = '';
    let year = '';
    const sourceSelectors = [
      '.source',
      '.source-name',
      '.journal',
      '[class*="source"]',
      '[class*="journal"]'
    ];
    for (const sel of sourceSelectors) {
      const el = item.querySelector ? item.querySelector(sel) : null;
      if (el) {
        const text = el.textContent.trim();
        if (text.length > 0) { source = text; break; }
      }
    }

    // Try to extract year from source or item text
    if (!year) {
      const yearMatch = (source || item.textContent || '').match(/(\d{4})/);
      if (yearMatch) year = yearMatch[1];
    }

    // Extract citation count
    let citations = '';
    const citeSelectors = [
      '.cite-count',
      '[class*="cite"]',
      '.count',
      '.cited'
    ];
    for (const sel of citeSelectors) {
      const el = item.querySelector ? item.querySelector(sel) : null;
      if (el) {
        const text = el.textContent.trim();
        const match = text.match(/(\d+)/);
        if (match) { citations = match[1]; break; }
      }
    }

    // Extract abstract/snippet
    let snippet = '';
    const snippetSelectors = [
      '.abstract',
      '.abstract-info',
      '.summary',
      '.snippet',
      '[class*="abstract"]',
      'p'
    ];
    for (const sel of snippetSelectors) {
      const el = item.querySelector ? item.querySelector(sel) : null;
      if (el) {
        const text = el.textContent.trim();
        if (text.length > 20) { snippet = text; break; }
      }
    }

    // Build full URL
    let url = '';
    if (titleHref) {
      if (titleHref.startsWith('http')) {
        url = titleHref;
      } else if (titleHref.startsWith('/')) {
        url = 'https://kns.cnki.net' + titleHref;
      } else {
        url = 'https://kns.cnki.net/' + titleHref;
      }
    }

    results.push({
      title: title,
      url: url,
      authors: authors,
      year: year,
      source: source,
      citations: citations,
      snippet: snippet.substring(0, 300)
    });
  }

  return {
    query: query,
    count: results.length,
    results: results,
    note: 'CNKI results depend on your institutional access. Some full-text links may require login.'
  };
}
