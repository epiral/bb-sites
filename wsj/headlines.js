/* @meta
{
  "name": "wsj/headlines",
  "description": "WSJ latest headlines",
  "domain": "www.wsj.com",
  "args": {
    "count": {"required": false, "description": "Max results to return (default all)"}
  },
  "readOnly": true,
  "example": "bb-browser site wsj/headlines 20"
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

  const resp = await fetch('/news/latest-headlines?mod=wsjheader', {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Make sure a wsj.com tab is open and accessible'};

  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = readNextData(doc)?.props?.pageProps?.latestHeadlines || [];
  const count = args.count ? Math.min(parseInt(args.count) || rows.length, rows.length) : rows.length;

  const headlines = rows.slice(0, count).map(item => ({
    title: item.headline || '',
    subtitle: item.summary || '',
    time: item.timestamp || '',
    authors: normalizeAuthors(item.bylineData),
    url: cleanUrl(item.articleUrl || ''),
    section: item.flashline || '',
    type: item.type || '',
    image: item.imageUrl || ''
  })).filter(x => x.title && x.url);

  return {
    source: 'WSJ',
    url: 'https://www.wsj.com/news/latest-headlines?mod=wsjheader',
    count: headlines.length,
    headlines,
    hint: rows.length ? undefined : 'No latestHeadlines found in Next data'
  };
}
