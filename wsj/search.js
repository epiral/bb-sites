/* @meta
{
  "name": "wsj/search",
  "description": "WSJ news search",
  "domain": "www.wsj.com",
  "args": {
    "query": {"required": true, "description": "Search query"},
    "count": {"required": false, "description": "Max results to return (default 20)"}
  },
  "readOnly": true,
  "example": "bb-browser site wsj/search Trump"
}
*/

async function(args) {
  const readNextData = doc => {
    try {
      const el = doc.querySelector('#__NEXT_DATA__');
      return el ? JSON.parse(el.textContent) : null;
    } catch (e) {
      return null;
    }
  };
  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const cleanUrl = url => {
    if (!url) return '';
    try {
      const u = new URL(url, 'https://www.wsj.com');
      return u.origin + u.pathname;
    } catch (e) {
      return url;
    }
  };
  const normalizeAuthors = bylineData => {
    if (!Array.isArray(bylineData)) return [];
    const seen = new Set();
    return bylineData
      .map(x => x?.name || (x?.type === 'author' ? x.text : ''))
      .filter(Boolean)
      .filter(name => !seen.has(name) && seen.add(name));
  };
  const firstLongText = (root, exclude) => {
    for (const el of root.querySelectorAll('p, [class*="summary"], [class*="description"]')) {
      const value = text(el);
      if (value.length > 20 && value !== exclude) return value;
    }
    return '';
  };

  if (!args.query) return {error: 'Missing argument: query', hint: 'Provide a search query string'};
  const count = Math.min(parseInt(args.count) || 20, 50);
  const path = '/search?query=' + encodeURIComponent(args.query) + '&mod=searchresults_viewallresults';

  const resp = await fetch(path, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Make sure a wsj.com tab is open and accessible'};

  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pageProps = readNextData(doc)?.props?.pageProps || {};
  const rows = pageProps.searchResults || [];

  if (rows.length > 0) {
    const results = rows.slice(0, count).map(item => ({
      title: item.headline || '',
      subtitle: item.summary || '',
      time: item.timestamp || '',
      authors: normalizeAuthors(item.bylineData),
      url: cleanUrl(item.articleUrl || ''),
      section: item.flashline || item.seoPathValue || '',
      printHeadline: item.printHeadline || '',
      printPublicationDate: item.printPublicationDate || '',
      image: item.imageUrl || ''
    })).filter(x => x.title && x.url);
    const entity = pageProps.searchEntityResult ? {
      label: pageProps.searchEntityResult.label || '',
      type: pageProps.searchEntityResult.type || '',
      url: cleanUrl(pageProps.searchEntityResult.url || ''),
      ctaText: pageProps.searchEntityResult.ctaText || ''
    } : null;
    return {query: args.query, source: 'WSJ', url: 'https://www.wsj.com' + path, total: pageProps.resultsCountMeta || '', entity, count: results.length, results};
  }

  const results = [];
  const seen = new Set();
  doc.querySelectorAll('article, li, div').forEach(node => {
    if (results.length >= count) return;
    const a = node.querySelector?.('a[href*="wsj.com"], a[href^="/"]');
    if (!a) return;
    const title = text(node.querySelector('h2,h3,h4') || a);
    const url = cleanUrl(a.href || a.getAttribute('href') || '');
    if (!title || !url || seen.has(url)) return;
    seen.add(url);
    results.push({title, subtitle: firstLongText(node, title), time: node.querySelector('time')?.getAttribute('datetime') || text(node.querySelector('time')), authors: [], url});
  });
  return {query: args.query, source: 'WSJ', count: results.length, results};
}
