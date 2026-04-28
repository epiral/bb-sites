/* @meta
{
  "name": "wsj/frontpage",
  "description": "WSJ print edition front page articles by date",
  "domain": "www.wsj.com",
  "args": {
    "date": {"required": true, "description": "Print edition date in YYYYMMDD or YYYY-MM-DD"},
    "count": {"required": false, "description": "Max results to return (default 30)"}
  },
  "readOnly": true,
  "example": "bb-browser site wsj/frontpage 20260428"
}
*/

async function(args) {
  const normalizeDate = value => {
    const raw = String(value || '').trim();
    if (/^\d{8}$/.test(raw)) return raw;
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[1] + m[2] + m[3] : '';
  };
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
  const mapArticles = (items, group) => items.map((item, index) => ({
    title: item.headline || '',
    subtitle: item.summary || '',
    time: item.timestamp || '',
    authors: normalizeAuthors(item.bylineData),
    url: cleanUrl(item.articleUrl || ''),
    section: item.flashline || '',
    group,
    position: index + 1,
    image: item.imageUrl || ''
  })).filter(x => x.title && x.url);
  const dedupeByUrlAndTitle = items => {
    const seen = new Set();
    return items.filter(item => {
      const key = item.url + '|' + item.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const date = normalizeDate(args.date || args._ || args[0]);
  if (!date) return {error: 'Missing or invalid argument: date', hint: 'Use YYYYMMDD or YYYY-MM-DD, for example 20260428'};
  const count = Math.min(parseInt(args.count) || 30, 80);
  const path = '/print-edition/' + date + '/frontpage';

  const resp = await fetch(path, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, date, hint: 'Make sure the print edition date exists and wsj.com is accessible'};

  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pageProps = readNextData(doc)?.props?.pageProps || {};
  const articles = mapArticles(pageProps.articles || [], 'front_page');
  const deduped = dedupeByUrlAndTitle(articles).slice(0, count);

  return {
    source: 'WSJ Print Edition',
    date,
    issueDate: pageProps.issueDate || date,
    updatedTime: pageProps.updatedDatetimeUTC || '',
    url: 'https://www.wsj.com' + path,
    count: deduped.length,
    articles: deduped,
    hint: deduped.length ? undefined : 'No front page articles found in Next data'
  };
}
